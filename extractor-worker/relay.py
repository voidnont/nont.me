import urllib.request

MEDIA_HEADERS = (
    'Content-Type',
    'Content-Length',
    'Content-Range',
    'Accept-Ranges',
    'ETag',
    'Last-Modified',
    'Cache-Control',
)

USER_AGENT = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/153 Safari/537.36'


def build_media_request(url, range_header=None):
    headers = {'User-Agent': USER_AGENT, 'Accept': '*/*'}
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
