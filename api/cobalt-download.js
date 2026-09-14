import { buildCobaltPayload, normalizeCobaltResponse } from '../src/shared/cobalt.js';

const REQUEST_TIMEOUT_MS = 20000;
const FORWARDED_RATE_HEADERS = ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'retry-after'];

function configuredEndpoint() {
  const value = String(process.env.COBALT_API_URL || '').trim();
  if (!value) throw new Error('Cobalt is not configured. Set COBALT_API_URL to your Cobalt instance.');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
    throw new Error('COBALT_API_URL must use HTTPS (HTTP is allowed only for local development).');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function authHeader() {
  const key = String(process.env.COBALT_API_KEY || '').trim();
  if (!key) return null;
  const scheme = String(process.env.COBALT_AUTH_SCHEME || 'Api-Key').trim();
  return `${scheme || 'Api-Key'} ${key}`;
}

function forwardRateHeaders(upstream, res) {
  for (const name of FORWARDED_RATE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const endpoint = configuredEndpoint();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const payload = buildCobaltPayload(body);
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FRXE-Web/1.0 (+https://music.nont.me)',
    };
    const authorization = authHeader();
    if (authorization) headers.Authorization = authorization;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    forwardRateHeaders(upstream, res);

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const code = String(data?.error?.code || `Cobalt returned ${upstream.status}`);
      const status = upstream.status === 429 ? 429 : 502;
      return res.status(status).json({ error: code });
    }

    try {
      const normalized = normalizeCobaltResponse(data);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(normalized);
    } catch (error) {
      return res.status(422).json({ error: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not configured|COBALT_API_URL/i.test(message) ? 503 : 400;
    return res.status(status).json({ error: message });
  }
}
