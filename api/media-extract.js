import { buildExtractionRequest, normalizeWorkerResult } from '../src/shared/extractorContract.js';

const REQUEST_TIMEOUT_MS = 25000;

function configuredWorker() {
  const raw = String(process.env.EXTRACTOR_WORKER_URL || '').trim();
  if (!raw) throw new Error('EXTRACTOR_WORKER_URL is not configured.');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('EXTRACTOR_WORKER_URL must use HTTPS (HTTP is allowed only for local development).');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/extract`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function workerToken() {
  const token = String(process.env.EXTRACTOR_WORKER_TOKEN || '').trim();
  if (!token) throw new Error('EXTRACTOR_WORKER_TOKEN is not configured.');
  return token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const payload = buildExtractionRequest(body);
    const upstream = await fetch(configuredWorker(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken()}`,
        'User-Agent': 'FRXE-Web/1.0 (+https://music.nont.me)',
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        return res.status(502).json({ error: 'Extractor worker authentication failed.', code: 'extractor_auth_failed' });
      }
      return res.status(502).json({
        error: String(data?.error || data?.detail || `Extractor worker returned ${upstream.status}.`).slice(0, 500),
        code: 'extractor_upstream_error',
      });
    }

    const normalized = normalizeWorkerResult(data);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EXTRACTOR_WORKER_(URL|TOKEN)/.test(message)) {
      return res.status(503).json({ error: message, code: 'extractor_not_configured' });
    }
    return res.status(400).json({ error: message, code: 'extractor_request_invalid' });
  }
}
