import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSourceContract } from '../../shared/source-contract.js';

test('NontHub contract follows package scripts and source tree', () => {
  const contract = inferSourceContract({
    repo: 'voidnont/NontHub',
    pkg: {
      version: '0.4.4',
      name: 'nonthub',
      description: 'NontHub - GitHub app hub by Void for Windows and Android.',
      scripts: { 'windows:build': 'tauri build', 'android:build:apk': 'tauri android build' },
      dependencies: { '@tauri-apps/api': '2.11.1' },
    },
    sourcePaths: ['src/App.tsx', 'src/AndroidApp.tsx', 'src/icon-fixes.css'],
    appSource: 'Library Downloads Installer Settings custom repo',
  });

  assert.equal(contract.version, '0.4.4');
  assert.deepEqual(contract.platforms, ['Windows', 'Android']);
  for (const feature of ['Installer', 'Downloads', 'Library', 'Settings', 'Custom repositories', 'Android app', 'Icon fixes']) {
    assert.ok(contract.capabilities.includes(feature));
  }
});

test('NontMusic contract follows optional source modules', () => {
  const contract = inferSourceContract({
    repo: 'voidnont/NontMusic',
    pkg: {
      version: '0.4.2',
      name: 'nontmusic',
      description: 'NontMusic Windows music player',
      scripts: { 'tauri:build': 'tauri build --bundles msi' },
      dependencies: { '@tauri-apps/api': '2.11.1' },
    },
    sourcePaths: ['src/lyrics.ts', 'src/recommendations.ts', 'src/plugins.ts', 'src/i18n.ts', 'src/overlay.tsx'],
    appSource: 'queue download crossfade shuffle repeat',
  });

  assert.equal(contract.version, '0.4.2');
  assert.deepEqual(contract.platforms, ['Windows']);
  for (const feature of ['Lyrics', 'Recommendations', 'Plugins', 'Localization', 'Overlay player', 'Queue', 'Downloads', 'Crossfade', 'Shuffle', 'Repeat']) {
    assert.ok(contract.capabilities.includes(feature));
  }
});
