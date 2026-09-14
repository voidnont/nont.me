const REQUEST_TIMEOUT_MS = 25000;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

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

function videoIdFromRequest(req) {
  const id = String(req?.query?.id || '').trim();
  if (!VIDEO_ID_RE.test(id)) throw new Error('Enter a valid YouTube video id.');
  return id;
}

function playableAudioUrl(data) {
  const candidates = data?.status === 'ready'
    ? [data]
    : data?.status === 'picker' && Array.isArray(data.items)
      ? data.items
      : [];
  const item = candidates.find((entry) => entry?.type === 'audio' && entry?.url) || candidates.find((entry) => entry?.url);
  if (!item?.url) return '';
  const url = new URL(String(item.url));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  return url.toString();
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
    const upstream = await fetch(configuredWorker(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken()}`,
        'User-Agent': 'FRXE-Web/1.0 (+https://music.nont.me)',
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${id}`,
        downloadMode: 'audio',
        audioFormat: 'best',
        audioBitrate: '320',
        videoQuality: '1080',
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({ error: String(data?.error || data?.detail || `Audio worker returned ${upstream.status}.`).slice(0, 500) });
    }

    const streamUrl = playableAudioUrl(data);
    if (!streamUrl) {
      const message = data?.message || 'No playable background audio stream was returned for this track.';
      return res.status(502).json({ error: String(message).slice(0, 500) });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.redirect(302, streamUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EXTRACTOR_WORKER_(URL|TOKEN)/.test(message)) {
      return res.status(503).json({ error: message });
    }
    return res.status(502).json({ error: message });
  }
}
