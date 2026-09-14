import assert from 'node:assert/strict';
import test from 'node:test';

const cookieVault = await import('../../src/server/cobaltKeyCookie.js').catch(() => null);

const SECRET = '0123456789abcdef0123456789abcdef-test-secret';

test('Cobalt cookie vault module exists', () => {
  assert.ok(cookieVault, 'src/server/cobaltKeyCookie.js must exist');
});

test('Cobalt key encrypts without plaintext and decrypts with the same secret', () => {
  assert.ok(cookieVault);
  const key = 'user-cobalt-key-abc123';
  const encrypted = cookieVault.encryptCobaltKey(key, SECRET);
  assert.ok(encrypted);
  assert.equal(encrypted.includes(key), false);
  assert.equal(cookieVault.decryptCobaltKey(encrypted, SECRET), key);
});

test('Cobalt key decryption fails closed with a different secret', () => {
  assert.ok(cookieVault);
  const encrypted = cookieVault.encryptCobaltKey('key-one', SECRET);
  assert.equal(cookieVault.decryptCobaltKey(encrypted, 'fedcba9876543210fedcba9876543210-other-secret'), null);
});

test('Cobalt cookie helpers parse values and emit secure browser flags', () => {
  assert.ok(cookieVault);
  assert.deepEqual(cookieVault.parseCookies('theme=dark; frxe_cobalt_key=abc.def; x=1'), {
    theme: 'dark',
    frxe_cobalt_key: 'abc.def',
    x: '1',
  });
  const header = cookieVault.cobaltCookieHeader('encrypted-value', { secure: true });
  assert.match(header, /^frxe_cobalt_key=encrypted-value;/);
  assert.match(header, /HttpOnly/i);
  assert.match(header, /Secure/i);
  assert.match(header, /SameSite=Lax/i);
  assert.match(header, /Path=\//i);
  assert.match(header, /Max-Age=15552000/i);
});

test('Cobalt key and secret validation reject unsafe values', () => {
  assert.ok(cookieVault);
  assert.throws(() => cookieVault.encryptCobaltKey('', SECRET), /Cobalt API key/i);
  assert.throws(() => cookieVault.encryptCobaltKey('x'.repeat(5000), SECRET), /Cobalt API key/i);
  assert.throws(() => cookieVault.encryptCobaltKey('valid-key', 'short'), /COOKIE_SECRET/i);
});
