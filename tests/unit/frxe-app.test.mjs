import test from 'node:test';
import assert from 'node:assert/strict';
import { FRXE_APP, mergeFrxeSources } from '../../shared/frxe-app.js';

test('Frxe has the Windows and Android repositories only', () => {
  assert.deepEqual(FRXE_APP.sources.map((item) => item.repo), ['voidnont/Frxe-Windows', 'voidnont/frxe']);
});

test('Windows recommendation comes from Frxe-Windows and Android can be unavailable', () => {
  const merged = mergeFrxeSources([
    { repo: 'voidnont/Frxe-Windows', version: '0.1.0', assets: [{ name: 'Frxe-Desktop-0.1.0-x64.msi', platform: 'windows', arch: 'x64', installable: true, score: 10, size: 1, url: 'https://github.com/voidnont/Frxe-Windows/releases/download/v0.1.0/a.msi' }] },
    { repo: 'voidnont/frxe', version: '', assets: [] },
  ], { os: 'windows', arch: 'x64' });
  assert.equal(merged.recommended.repo, 'voidnont/Frxe-Windows');
  assert.equal(merged.availablePlatforms.includes('android'), false);
});
