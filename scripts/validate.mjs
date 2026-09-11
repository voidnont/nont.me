import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const expect = (condition, message) => { if (!condition) fail(message); };

const pkg = JSON.parse(read('package.json'));
const versionFile = read('VERSION').trim();
const app = read('src/App.jsx');
const music = read('src/music/MusicApp.tsx');
const searchApi = read('api/youtube-search.js');
const syncApi = read('api/github-sync.js');

expect(pkg.version === versionFile, `package.json (${pkg.version}) and VERSION (${versionFile}) must match`);
expect(!fs.existsSync('api/search.js'), 'obsolete api/search.js must stay removed');
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

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validation passed for nont.me v${pkg.version}.`);
