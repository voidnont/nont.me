import { contractSummary, inferSourceContract } from '../shared/source-contract.js';

const REPOSITORIES = {
  'voidnont/nont': {
    repo: 'voidnont/nont',
    source: 'package.json',
    sourceType: 'package',
    appSource: 'src/App.tsx',
    adaptSource: true,
    extensions: ['.msi', '.exe'],
  },
  'voidnont/frxe': {
    repo: 'voidnont/Frxe',
    source: 'app/build.gradle.kts',
    sourceType: 'gradle',
    appSource: 'app/src/main/java/com/frxe/music/ui/FrxeApp.kt',
    adaptSource: true,
    extensions: ['.apk'],
  },
  'voidnont/veilbrowser': {
    repo: 'voidnont/veilbrowser',
    source: 'Cargo.toml',
    sourceType: 'cargo',
    adaptSource: false,
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

function parsePackage(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

function parseSourceVersion(text, type) {
  if (!text) return '';
  if (type === 'package') return cleanVersion(parsePackage(text).version || '');
  if (type === 'gradle') return cleanVersion(text.match(/versionName\s*=\s*["']([^"']+)["']/)?.[1] || '');
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
    'User-Agent': 'nont.me-source-adapter',
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

async function rawText(repo, branch, path) {
  const response = await fetchWithTimeout(
    `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${path}`,
    { headers: { 'User-Agent': 'nont.me-source-adapter' } },
  );
  return response.ok ? response.text() : '';
}

function assetScore(asset, extensions) {
  const name = String(asset?.name || '').toLowerCase();
  if (!extensions.some((ext) => name.endsWith(ext))) return -1;
  let score = 0;
  if (/setup|installer|install/.test(name)) score += 6;
  if (/x64|amd64|win64/.test(name)) score += 4;
  if (name.endsWith('.msi')) score += 3;
  if (name.endsWith('.exe')) score += 2;
  if (name.endsWith('.apk')) score += 2;
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
  const fresh = String(req.query?.fresh || '') === '1';
  const config = REPOSITORIES[requested];
  if (!config) return res.status(400).json({ error: 'Unsupported repository.' });

  try {
    const meta = await githubJson(`https://api.github.com/repos/${config.repo}`);
    const branch = meta.default_branch || 'main';

    const releasesPromise = githubJson(`https://api.github.com/repos/${config.repo}/releases?per_page=10`);
    const sourcePromise = rawText(config.repo, branch, config.source);
    const treePromise = config.adaptSource
      ? githubJson(`https://api.github.com/repos/${config.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`).catch(() => null)
      : Promise.resolve(null);
    const appPromise = config.adaptSource && config.appSource
      ? rawText(config.repo, branch, config.appSource).catch(() => '')
      : Promise.resolve('');

    const [releases, sourceText, tree, appSource] = await Promise.all([
      releasesPromise,
      sourcePromise,
      treePromise,
      appPromise,
    ]);

    const sourceVersion = parseSourceVersion(sourceText, config.sourceType);
    const pkg = config.sourceType === 'package'
      ? parsePackage(sourceText)
      : config.sourceType === 'gradle'
        ? { version: sourceVersion, name: 'frxe', description: 'FRXE liquid-glass music player', scripts: { android: 'gradle' } }
        : {};
    const sourcePaths = Array.isArray(tree?.tree) ? tree.tree.map((entry) => entry.path).filter(Boolean) : [];
    const contract = config.adaptSource
      ? inferSourceContract({ repo: config.repo, pkg, sourcePaths, appSource })
      : { version: sourceVersion, name: '', description: '', platforms: ['Windows'], capabilities: [] };

    const releaseList = Array.isArray(releases) ? releases.filter((release) => !release.draft) : [];
    const published = releaseList.find((release) => !release.prerelease) || releaseList[0] || null;
    const releaseVersion = cleanVersion(published?.tag_name || published?.name || '');
    const asset = pickInstaller(published?.assets || [], config.extensions.map((ext) => ext.toLowerCase()));
    const effectiveVersion = contract.version || sourceVersion;
    const sourceAheadOfRelease = Boolean(effectiveVersion && releaseVersion && compareVersions(effectiveVersion, releaseVersion) > 0);
    const description = contractSummary(contract) || meta.description || '';

    res.setHeader('Cache-Control', fresh ? 'private, no-store, max-age=0' : 's-maxage=120, stale-while-revalidate=600');
    if (fresh) res.setHeader('Pragma', 'no-cache');
    return res.status(200).json({
      repo: config.repo,
      status: 'ready',
      description,
      packageDescription: contract.description || meta.description || '',
      packageName: contract.name || '',
      defaultBranch: branch,
      pushedAt: meta.pushed_at || '',
      sourceVersion: effectiveVersion,
      sourceTreeSha: tree?.sha || '',
      sourcePathsCount: sourcePaths.length,
      platforms: contract.platforms || [],
      capabilities: contract.capabilities || [],
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
      error: 'GitHub source sync is temporarily unavailable.',
      detail: error instanceof Error ? error.message : String(error),
      repo: config.repo,
      sourceVersion: '',
    });
  }
}
