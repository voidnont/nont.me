import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const expect = (condition, message) => { if (!condition) fail(message); };

const pkg = JSON.parse(read('package.json'));
const versionFile = read('VERSION').trim();
const app = read('src/App.jsx');
const main = read('src/main.jsx');
const music = read('src/music/MusicApp.tsx');
const searchApi = read('api/youtube-search.js');
const syncApi = read('api/github-sync.js');
const vite = read('vite.config.js');
const vercel = read('vercel.json');
const index = read('index.html');
const polish = read('src/polish.css');
const musicPolish = read('src/music/polish.css');

expect(pkg.version === versionFile, `package.json (${pkg.version}) and VERSION (${versionFile}) must match`);
expect(!fs.existsSync('api/search.js'), 'obsolete api/search.js must stay removed');
expect(!fs.existsSync('api/chat.js'), 'unused API-provider proxy must stay removed');
expect(!app.includes("'web-search'"), 'Web Search navigation must stay removed');
expect(!app.includes("page === 'updates'"), 'legacy Updates page must stay removed');
expect(!app.includes('voidnont/NONT-Nexus'), 'legacy NONT-Nexus repository reference must stay removed');

for (const repo of ['voidnont/NontHub', 'voidnont/NontMusic', 'voidnont/veilbrowser']) {
  expect(app.includes(repo), `App must stay connected to ${repo}`);
  expect(syncApi.includes(repo), `GitHub sync API must allow ${repo}`);
}

expect(app.includes("['installer', 'Installer'"), 'Installer must remain in navigation');
expect(app.includes("setInstallerMode('install')"), 'Installer must retain Install mode');
expect(app.includes("setInstallerMode('update')"), 'Installer must retain Update mode');
expect(music.includes('voidnont/NontMusic/main/public/nontmusic.png'), 'NontMusic web must use current NontMusic branding');
expect(!music.includes('voidnont/nont/main/public/nont.png'), 'legacy NONT music logo must not return');
expect(searchApi.includes('buildProviderMusicQuery'), 'music-intent provider queries must remain enabled');
expect(searchApi.includes('official'), 'official-result detection must remain enabled');
expect(searchApi.includes('mergeAndRank'), 'duplicate merging/ranking must remain enabled');
expect(syncApi.includes('REQUEST_TIMEOUT_MS'), 'GitHub sync requests must retain a timeout');
expect(syncApi.includes('sourceAheadOfRelease'), 'source/release drift detection must remain enabled');
expect(vite.includes('sync-nont-web-version'), 'Vite must keep displayed Hub version synced with package.json');
expect(main.includes("import('./polish.css')"), 'Hub corrective CSS must be loaded');
expect(main.includes("import('./music/polish.css')"), 'NontMusic corrective CSS must be loaded');
expect(polish.includes('repeat(5'), 'mobile Hub navigation must retain five columns');
expect(polish.includes('prefers-reduced-motion'), 'Hub must retain reduced-motion support');
expect(musicPolish.includes('prefers-reduced-motion'), 'NontMusic must retain reduced-motion support');
expect(index.includes('<title>NontHub</title>'), 'public HTML title must stay NontHub');
expect(!index.includes('NONT Nexus'), 'legacy Nexus metadata must stay removed');
expect(vercel.includes('npm run check && npm run build'), 'Vercel must validate before building');
expect(vercel.includes('Content-Security-Policy'), 'production CSP header must remain configured');
expect(vercel.includes('X-Content-Type-Options'), 'content type hardening must remain configured');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validation passed for nont.me v${pkg.version}.`);
