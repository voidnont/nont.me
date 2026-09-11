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

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*(official|video|audio|lyrics?|visualizer|hd|4k)[^)]*\)/g, ' ')
    .replace(/\[[^\]]*(official|video|audio|lyrics?|visualizer|hd|4k)[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanTitle(value = '') {
  const original = String(value).trim();
  const clean = original
    .replace(/\s*[\[(](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|lyric\s+video|visualizer|hd|4k|hq|mv)[^\])]?[\])]/gi, ' ')
    .replace(/\s*[|·•-]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|hd|4k|hq)\s*$/gi, ' ')
    .replace(/\s+official\s+(?:music\s+)?(?:video|audio)\s*$/gi, ' ')
    .replace(/\s+(?:lyrics?|lyric\s+video|visualizer)\s*$/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean || original;
}

function cleanArtist(value = '') {
  const original = String(value).trim();
  const clean = original
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .replace(/vevo\s*$/i, '')
    .replace(/\s*[-–—]?\s*official\s+(?:artist\s+)?channel\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean || original;
}

function buildProviderMusicQuery(value) {
  const clean = String(value || '').trim();
  if (!clean) return clean;
  const alreadyMusicFocused = /\b(song|songs|music|audio|lyrics?|official|album|artist|playlist|remix|instrumental|soundtrack|ep|single|radio|mix)\b/i.test(clean);
  return alreadyMusicFocused ? clean : `${clean} song`;
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

function rawArtistOf(renderer) {
  return textOf(renderer?.ownerText) || textOf(renderer?.shortBylineText) || textOf(renderer?.longBylineText) || 'YouTube';
}

function officialInfo(renderer, rawArtist, title) {
  const badgeText = JSON.stringify([renderer?.ownerBadges, renderer?.badges]);
  const topic = /\s[-–—]\s*topic\s*$/i.test(rawArtist);
  const vevo = /vevo\s*$/i.test(rawArtist);
  const verifiedArtist = /OFFICIAL_ARTIST|VERIFIED_ARTIST|Official Artist Channel/i.test(badgeText);
  const channelOfficial = /official(?:\s+artist)?\s+channel/i.test(rawArtist);
  const titleOfficial = /\bofficial\b.*\b(video|audio|music)\b/i.test(title);
  return {
    official: verifiedArtist || topic || vevo || channelOfficial,
    topic,
    vevo,
    titleOfficial,
  };
}

function refineMetadata(titleValue, artistValue) {
  let title = cleanTitle(titleValue);
  let artist = cleanArtist(artistValue);
  const genericArtist = !artist || /^(youtube|youtube music|unknown artist)$/i.test(artist);
  const split = title.match(/^(.{2,80}?)\s+[-–—]\s+(.{2,160})$/);
  if (split && genericArtist) {
    artist = cleanArtist(split[1]);
    title = cleanTitle(split[2]);
  } else if (split && artist && normalize(split[1]) === normalize(artist)) {
    title = cleanTitle(split[2]);
  }
  return { title, artist: artist || artistValue || 'YouTube' };
}

function resultScore(item, query) {
  const text = `${item.title} ${item.artist}`.toLowerCase();
  const q = normalize(query);
  let score = 0;
  if (item.official) score += 40;
  if (item.topic || item.vevo) score += 20;
  if (item.titleOfficial) score += 8;
  if (/\b(audio|lyrics?|music|song|remix|album|single)\b/i.test(text)) score += 5;
  if (q && normalize(`${item.artist} ${item.title}`).includes(q)) score += 10;
  if (/\b(reaction|review|interview|podcast|trailer|gameplay|tutorial|cover by|karaoke)\b/i.test(text)) score -= 25;
  if (/\b(shorts?|tiktok|edit|fanmade|fan made)\b/i.test(text)) score -= 12;
  return score;
}

function collectVideos(node, out, seen) {
  if (!node || out.length >= 60) return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, seen);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, child] of Object.entries(node)) {
    if (key === 'videoRenderer' || key === 'compactVideoRenderer' || key === 'playlistVideoRenderer') {
      const id = child?.videoId;
      const rawTitle = textOf(child?.title);
      const rawArtist = rawArtistOf(child);
      if (id && rawTitle && !seen.has(id)) {
        seen.add(id);
        const official = officialInfo(child, rawArtist, rawTitle);
        const metadata = refineMetadata(rawTitle, rawArtist);
        out.push({
          id,
          title: metadata.title,
          artist: metadata.artist,
          thumbnail: thumbnailOf(child, id),
          duration: durationOf(child),
          publishedAt: textOf(child?.publishedTimeText) || null,
          official: official.official,
          topic: official.topic,
          vevo: official.vevo,
          titleOfficial: official.titleOfficial,
        });
      }
    }
    collectVideos(child, out, seen);
  }
}

function mergeAndRank(items, query) {
  const deduped = new Map();
  for (const item of items) {
    const key = `${normalize(item.artist)}|${normalize(item.title)}`;
    const scored = { ...item, score: resultScore(item, query) };
    const previous = deduped.get(key);
    if (!previous || scored.score > previous.score) deduped.set(key, scored);
  }
  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(({ score, titleOfficial, ...item }) => item);
}

async function resolveClientVersion() {
  const now = Date.now();
  if (cachedClientVersion && now - cachedClientVersionAt < 6 * 60 * 60 * 1000) return cachedClientVersion;

  try {
    const response = await fetch('https://www.youtube.com/', {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || html.match(/"clientVersion":"([^"]+)"/);
      if (match?.[1]) {
        cachedClientVersion = match[1];
        cachedClientVersionAt = now;
        return cachedClientVersion;
      }
    }
  } catch { /* fall through */ }
  return FALLBACK_CLIENT_VERSIONS[0];
}

async function runInnerTubeSearch(query, clientVersion) {
  const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': clientVersion,
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' } },
      query,
    }),
  });
  if (!response.ok) throw new Error(`InnerTube returned ${response.status}`);
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
    const providerQuery = buildProviderMusicQuery(q);
    let payload = null;
    let lastError = null;

    for (const version of versions) {
      try {
        payload = await runInnerTubeSearch(providerQuery, version);
        if (payload) break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!payload) throw lastError || new Error('YouTube search failed.');

    const items = [];
    collectVideos(payload, items, new Set());
    const results = mergeAndRank(items, q);

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    return res.status(200).json({
      items: results,
      source: 'youtube-innertube-web',
      apiKeyRequired: false,
      providerQueryAdjusted: providerQuery !== q,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'YouTube search is temporarily unavailable. YouTube may have changed or rate-limited its public WEB endpoint.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
