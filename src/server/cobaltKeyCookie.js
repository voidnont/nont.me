import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const COBALT_COOKIE_NAME = 'frxe_cobalt_key';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const MAX_KEY_LENGTH = 4096;

function encryptionKey(secret) {
  const value = String(secret || '');
  if (value.length < 32) throw new Error('COBALT_COOKIE_SECRET must be at least 32 characters.');
  return createHash('sha256').update(value).digest();
}

function cleanKey(key) {
  const value = String(key || '').trim();
  if (!value || value.length > MAX_KEY_LENGTH) throw new Error('Cobalt API key must be between 1 and 4096 characters.');
  return value;
}

export function encryptCobaltKey(key, secret) {
  const value = cleanKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptCobaltKey(cookieValue, secret) {
  try {
    const [version, ivEncoded, tagEncoded, encryptedEncoded, extra] = String(cookieValue || '').split('.');
    if (version !== 'v1' || !ivEncoded || !tagEncoded || !encryptedEncoded || extra) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivEncoded, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return cleanKey(decrypted);
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const output = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!name) continue;
    try { output[name] = decodeURIComponent(raw); }
    catch { output[name] = raw; }
  }
  return output;
}

export function cobaltCookieHeader(value, { secure = true, maxAge = COOKIE_MAX_AGE } = {}) {
  const encoded = encodeURIComponent(String(value || ''));
  const parts = [
    `${COBALT_COOKIE_NAME}=${encoded}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
