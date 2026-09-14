const REQUEST_TIMEOUT_MS = 25000;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
const MEDIA_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
];

function configuredWorker(videoId) {
  const raw = String(process.env.EXTRACTOR_WORKER_URL || '').trim();
  if (!raw) throw new Error('EXTRACTOR_WORKER_URL is not configured.');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('EXTRACTOR_WORKER_URL must use HTTPS (HTTP is allowed only for local development).');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/stream/${encodeURIComponent(videoId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function workerToken() {
  const token = String(process.env.EXTRACTOR_WORKER_TOKEN || '').trim();
  if (!token) throw new Error('EXTRACTOR_WORKER_TOKEN is not configured.');
  return token;
}

function videoIdFromRequest(req) {
  const id = String(req?.query?.id || '').trim();
  if (!VIDEO_ID_RE.test(id)) throw new Error('Enter a valid YouTube video id.');
  return id;
}

function copyMediaHeaders(upstream, res) {
  for (const name of MEDIA_HEADERS) {
    const value = upstream.headers?.get?.(name);
    if (value) res.setHeader(name, value);
  }
}

async function workerError(upstream) {
  const contentType = String(upstream.headers?.get?.('content-type') || '');
  if (contentType.includes('json')) {
    const data = await upstream.json().catch(() => ({}));
    return String(data?.detail || data?.error || `Audio worker returned ${upstream.status}.`).slice(0, 500);
  }
  const text = await upstream.text().catch(() => '');
  return String(text || `Audio worker returned ${upstream.status}.`).slice(0, 500);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let id;
  try {
    id = videoIdFromRequest(req);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const headers = {
      Accept: '*/*',
      Authorization: `Bearer ${workerToken()}`,
      'User-Agent': 'FRXE-Web/0.6.9 (+https://music.nont.me)',
    };
    if (req.headers?.range) headers.Range = String(req.headers.range);

    const upstream = await fetch(configuredWorker(id), {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: await workerError(upstream) });
    }
    if (!upstream.body) {
      return res.status(502).json({ error: 'Audio worker returned an empty media stream.' });
    }

    res.statusCode = upstream.status;
    copyMediaHeaders(upstream, res);
    if (!upstream.headers?.get?.('cache-control')) res.setHeader('Cache-Control', 'private, no-store');

    for await (const chunk of upstream.body) res.write(chunk);
    return res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EXTRACTOR_WORKER_(URL|TOKEN)/.test(message)) {
      return res.status(503).json({ error: message });
    }
    return res.status(502).json({ error: message });
  }
}
