import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const expect = (condition, message) => { if (!condition) fail(message); };

const pkg = JSON.parse(read('package.json'));
const versionFile = read('VERSION').trim();
const app = read('src/App.jsx');
const main = read('src/main.jsx');
const index = read('index.html');
const music = read('src/music/MusicApp.tsx');
const musicCss = read('src/music/music.css');
const searchApi = read('api/youtube-search.js');
const cobaltApi = read('api/cobalt-download.js');
const cobaltShared = read('src/shared/cobalt.js');
const sharedMusic = read('src/shared/musicSearch.js');
const sourceAdapter = read('scripts/adapt-sources.mjs');
const sourceManifest = read('src/generated/source-manifest.json');
const e2e = read('tests/e2e/nont.spec.js');
const ci = read('.github/workflows/ci.yml');
const adaptWorkflow = read('.github/workflows/adapt-sources.yml');
const vercel = read('vercel.json');

expect(pkg.version === versionFile, `package.json (${pkg.version}) and VERSION (${versionFile}) must match`);
expect(!fs.existsSync('api/github-sync.js'), 'obsolete fixed GitHub sync endpoint must stay removed');

const forbiddenDeletedRepo = 'voidnont/nont';
for (const [label, text] of [
  ['root app', app],
  ['root bootstrap', main],
  ['source adapter', sourceAdapter],
  ['source manifest', sourceManifest],
  ['root browser tests', e2e],
  ['public HTML', index],
]) {
  expect(!text.toLowerCase().includes(forbiddenDeletedRepo), `${label} must not depend on deleted voidnont/nont`);
}

for (const path of ['shared/github-repo.js', 'shared/release-classifier.js', 'shared/frxe-app.js', 'server/github.js', 'api/github-search.js', 'api/github-app.js', 'api/github-release.js', 'src/device.js']) {
  expect(fs.existsSync(path), `${path} must exist`);
}
expect(app.includes('/api/github-app?app=frxe'), 'root must load logical Frxe app');
expect(app.includes('/api/github-search?'), 'root must expose GitHub app search');
expect(app.includes('Download Frxe for'), 'root must expose device-aware Frxe download copy');
expect(app.includes('Search GitHub apps'), 'root must expose GitHub app search input');
expect(index.includes('<title>Nont</title>'), 'public HTML title must be Nont');
expect(index.includes('href="/nont-icon.svg"'), 'root favicon must be local');
expect(fs.existsSync('public/nont-icon.svg'), 'local Nont favicon must exist');

const manifest = JSON.parse(sourceManifest);
expect(JSON.stringify(Object.keys(manifest)) === JSON.stringify(['voidnont/frxe']), 'source manifest must contain only voidnont/frxe');
expect(sourceAdapter.includes("repo: 'voidnont/frxe'"), 'source adapter must track only the recreated Frxe repo');
expect(!sourceAdapter.includes('patchNontWeb'), 'source adapter must not patch the root app');
expect(adaptWorkflow.includes('Adapt FRXE web player source metadata'), 'scheduled adapter must be FRXE-only');

expect(music.includes('const FRXE_SOURCE_VERSION'), 'Frxe web player must expose its source version');
expect(music.includes("type FrxeTab = 'home' | 'search' | 'save' | 'library' | 'settings'"), 'Frxe web must keep five source tabs');
expect(music.includes('../shared/musicSearch.js'), 'Frxe web search must use shared music search logic');
expect(music.includes('frxe-mini-player'), 'Frxe web must keep the mini-player');
expect(music.includes('NOW PLAYING'), 'Frxe web must keep the full player');
expect(music.includes('/api/cobalt-download'), 'Frxe web Save must call the server-side Cobalt bridge');
expect(cobaltApi.includes('COBALT_API_URL'), 'Cobalt bridge must use a configurable instance URL');
expect(cobaltApi.includes('COBALT_API_KEY'), 'Cobalt authentication must stay server-side');
expect(cobaltShared.includes('localProcessing'), 'Frxe web must keep Cobalt local processing disabled');
expect(musicCss.includes('prefers-reduced-motion'), 'Frxe web must retain reduced-motion support');
expect(searchApi.includes('../src/shared/musicSearch.js'), 'Music API must use shared music search logic');
expect(sharedMusic.includes('mergeAndRankMusicResults'), 'shared music ranking must remain');
expect(main.includes("document.title = 'FRXE'"), 'music.nont.me must identify as FRXE');

expect(e2e.includes('Windows visitor gets Frxe Windows download'), 'E2E must cover Windows device routing');
expect(e2e.includes('Android visitor handles Frxe APK availability'), 'E2E must cover Android routing');
expect(e2e.includes('unknown device chooses a download manually'), 'E2E must cover unknown-device fallback');
expect(e2e.includes('GitHub app search filters by platform'), 'E2E must cover platform search');
expect(e2e.includes('mobile app hub has no horizontal overflow'), 'E2E must cover mobile layout');
expect(e2e.includes('Frxe web player mirrors'), 'E2E must preserve the FRXE web player coverage');
expect(e2e.includes('FRXE Save uses the Cobalt bridge'), 'E2E must preserve Cobalt Save coverage');

expect(vercel.includes('npm run check && npm run build'), 'Vercel must validate before building');
expect(vercel.includes('Content-Security-Policy'), 'production CSP must remain configured');
expect(vercel.includes('X-Content-Type-Options'), 'content type hardening must remain configured');
expect(pkg.devDependencies?.['@playwright/test'], 'Playwright must remain installed');
expect(pkg.scripts?.['test:unit'], 'unit tests must remain runnable');
expect(pkg.scripts?.['test:e2e'], 'browser E2E tests must remain runnable');
expect(pkg.scripts?.['adapt:sources'], 'source adapter command must remain runnable');
expect(ci.includes('npm run test:unit'), 'CI must run unit tests');
expect(ci.includes('npm run test:e2e:ci'), 'CI must run E2E tests');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validation passed for nont.me v${pkg.version}.`);
