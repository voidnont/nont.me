const AUDIO_FORMATS = new Set(['best', 'mp3', 'ogg', 'wav', 'opus']);
const AUDIO_BITRATES = new Set(['320', '256', '128', '96', '64', '8']);
const DOWNLOAD_MODES = new Set(['auto', 'audio', 'mute']);
const VIDEO_QUALITIES = new Set(['max', '4320', '2160', '1440', '1080', '720', '480', '360', '240', '144']);

function cleanOption(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function isPrivateHostname(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^(127|0)\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/i.test(host)) return true;
  return false;
}

export function normalizePublicMediaUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('Enter a valid HTTP or HTTPS media URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Enter an HTTP or HTTPS media URL.');
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Enter a public media URL, not a local or private-network address.');
  }
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}

export function buildCobaltPayload(input = {}) {
  return {
    url: normalizePublicMediaUrl(input.url),
    downloadMode: cleanOption(input.downloadMode, DOWNLOAD_MODES, 'auto'),
    audioFormat: cleanOption(input.audioFormat, AUDIO_FORMATS, 'mp3'),
    audioBitrate: cleanOption(input.audioBitrate, AUDIO_BITRATES, '128'),
    videoQuality: cleanOption(input.videoQuality, VIDEO_QUALITIES, '1080'),
    filenameStyle: 'pretty',
    localProcessing: 'disabled',
  };
}

function safeDownloadUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function normalizeCobaltResponse(data = {}) {
  const status = String(data?.status || '');

  if (status === 'tunnel' || status === 'redirect') {
    const url = safeDownloadUrl(data.url);
    if (!url) throw new Error('Cobalt returned an invalid download URL.');
    return {
      status,
      url,
      filename: String(data.filename || 'frxe-media'),
    };
  }

  if (status === 'picker') {
    const items = [];
    const audio = safeDownloadUrl(data.audio);
    if (audio) items.push({ type: 'audio', url: audio, filename: String(data.audioFilename || 'audio') });
    for (const item of Array.isArray(data.picker) ? data.picker : []) {
      const url = safeDownloadUrl(item?.url);
      if (!url) continue;
      const normalized = { type: String(item?.type || 'media'), url };
      const thumb = safeDownloadUrl(item?.thumb);
      if (thumb) normalized.thumb = thumb;
      items.push(normalized);
    }
    if (!items.length) throw new Error('Cobalt returned an empty media picker.');
    return { status: 'picker', items };
  }

  if (status === 'local-processing') {
    throw new Error('This Cobalt result requires local processing, which FRXE Web keeps disabled.');
  }

  const code = String(data?.error?.code || 'Cobalt could not process that link.');
  throw new Error(code);
}
