import urllib.request
from urllib.parse import urlsplit

MEDIA_HEADERS = (
    'Content-Type',
    'Content-Length',
    'Content-Range',
    'Accept-Ranges',
    'ETag',
    'Last-Modified',
    'Cache-Control',
)
SAFE_REQUEST_HEADERS = {
    'accept': 'Accept',
    'accept-language': 'Accept-Language',
    'origin': 'Origin',
    'referer': 'Referer',
    'user-agent': 'User-Agent',
}

USER_AGENT = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/153 Safari/537.36'


def build_media_request(url, range_header=None, media_headers=None):
    headers = {'User-Agent': USER_AGENT, 'Accept': '*/*'}
    if isinstance(media_headers, dict):
        for name, value in media_headers.items():
            canonical = SAFE_REQUEST_HEADERS.get(str(name).strip().lower())
            if canonical and value is not None and str(value).strip():
                headers[canonical] = str(value)
    if range_header:
        headers['Range'] = range_header
    return urllib.request.Request(url, headers=headers, method='GET')


def copy_media_headers(headers):
    result = {}
    for name in MEDIA_HEADERS:
        value = headers.get(name)
        if value:
            result[name] = str(value)
    return result


def resolve_audio_url(data):
    if not isinstance(data, dict) or data.get('status') != 'ready' or data.get('type') != 'audio':
        return ''
    raw = str(data.get('url') or '').strip()
    try:
        parsed = urlsplit(raw)
    except Exception:
        return ''
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        return ''
    return raw
