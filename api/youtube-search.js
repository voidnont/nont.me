let cachedClientVersion = null;
let cachedClientVersionAt = 0;

const FALLBACK_CLIENT_VERSIONS = [
  '2.20260114.08.00',
  '2.20240916.00.00',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run?.text || '').join('');
  return '';
}

function thumbnailOf(renderer, id) {
  const direct = renderer?.thumbnail?.thumbnails;
  const nested = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const thumbnails = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  return thumbnails.at(-1)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function durationOf(renderer) {
  return textOf(renderer?.lengthText) ||
    textOf(renderer?.thumbnailOverlays?.find?.((entry) => entry?.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text) ||
    null;
}

function artistOf(renderer) {
  return textOf(renderer?.ownerText) ||
    textOf(renderer?.shortBylineText) ||
    textOf(renderer?.longBylineText) ||
    'YouTube';
}

function collectVideos(node, out, seen) {
  if (!node || out.length >= 36) return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, seen);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, child] of Object.entries(node)) {
    if (key === 'videoRenderer' || key === 'compactVideoRenderer' || key === 'playlistVideoRenderer') {
      const id = child?.videoId;
      const title = textOf(child?.title);
      if (id && title && !seen.has(id)) {
        seen.add(id);
        out.push({
          id,
          title,
          artist: artistOf(child),
          thumbnail: thumbnailOf(child, id),
          duration: durationOf(child),
          publishedAt: textOf(child?.publishedTimeText) || null,
        });
      }
    }
    collectVideos(child, out, seen);
  }
}

async function resolveClientVersion() {
  const now = Date.now();
  if (cachedClientVersion && now - cachedClientVersionAt < 6 * 60 * 60 * 1000) return cachedClientVersion;

  try {
    const response = await fetch('https://www.youtube.com/', {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)
        || html.match(/"clientVersion":"([^"]+)"/);
      if (match?.[1]) {
        cachedClientVersion = match[1];
        cachedClientVersionAt = now;
        return cachedClientVersion;
      }
    }
  } catch {
    // Fall through to known WEB versions below.
  }
  return FALLBACK_CLIENT_VERSIONS[0];
}

async function runInnerTubeSearch(query, clientVersion) {
  const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': clientVersion,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion,
          hl: 'en',
          gl: 'US',
        },
      },
      query,
    }),
  });

  if (!response.ok) {
    throw new Error(`InnerTube returned ${response.status}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const q = String(req.query?.q || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: 'Enter a search term.' });

  try {
    const discovered = await resolveClientVersion();
    const versions = [...new Set([discovered, ...FALLBACK_CLIENT_VERSIONS])];
    let payload = null;
    let lastError = null;

    for (const version of versions) {
      try {
        payload = await runInnerTubeSearch(q, version);
        if (payload) break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!payload) throw lastError || new Error('YouTube search failed.');

    const items = [];
    collectVideos(payload, items, new Set());

    // Keep the response focused and lightweight for the web player.
    const results = items.slice(0, 30);
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    return res.status(200).json({
      items: results,
      source: 'youtube-innertube-web',
      apiKeyRequired: false,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'YouTube search is temporarily unavailable. YouTube may have changed or rate-limited its public WEB endpoint.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
