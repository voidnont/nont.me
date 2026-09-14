import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8');

test('FRXE installs the background audio adapter before the 0.6.9 app loads', () => {
  assert.match(source, /import\s+\{\s*installBackgroundAudioPlayer\s*\}\s+from\s+'\.\/music\/backgroundAudioPlayer\.js'/);
  const installIndex = source.indexOf('installBackgroundAudioPlayer();');
  const musicImportIndex = source.indexOf("import('./music/MusicApp069.tsx')");
  assert.ok(installIndex >= 0, 'background audio adapter is installed');
  assert.ok(musicImportIndex >= 0, 'FRXE 0.6.9 app import remains');
  assert.ok(installIndex < musicImportIndex, 'adapter installs before FRXE 0.6.9 app import');
});
