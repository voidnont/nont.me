import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const expect = (condition, message) => { if (!condition) fail(message); };

const pkg = JSON.parse(read('package.json'));
const versionFile = read('VERSION').trim();
const app = read('src/App.jsx');
const main = read('src/main.jsx');
const siteMode = read('src/site-mode.js');
const music = read('src/music/MusicApp.tsx');
const musicCss = read('src/music/music.css');
const frxeIcon = read('public/frxe-icon.svg');
const searchApi = read('api/youtube-search.js');
const extractApi = read('api/media-extract.js');
const extractorContract = read('src/shared/extractorContract.js');
const extractorUnit = read('tests/unit/extractorContract.test.mjs');
const sharedMusic = read('src/shared/musicSearch.js');
const sourceContract = read('shared/source-contract.js');
const sourceAdapter = read('scripts/adapt-sources.mjs');
const sourceManifestText = read('src/generated/source-manifest.json');
const sourceManifest = JSON.parse(sourceManifestText);
const playwright = read('playwright.config.js');
const e2e = read('tests/e2e/nont.spec.js');
const unit = read('tests/unit/musicSearch.test.mjs');
const siteModeUnit = read('tests/unit/site-mode.test.mjs');
const sourceUnit = read('tests/unit/source-contract.test.mjs');
const ci = read('.github/workflows/ci.yml');
const adaptWorkflow = read('.github/workflows/adapt-sources.yml');
const vite = read('vite.config.js');
const vercel = read('vercel.json');
const index = read('index.html');
const polish = read('src/polish.css');

expect(pkg.version === versionFile, `package.json (${pkg.version}) and VERSION (${versionFile}) must match`);
expect(!fs.existsSync('api/github-sync.js'), 'obsolete fixed GitHub sync endpoint must stay removed');

const forbiddenDeletedRepo = ['voidnont', 'nont'].join('/');
function sourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  return fs.readdirSync(root).flatMap((name) => sourceFiles(path.join(root, name)));
}
for (const file of ['README.md', 'index.html', ...['src', 'api', 'server', 'shared', 'scripts', 'tests', '.github/workflows'].flatMap(sourceFiles)]) {
  if (!/\.(?:js|jsx|mjs|ts|tsx|json|md|yml|yaml|html|css)$/i.test(file)) continue;
  expect(!read(file).toLowerCase().includes(forbiddenDeletedRepo), `${file} must not depend on the deleted root app repository`);
}

for (const file of ['shared/github-repo.js', 'shared/release-classifier.js', 'shared/frxe-app.js', 'server/github.js', 'api/github-search.js', 'api/github-app.js', 'api/github-release.js', 'src/device.js', 'src/site-mode.js']) {
  expect(fs.existsSync(file), `${file} must exist`);
}
expect(app.includes('/api/github-app?app=frxe'), 'root must load logical Frxe app');
expect(app.includes('/api/github-search?'), 'root must expose GitHub app search');
expect(app.includes('Download Frxe for'), 'root must expose device-aware Frxe download copy');
expect(app.includes('Search GitHub apps'), 'root must expose GitHub app search input');
expect(index.includes('<title>Nont</title>'), 'public HTML title must be Nont');
expect(index.includes('href="/nont-icon.svg"'), 'root favicon must be local');
expect(fs.existsSync('public/nont-icon.svg'), 'local Nont favicon must exist');
expect(siteMode.includes("'music.nont.me'") && siteMode.includes("'frxe.nont.me'"), 'FRXE web routing must support both production subdomains');
expect(main.includes('isFrxeWebLocation'), 'root bootstrap must use shared FRXE hostname routing');
expect(siteModeUnit.includes('both production subdomains'), 'unit suite must cover both FRXE web hostnames');

expect(JSON.stringify(Object.keys(sourceManifest)) === JSON.stringify(['voidnont/frxe']), 'source manifest must contain only voidnont/frxe');
expect(sourceAdapter.includes("repo: 'voidnont/frxe'"), 'source adapter must track only the recreated Frxe repo');
expect(!sourceAdapter.includes('patchNontWeb'), 'source adapter must not patch the root app');
expect(adaptWorkflow.includes("cron: '*/15 * * * *'"), 'source adapter must keep the 15-minute safety sync');
expect(adaptWorkflow.includes('Adapt FRXE web player source metadata'), 'scheduled adapter must be FRXE-only');
expect(adaptWorkflow.includes('node scripts/adapt-sources.mjs'), 'scheduled adapter must run the source adapter');

expect(music.includes('const FRXE_SOURCE_VERSION'), 'Frxe web player must expose its source version');
expect(music.includes("type FrxeTab = 'home' | 'search' | 'save' | 'library' | 'settings'"), 'Frxe web must keep the five source tabs');
expect(music.includes('../shared/musicSearch.js'), 'Frxe web search must use shared music search logic');
expect(music.includes('frxe-mini-player'), 'Frxe web must keep the liquid mini-player');
expect(music.includes('NOW PLAYING'), 'Frxe web must keep the full player');
expect(music.includes('/api/media-extract'), 'Frxe web Save must call the extractor proxy');
expect(music.includes('Save media'), 'Frxe web Save must expose the extractor action');
expect(music.includes('Open source') && music.includes('Retry'), 'Frxe web Save must surface provider challenges for user action');
expect(extractApi.includes('EXTRACTOR_WORKER_URL'), 'extractor proxy must use a configurable worker URL');
expect(extractApi.includes('EXTRACTOR_WORKER_TOKEN'), 'extractor proxy must authenticate to the worker');
expect(extractApi.includes('normalizeWorkerResult'), 'extractor proxy must normalize worker responses');
expect(extractorContract.includes("'drm_protected'"), 'extractor contract must retain visible DRM challenge classification');
expect(extractorContract.includes("status === 'error'"), 'extractor contract must support unresolved extraction errors');
expect(extractorUnit.includes('old fallback status'), 'unit suite must reject the retired fallback response');
expect(main.includes("document.title = 'FRXE'"), 'FRXE web hosts must identify as FRXE');
expect(fs.existsSync('public/frxe-icon.svg'), 'Frxe favicon must exist');
expect(frxeIcon.includes('viewBox="0 0 108 108"'), 'Frxe web icon must keep the Android launcher viewport');
expect(frxeIcon.includes('fill="#09090B"') && frxeIcon.includes('M0,0h108v108h-108z'), 'Frxe web icon must keep the launcher background');
expect(frxeIcon.includes('fill="#FFFFFF"') && frxeIcon.includes('M25,27h36v10h-24v13h21v10h-21v21h-12z'), 'Frxe web icon must keep the launcher F mark');
expect(frxeIcon.includes('fill="#B7FF59"') && frxeIcon.includes('M63,47l8,-8l12,12l12,-12l8,8l-12,12l12,12l-8,8l-12,-12l-12,12l-8,-8l12,-12z'), 'Frxe web icon must keep the launcher X mark');
expect(musicCss.includes('.frxe-glass'), 'Frxe liquid-glass styling must remain');
expect(musicCss.includes('backdrop-filter'), 'Frxe glass must keep backdrop blur');
expect(musicCss.includes('prefers-reduced-motion'), 'Frxe web must retain reduced-motion support');
expect(searchApi.includes('../src/shared/musicSearch.js'), 'Music API must use shared music search logic');
expect(sharedMusic.includes('buildProviderMusicQuery'), 'shared music module must keep provider-intent logic');
expect(sharedMusic.includes('mergeAndRankMusicResults'), 'shared music module must keep duplicate merging/ranking');
expect(sharedMusic.includes('refineMusicMetadata'), 'shared music module must keep metadata cleanup');
expect(searchApi.includes('REQUEST_TIMEOUT_MS'), 'music search requests must retain a timeout');
expect(sourceContract.includes("key.endsWith('/frxe')"), 'source contract must understand Frxe');
expect(sourceContract.includes("'app/src/main/java/com/frxe/music"), 'source contract must understand the current Frxe app layout');

expect(vite.includes('sync-nont-web-version'), 'Vite must keep displayed root version synced with package.json');
expect(main.includes("import('./polish.css')"), 'root corrective CSS must be loaded');
expect(polish.includes('prefers-reduced-motion'), 'root must retain reduced-motion support');
expect(!index.includes('NONT Nexus'), 'legacy Nexus metadata must stay removed');
expect(vercel.includes('npm run check && npm run build'), 'Vercel must validate before building');
expect(vercel.includes('Content-Security-Policy'), 'production CSP header must remain configured');
expect(vercel.includes('X-Content-Type-Options'), 'content type hardening must remain configured');
expect(pkg.devDependencies?.['@playwright/test'], 'Playwright must remain installed');
expect(pkg.scripts?.['test:unit'], 'unit tests must remain runnable');
expect(pkg.scripts?.['test:e2e'], 'browser E2E tests must remain runnable');
expect(pkg.scripts?.['adapt:sources'], 'source adapter command must remain runnable');
expect(playwright.includes("testDir: './tests/e2e'"), 'Playwright must target the E2E suite');

expect(e2e.includes('Windows visitor gets Frxe Windows download'), 'E2E must cover Windows device routing');
expect(e2e.includes('Android visitor handles Frxe APK availability'), 'E2E must cover Android routing');
expect(e2e.includes('unknown device chooses a download manually'), 'E2E must cover unknown-device fallback');
expect(e2e.includes('GitHub app search filters by platform'), 'E2E must cover platform search');
expect(e2e.includes('mobile app hub has no horizontal overflow'), 'E2E must cover mobile layout');
expect(e2e.includes('Frxe web player mirrors'), 'E2E must preserve the Frxe web player coverage');
expect(e2e.includes('FRXE Save uses media extraction directly'), 'E2E must cover extractor Save');
expect(e2e.includes('surfaces provider challenge'), 'E2E must cover user-solvable provider challenges');
expect(unit.includes('duplicate versions collapse'), 'unit suite must cover duplicate merging');
expect(sourceUnit.includes('Frxe contract follows'), 'unit suite must cover Frxe source adaptation');

expect(ci.includes('npm run test:unit'), 'CI must run JS unit tests');
expect(ci.includes('python -m unittest discover -s extractor-worker/tests -v'), 'CI must run extractor worker tests');
expect(ci.includes('python -m py_compile extractor-worker/core.py extractor-worker/pipeline.py extractor-worker/extractors.py extractor-worker/app.py'), 'CI must compile the extractor worker');
expect(ci.includes('playwright install --with-deps chromium'), 'CI must install Chromium');
expect(ci.includes('npm run test:e2e:ci'), 'CI must run browser E2E tests');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validation passed for nont.me v${pkg.version}.`);
