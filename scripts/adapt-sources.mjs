import fs from 'node:fs';
import path from 'node:path';
import { inferSourceContract } from '../shared/source-contract.js';

const SOURCES = [
  { repo: 'voidnont/NontHub', constant: 'NONTHUB_REPO', appId: 'nonthub' },
  { repo: 'voidnont/NontMusic', constant: 'NONTMUSIC_REPO', appId: 'nontmusic' },
];

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'nont.me-adapt-sources',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

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

async function inspectSource(source) {
  const meta = await json(`https://api.github.com/repos/${source.repo}`);
  const branch = meta.default_branch || 'main';
  const [packageText, tree, appSource] = await Promise.all([
    text(`https://raw.githubusercontent.com/${source.repo}/${encodeURIComponent(branch)}/package.json`, { headers: { 'User-Agent': headers['User-Agent'] } }),
    json(`https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`),
    text(`https://raw.githubusercontent.com/${source.repo}/${encodeURIComponent(branch)}/src/App.tsx`, { headers: { 'User-Agent': headers['User-Agent'] } }).catch(() => ''),
  ]);
  const pkg = JSON.parse(packageText);
  const sourcePaths = Array.isArray(tree?.tree) ? tree.tree.map((entry) => entry.path).filter(Boolean) : [];
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

function patchApp(appText, source, contract) {
  const versionPattern = new RegExp(`(\\[${source.constant}\\]: \\{ fallbackVersion: ')[^']*(' \\})`);
  let next = appText.replace(versionPattern, `$1${singleQuote(contract.version)}$2`);

  const descriptionPattern = new RegExp(`(id: '${source.appId}'[\\s\\S]{0,420}?description: ')[^']*(')`);
  if (contract.description) next = next.replace(descriptionPattern, `$1${singleQuote(contract.description)}$2`);
  return next;
}

const inspected = await Promise.all(SOURCES.map(inspectSource));
const manifest = Object.fromEntries(inspected.map((item) => [item.repo, item]));
const manifestPath = path.join('src', 'generated', 'source-manifest.json');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const appPath = path.join('src', 'App.jsx');
let app = fs.readFileSync(appPath, 'utf8');
for (let index = 0; index < SOURCES.length; index += 1) app = patchApp(app, SOURCES[index], inspected[index]);
fs.writeFileSync(appPath, app);

for (const item of inspected) {
  console.log(`${item.repo}: v${item.version || 'unknown'} | ${item.platforms.join(', ') || 'platform unknown'} | ${item.capabilities.join(', ') || 'no detected capabilities'}`);
}
