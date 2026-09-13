import fs from 'node:fs';
import path from 'node:path';
import { inferSourceContract } from '../shared/source-contract.js';

const SOURCES = [
  {
    repo: 'voidnont/nont',
    kind: 'package',
    packagePath: 'package.json',
    appSourcePath: 'src/App.tsx',
  },
  {
    repo: 'voidnont/Frxe',
    kind: 'frxe',
    versionPath: 'app/build.gradle.kts',
    appSourcePaths: [
      'app/src/main/java/com/frxe/music/ui/FrxeApp.kt',
      'app/src/main/java/com/frxe/music/ui/screens/NowPlayingScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/SearchScreen.kt',
    ],
  },
];

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'nont.me-adapt-sources',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function text(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function json(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function raw(repo, branch, sourcePath) {
  return text(`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${sourcePath}`, {
    headers: { 'User-Agent': headers['User-Agent'] },
  });
}

function parseFrxeVersion(gradleText) {
  return gradleText.match(/versionName\s*=\s*"([^"]+)"/)?.[1]?.trim() || '';
}

async function inspectSource(source) {
  const meta = await json(`https://api.github.com/repos/${source.repo}`);
  const branch = meta.default_branch || 'main';
  const tree = await json(`https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const sourcePaths = Array.isArray(tree?.tree) ? tree.tree.map((entry) => entry.path).filter(Boolean) : [];

  let pkg;
  let appSource = '';

  if (source.kind === 'frxe') {
    const [gradleText, ...appSources] = await Promise.all([
      raw(source.repo, branch, source.versionPath),
      ...source.appSourcePaths.map((sourcePath) => raw(source.repo, branch, sourcePath).catch(() => '')),
    ]);
    pkg = {
      version: parseFrxeVersion(gradleText),
      name: 'frxe',
      description: 'FRXE liquid-glass music player',
      scripts: { android: 'gradle' },
    };
    appSource = appSources.join('\n');
  } else {
    const [packageText, appText] = await Promise.all([
      raw(source.repo, branch, source.packagePath),
      raw(source.repo, branch, source.appSourcePath).catch(() => ''),
    ]);
    pkg = JSON.parse(packageText);
    appSource = appText;
  }

  const contract = inferSourceContract({ repo: source.repo, pkg, sourcePaths, appSource });
  return {
    repo: source.repo,
    defaultBranch: branch,
    treeSha: tree?.sha || '',
    pushedAt: meta.pushed_at || '',
    ...contract,
  };
}

function singleQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function patchNontWeb(appText, contract) {
  let next = appText
    .replace(/const NONTHUB_REPO = '[^']*';/, "const NONTHUB_REPO = 'voidnont/nont';")
    .replace(
      /const NONTHUB_LOGO = '[^']*';/,
      "const NONTHUB_LOGO = 'https://raw.githubusercontent.com/voidnont/nont/main/public/brand/nonthub.png';",
    );

  if (contract?.version) {
    next = next.replace(
      /(\[NONTHUB_REPO\]: \{ fallbackVersion: ')[^']*(' \})/,
      `$1${singleQuote(contract.version)}$2`,
    );
  }

  if (contract?.description) {
    next = next.replace(
      /(id: 'nonthub'[\s\S]{0,420}?description: ')[^']*(')/,
      `$1${singleQuote(contract.description)}$2`,
    );
  }

  return next;
}

function patchFrxeApp(appText, contract) {
  if (!contract?.version) return appText;
  return appText.replace(
    /const FRXE_WEB_VERSION = '[^']*';/,
    `const FRXE_WEB_VERSION = '${singleQuote(contract.version)}';`,
  );
}

function patchFrxeWeb(musicText, contract) {
  if (!contract?.version) return musicText;
  return musicText.replace(
    /const FRXE_SOURCE_VERSION = '[^']*';/,
    `const FRXE_SOURCE_VERSION = '${singleQuote(contract.version)}';`,
  );
}

const manifestPath = path.join('src', 'generated', 'source-manifest.json');
let previousManifest = {};
try { previousManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { previousManifest = {}; }

const inspected = await Promise.all(SOURCES.map(async (source) => {
  try {
    return await inspectSource(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${source.repo}: source unavailable (${message}); preserving last known contract.`);
    const previous = previousManifest[source.repo];
    if (previous) return { ...previous, syncError: message };
    return {
      repo: source.repo,
      defaultBranch: 'main',
      treeSha: '',
      pushedAt: '',
      version: '',
      name: '',
      description: '',
      platforms: [],
      capabilities: [],
      syncError: message,
    };
  }
}));

const manifest = Object.fromEntries(inspected.map((item) => [item.repo, item]));
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const appPath = path.join('src', 'App.jsx');
let app = fs.readFileSync(appPath, 'utf8');
app = patchNontWeb(app, inspected[0]);
app = patchFrxeApp(app, inspected[1]);
fs.writeFileSync(appPath, app);

const musicPath = path.join('src', 'music', 'MusicApp.tsx');
let music = fs.readFileSync(musicPath, 'utf8');
music = patchFrxeWeb(music, inspected[1]);
fs.writeFileSync(musicPath, music);

for (const item of inspected) {
  const suffix = item.syncError ? ` | preserved: ${item.syncError}` : '';
  console.log(`${item.repo}: v${item.version || 'unknown'} | ${item.platforms.join(', ') || 'platform unknown'} | ${item.capabilities.join(', ') || 'no detected capabilities'}${suffix}`);
}
