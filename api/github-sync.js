const REPOSITORIES = {
  'voidnont/nonthub': {
    repo: 'voidnont/NontHub',
    source: 'package.json',
    sourceType: 'package',
    fallbackVersion: '3.0.1',
    extensions: ['.msi', '.exe'],
  },
  'voidnont/nontmusic': {
    repo: 'voidnont/NontMusic',
    source: 'package.json',
    sourceType: 'package',
    fallbackVersion: '0.7.2',
    extensions: ['.exe', '.msi'],
  },
  'voidnont/veilbrowser': {
    repo: 'voidnont/veilbrowser',
    source: 'Cargo.toml',
    sourceType: 'cargo',
    fallbackVersion: '0.8.0',
    extensions: ['.exe', '.msi'],
  },
};

const REQUEST_TIMEOUT_MS = 8000;

function cleanVersion(value = '') {
  return String(value).trim().replace(/^v/i, '');
}

function packageType(name = '') {
  return name.split('.').pop()?.toLowerCase() || 'file';
}

function parseSourceVersion(text, type) {
  if (!text) return '';
  if (type === 'package') {
    try { return cleanVersion(JSON.parse(text).version || ''); } catch { return ''; }
  }
  const match = text.match(/^version\s*=\s*["']([^"']+)["']/m);
  return cleanVersion(match?.[1] || '');
}

function versionParts(value = '') {
  const match = cleanVersion(value).match(/\d+(?:\.\d+)*/);
  return match ? match[0].split('.').map((part) => Number.parseInt(part, 10)) : [];
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a.length || !b.length) return 0;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const x = a[index] || 0;
    const y = b[index] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nont.me-sync',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function githubJson(url) {
  const response = await fetchWithTimeout(url, { headers: githubHeaders() });
  if (!response.ok) {
    const rateRemaining = response.headers.get('x-ratelimit-remaining');
    const suffix = rateRemaining === '0' ? ' (GitHub rate limit reached)' : '';
    throw new Error(`GitHub returned ${response.status}${suffix}`);
  }
  return response.json();
}

function assetScore(asset, extensions) {
  const name = String(asset?.name || '').toLowerCase();
  if (!extensions.some((ext) => name.endsWith(ext))) return -1;
  let score = 0;
  if (/setup|installer|install/.test(name)) score += 6;
  if (/x64|amd64|win64/.test(name)) score += 4;
  if (name.endsWith('.msi')) score += 3;
  if (name.endsWith('.exe')) score += 2;
  if (/portable|debug|symbols|pdb|sha|checksum/.test(name)) score -= 8;
  return score;
}

function pickInstaller(assets, extensions) {
  return [...(assets || [])]
    .map((asset) => ({ asset, score: assetScore(asset, extensions) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || (b.asset.size || 0) - (a.asset.size || 0))[0]?.asset || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const requested = String(req.query?.repo || '').trim().toLowerCase();
  const config = REPOSITORIES[requested];
  if (!config) return res.status(400).json({ error: 'Unsupported repository.' });

  try {
    const meta = await githubJson(`https://api.github.com/repos/${config.repo}`);
    const branch = meta.default_branch || 'main';

    const [releases, sourceResponse] = await Promise.all([
      githubJson(`https://api.github.com/repos/${config.repo}/releases?per_page=10`),
      fetchWithTimeout(`https://raw.githubusercontent.com/${config.repo}/${encodeURIComponent(branch)}/${config.source}`, {
        headers: { 'User-Agent': 'nont.me-sync' },
      }),
    ]);

    const sourceText = sourceResponse.ok ? await sourceResponse.text() : '';
    const sourceVersion = parseSourceVersion(sourceText, config.sourceType) || config.fallbackVersion;
    const releaseList = Array.isArray(releases) ? releases.filter((release) => !release.draft) : [];
    const published = releaseList.find((release) => !release.prerelease) || releaseList[0] || null;
    const releaseVersion = cleanVersion(published?.tag_name || published?.name || '');
    const asset = pickInstaller(published?.assets || [], config.extensions.map((ext) => ext.toLowerCase()));
    const sourceAheadOfRelease = Boolean(sourceVersion && releaseVersion && compareVersions(sourceVersion, releaseVersion) > 0);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({
      repo: config.repo,
      status: 'ready',
      description: meta.description || '',
      defaultBranch: branch,
      pushedAt: meta.pushed_at || '',
      sourceVersion,
      releaseVersion,
      sourceAheadOfRelease,
      releasePrerelease: Boolean(published?.prerelease),
      releaseUrl: published?.html_url || `https://github.com/${config.repo}/releases`,
      asset: asset ? {
        id: asset.id,
        name: asset.name,
        size: asset.size,
        url: asset.browser_download_url,
        type: packageType(asset.name),
        updatedAt: asset.updated_at || '',
      } : null,
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({
      error: 'GitHub sync is temporarily unavailable.',
      detail: error instanceof Error ? error.message : String(error),
      repo: config.repo,
      sourceVersion: config.fallbackVersion,
    });
  }
}
