import {
  COBALT_COOKIE_NAME,
  cobaltCookieHeader,
  decryptCobaltKey,
  encryptCobaltKey,
  parseCookies,
} from '../src/server/cobaltKeyCookie.js';

function cookieSecret() {
  const value = String(process.env.COBALT_COOKIE_SECRET || '');
  if (value.length < 32) throw new Error('COBALT_COOKIE_SECRET must be configured with at least 32 characters.');
  return value;
}

function secureCookie(req) {
  if (process.env.VERCEL_ENV) return true;
  const host = String(req.headers?.host || '').split(':')[0].toLowerCase();
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
}

function savedKey(req) {
  const cookies = parseCookies(req.headers?.cookie || '');
  const encrypted = cookies[COBALT_COOKIE_NAME];
  return encrypted ? decryptCobaltKey(encrypted, cookieSecret()) : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ configured: Boolean(savedKey(req)) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const encrypted = encryptCobaltKey(body.key, cookieSecret());
      res.setHeader('Set-Cookie', cobaltCookieHeader(encrypted, { secure: secureCookie(req) }));
      return res.status(200).json({ configured: true });
    }

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', cobaltCookieHeader('', { secure: secureCookie(req), maxAge: 0 }));
      return res.status(200).json({ configured: false });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /COBALT_COOKIE_SECRET/.test(message) ? 503 : 400;
    return res.status(status).json({ error: message });
  }
}
