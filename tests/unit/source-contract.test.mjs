import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSourceContract } from '../../shared/source-contract.js';

test('Nont contract follows voidnont/nont source package and UI', () => {
  const contract = inferSourceContract({
    repo: 'voidnont/nont',
    pkg: {
      version: '0.4.4',
      name: 'nont',
      description: 'Nont - open app and download hub by Void for Windows and Android.',
      scripts: { 'windows:build': 'tauri build --bundles msi' },
      dependencies: { '@tauri-apps/api': '2.11.1' },
    },
    sourcePaths: ['src/App.tsx', 'src/icon-fixes.css'],
    appSource: 'Library Downloads Updates Settings custom repo',
  });

  assert.equal(contract.version, '0.4.4');
  assert.deepEqual(contract.platforms, ['Windows', 'Android']);
  for (const feature of ['Downloads', 'Library', 'Updates', 'Settings', 'Custom repositories', 'Icon fixes']) {
    assert.ok(contract.capabilities.includes(feature));
  }
});

test('Frxe contract follows the current Android liquid-glass player source tree', () => {
  const contract = inferSourceContract({
    repo: 'voidnont/Frxe',
    pkg: {
      version: '0.4.12',
      name: 'frxe',
      description: 'FRXE liquid-glass music player',
      scripts: { android: 'gradle' },
    },
    sourcePaths: [
      'app/src/main/java/com/frxe/music/ui/components/Glass.kt',
      'app/src/main/java/com/frxe/music/ui/screens/HomeScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/SearchScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/SaveScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/LibraryScreen.kt',
      'app/src/main/java/com/frxe/music/ui/screens/NowPlayingScreen.kt',
      'app/src/main/java/com/frxe/music/lyrics/LyricsRepository.kt',
      'app/src/main/java/com/frxe/music/social/ListenTogether.kt',
      'app/src/main/java/com/frxe/music/voice/VoskVoiceController.kt',
      'app/src/main/java/com/frxe/music/cast/FrxeCastOptionsProvider.kt',
      'app/src/main/res/xml/automotive_app_desc.xml',
    ],
    appSource: 'Home Search Save Library Settings QueueMusic shuffle repeat',
  });

  assert.equal(contract.version, '0.4.12');
  assert.ok(contract.platforms.includes('Android'));
  for (const feature of ['Liquid Glass', 'Home', 'Search', 'Save', 'Library', 'Now Playing', 'Lyrics', 'Listen Together', 'Voice', 'Cast', 'Android Auto']) {
    assert.ok(contract.capabilities.includes(feature));
  }
});
