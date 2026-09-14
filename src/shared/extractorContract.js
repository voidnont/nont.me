const DOWNLOAD_MODES = new Set(['auto', 'audio', 'mute']);
const AUDIO_FORMATS = new Set(['best', 'mp3', 'ogg', 'wav', 'opus']);
const AUDIO_BITRATES = new Set(['320', '256', '128', '96', '64', '8']);
const VIDEO_QUALITIES = new Set(['max', '4320', '2160', '1440', '1080', '720', '480', '360', '240', '144']);
const CHALLENGES = new Set(['login_required', 'captcha_required', 'consent_required', 'age_verification', 'drm_protected']);

function isUnsafeHostname(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return true;

  const parts = host.split('.');
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const octets = parts.map(Number);
    if (octets.some((value) => value < 0 || value > 255)) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
  }
  return false;
}

export function normalizePublicHttpUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw new Error('Enter a valid HTTP or HTTPS media URL.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an HTTP or HTTPS media URL.');
  if (isUnsafeHostname(url.hostname)) throw new Error('Use a public media URL, not a local or private network address.');
  url.username = '';
  url.password = '';
  return url.toString();
}

export function buildExtractionRequest(input = {}) {
  const downloadMode = DOWNLOAD_MODES.has(input.downloadMode) ? input.downloadMode : 'audio';
  const audioFormat = AUDIO_FORMATS.has(input.audioFormat) ? input.audioFormat : 'mp3';
  const audioBitrate = AUDIO_BITRATES.has(String(input.audioBitrate)) ? String(input.audioBitrate) : '320';
  const videoQuality = VIDEO_QUALITIES.has(String(input.videoQuality)) ? String(input.videoQuality) : '1080';
  return {
    url: normalizePublicHttpUrl(input.url),
    downloadMode,
    audioFormat,
    audioBitrate,
    videoQuality,
  };
}

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeItem(item = {}) {
  const normalized = {
    url: normalizePublicHttpUrl(item.url),
  };
  const filename = cleanText(item.filename);
  const type = cleanText(item.type);
  const mime = cleanText(item.mime);
  const thumb = item.thumb ? normalizePublicHttpUrl(item.thumb) : '';
  if (filename) normalized.filename = filename.slice(0, 512);
  if (type) normalized.type = type.slice(0, 32);
  if (mime) normalized.mime = mime.slice(0, 128);
  if (thumb) normalized.thumb = thumb;
  return normalized;
}

export function normalizeWorkerResult(value = {}) {
  const status = String(value.status || '');
  if (status === 'ready') {
    const item = normalizeItem(value);
    return {
      status: 'ready',
      ...item,
      extractor: cleanText(value.extractor, 'worker').slice(0, 32),
    };
  }

  if (status === 'picker') {
    const items = Array.isArray(value.items) ? value.items.slice(0, 100).map(normalizeItem) : [];
    if (!items.length) throw new Error('Extractor picker did not include downloadable items.');
    return {
      status: 'picker',
      extractor: cleanText(value.extractor, 'worker').slice(0, 32),
      items,
    };
  }

  if (status === 'challenge') {
    const challenge = String(value.challenge || '');
    if (!CHALLENGES.has(challenge)) throw new Error('Extractor returned an unsupported challenge.');
    return {
      status: 'challenge',
      challenge,
      message: cleanText(value.message, 'The source requires an action before extraction can continue.').slice(0, 1000),
      sourceUrl: normalizePublicHttpUrl(value.sourceUrl),
      extractor: cleanText(value.extractor, 'worker').slice(0, 32),
    };
  }

  if (status === 'error') {
    return {
      status: 'error',
      message: cleanText(value.message, 'The media could not be extracted.').slice(0, 1000),
      sourceUrl: normalizePublicHttpUrl(value.sourceUrl),
      extractor: cleanText(value.extractor, 'worker').slice(0, 32),
    };
  }

  throw new Error('Extractor worker returned an unsupported response.');
}
