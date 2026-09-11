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

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nont.me-sync',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    const rateRemaining = response.headers.get('x-ratelimit-remaining');
    const suffix = rateRemaining === '0' ? ' (GitHub rate limit reached)' : '';
    throw new Error(`GitHub returned ${response.status}${suffix}`);
  }
  return response.json();
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
      fetch(`https://raw.githubusercontent.com/${config.repo}/${encodeURIComponent(branch)}/${config.source}`, {
        headers: { 'User-Agent': 'nont.me-sync' },
      }),
    ]);

    const sourceText = sourceResponse.ok ? await sourceResponse.text() : '';
    const sourceVersion = parseSourceVersion(sourceText, config.sourceType) || config.fallbackVersion;
    const published = Array.isArray(releases) ? releases.find((release) => !release.draft) : null;
    const lowered = config.extensions.map((ext) => ext.toLowerCase());
    const assets = published?.assets || [];
    const asset = assets.find((item) => lowered.some((ext) => item.name.toLowerCase().endsWith(ext))) || null;

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({
      repo: config.repo,
      status: 'ready',
      description: meta.description || '',
      defaultBranch: branch,
      pushedAt: meta.pushed_at || '',
      sourceVersion,
      releaseVersion: cleanVersion(published?.tag_name || published?.name || ''),
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
