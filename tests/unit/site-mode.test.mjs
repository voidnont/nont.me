import test from 'node:test';
import assert from 'node:assert/strict';
import { isFrxeWebLocation } from '../../src/site-mode.js';

test('FRXE web player is enabled on both production subdomains', () => {
  assert.equal(isFrxeWebLocation('music.nont.me', '/'), true);
  assert.equal(isFrxeWebLocation('frxe.nont.me', '/'), true);
});

test('FRXE web player stays available through the /music route', () => {
  assert.equal(isFrxeWebLocation('nont.me', '/music'), true);
  assert.equal(isFrxeWebLocation('nont.me', '/music/search'), true);
});

test('root nont.me remains the app hub', () => {
  assert.equal(isFrxeWebLocation('nont.me', '/'), false);
  assert.equal(isFrxeWebLocation('www.nont.me', '/'), false);
});
