import ipaddress
import re
import socket
from urllib.parse import parse_qs, urlsplit, urlunsplit

YOUTUBE_HOSTS = {
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'www.youtu.be',
}
VIDEO_ID_RE = re.compile(r'^[A-Za-z0-9_-]{6,20}$')
SAFE_MEDIA_REQUEST_HEADERS = {
    'accept': 'Accept',
    'accept-language': 'Accept-Language',
    'origin': 'Origin',
    'referer': 'Referer',
    'user-agent': 'User-Agent',
}


def ensure_public_url(value: str) -> str:
    raw = str(value or '').strip()
    try:
        parsed = urlsplit(raw)
    except Exception as exc:
        raise ValueError('Enter a valid HTTP or HTTPS public media URL.') from exc

    if parsed.scheme not in {'http', 'https'}:
        raise ValueError('Use an HTTP or HTTPS public media URL.')
    if not parsed.hostname:
        raise ValueError('Use a public media URL with a hostname.')
    if parsed.username or parsed.password:
        raise ValueError('Embedded credentials are not allowed in public media URLs.')

    host = parsed.hostname
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        if not literal.is_global:
            raise ValueError('Use a public media URL, not a private or local address.')
    else:
        try:
            addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
        except OSError as exc:
            raise ValueError('The public media URL hostname could not be resolved.') from exc
        if not addresses:
            raise ValueError('The public media URL hostname could not be resolved.')
        for entry in addresses:
            address = entry[4][0]
            try:
                if not ipaddress.ip_address(address).is_global:
                    raise ValueError('Use a public media URL, not a private or local address.')
            except ValueError as exc:
                if 'public media URL' in str(exc):
                    raise
                raise ValueError('The public media URL resolved to an invalid address.') from exc

    normalized = urlunsplit((parsed.scheme, parsed.netloc, parsed.path or '', parsed.query, ''))
    return normalized


def extract_youtube_id(value: str):
    try:
        parsed = urlsplit(str(value or '').strip())
    except Exception:
        return None
    host = (parsed.hostname or '').lower()
    if host not in YOUTUBE_HOSTS:
        return None

    candidate = None
    if host.endswith('youtu.be'):
        candidate = parsed.path.strip('/').split('/')[0] if parsed.path.strip('/') else None
    elif parsed.path == '/watch':
        candidate = parse_qs(parsed.query).get('v', [None])[0]
    else:
        parts = [part for part in parsed.path.split('/') if part]
        if len(parts) >= 2 and parts[0] in {'shorts', 'embed', 'live'}:
            candidate = parts[1]

    return candidate if candidate and VIDEO_ID_RE.fullmatch(candidate) else None


def classify_provider_message(message: str):
    text = str(message or '').lower()
    if not text:
        return None
    if re.search(r'\bdrm\b|digital rights management|protected content', text):
        return 'drm_protected'
    if re.search(r'age[- ]?verification|verify (?:your )?age|age[- ]?restricted', text):
        return 'age_verification'
    if re.search(r'consent|required consent|accept (?:the )?terms|privacy consent', text):
        return 'consent_required'
    if re.search(r'\bsign[ -]?in\b|\blog[ -]?in\b|login required|account required', text):
        return 'login_required'
    if re.search(r'captcha|confirm (?:you are|you\'re) (?:human|not a bot)|robot check|not a robot', text):
        return 'captcha_required'
    return None


def _mime(format_info):
    return str(format_info.get('mimeType') or format_info.get('mime_type') or '').split(';', 1)[0].strip().lower()


def _has_audio(format_info):
    mime = str(format_info.get('mimeType') or '')
    if mime.startswith('audio/'):
        return True
    codecs = mime.lower()
    return any(codec in codecs for codec in ('mp4a', 'opus', 'vorbis', 'aac'))


def _has_video(format_info):
    mime = str(format_info.get('mimeType') or '')
    return mime.startswith('video/')


def _quality_limit(quality):
    if str(quality) == 'max':
        return None
    try:
        return max(1, int(quality))
    except (TypeError, ValueError):
        return 1080


def _choose_by_height(candidates, quality):
    if not candidates:
        return None
    limit = _quality_limit(quality)
    if limit is not None:
        under = [item for item in candidates if int(item.get('height') or 0) <= limit]
        if under:
            candidates = under
        else:
            candidates = sorted(candidates, key=lambda item: int(item.get('height') or 0))[:1]
    return max(candidates, key=lambda item: (int(item.get('height') or 0), int(item.get('bitrate') or 0)))


def _normalize_innertube_item(item, media_type):
    result = {
        'url': item['url'],
        'type': media_type,
    }
    mime = _mime(item)
    if mime:
        result['mime'] = mime
    return result


def _media_http_headers(*sources):
    merged = {}
    for source in sources:
        if not isinstance(source, dict):
            continue
        for name, value in source.items():
            canonical = SAFE_MEDIA_REQUEST_HEADERS.get(str(name).strip().lower())
            if canonical and value is not None and str(value).strip():
                merged[canonical] = str(value)
    return merged


def choose_innertube_format(streaming_data, mode='audio', quality='1080'):
    if not isinstance(streaming_data, dict):
        return None
    formats = []
    for key in ('formats', 'adaptiveFormats'):
        values = streaming_data.get(key) or []
        if isinstance(values, list):
            formats.extend(item for item in values if isinstance(item, dict) and item.get('url'))

    if mode == 'audio':
        candidates = [item for item in formats if _mime(item).startswith('audio/')]
        if not candidates:
            return None
        chosen = max(candidates, key=lambda item: int(item.get('bitrate') or item.get('averageBitrate') or 0))
        return _normalize_innertube_item(chosen, 'audio')

    if mode == 'mute':
        video_only = [item for item in formats if _has_video(item) and not _has_audio(item)]
        candidates = video_only or [item for item in formats if _has_video(item)]
        chosen = _choose_by_height(candidates, quality)
        return _normalize_innertube_item(chosen, 'video') if chosen else None

    candidates = [item for item in formats if _has_video(item) and _has_audio(item)]
    chosen = _choose_by_height(candidates, quality)
    return _normalize_innertube_item(chosen, 'video') if chosen else None


def _safe_filename(title, ext):
    clean = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', '_', str(title or 'media')).strip(' .') or 'media'
    clean = clean[:180]
    extension = re.sub(r'[^A-Za-z0-9]+', '', str(ext or 'bin')) or 'bin'
    return f'{clean}.{extension}'


def choose_ytdlp_format(info, mode='audio', quality='1080'):
    if not isinstance(info, dict):
        return None
    formats = [item for item in (info.get('formats') or []) if isinstance(item, dict) and item.get('url')]
    if not formats and info.get('url'):
        formats = [info]
    if not formats:
        return None

    usable = [item for item in formats if not item.get('has_drm')]
    if not usable:
        return {
            'challenge': 'drm_protected',
            'message': 'This source reports DRM-protected media. Open the source to view it normally.',
        }

    if mode == 'audio':
        preferred = [item for item in usable if str(item.get('acodec') or 'none') != 'none' and str(item.get('vcodec') or 'none') == 'none']
        candidates = preferred or [item for item in usable if str(item.get('acodec') or 'none') != 'none']
        if not candidates:
            return None
        chosen = max(candidates, key=lambda item: float(item.get('abr') or item.get('tbr') or 0))
        media_type = 'audio'
    else:
        video_candidates = [item for item in usable if str(item.get('vcodec') or 'none') != 'none']
        if mode == 'auto':
            combined = [item for item in video_candidates if str(item.get('acodec') or 'none') != 'none']
            video_candidates = combined or video_candidates
        else:
            muted = [item for item in video_candidates if str(item.get('acodec') or 'none') == 'none']
            video_candidates = muted or video_candidates
        chosen = _choose_by_height(video_candidates, quality)
        if not chosen:
            return None
        media_type = 'video'

    ext = chosen.get('ext') or ('m4a' if media_type == 'audio' else 'mp4')
    result = {
        'url': chosen['url'],
        'filename': _safe_filename(info.get('title') or chosen.get('title') or 'media', ext),
        'type': media_type,
    }
    mime = chosen.get('mime_type') or chosen.get('mimeType')
    if mime:
        result['mime'] = str(mime).split(';', 1)[0]
    http_headers = _media_http_headers(info.get('http_headers'), chosen.get('http_headers'))
    if http_headers:
        result['httpHeaders'] = http_headers
    return result
