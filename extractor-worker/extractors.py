import json
import urllib.error
import urllib.request

from core import (
    choose_innertube_format,
    choose_ytdlp_format,
    classify_provider_message,
    extract_youtube_id,
)

INNERTUBE_PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
INNERTUBE_CLIENT_VERSION = '2.20260114.08.00'
REQUEST_TIMEOUT_SECONDS = 12


def _innertube_player(video_id):
    payload = json.dumps({
        'context': {
            'client': {
                'clientName': 'WEB',
                'clientVersion': INNERTUBE_CLIENT_VERSION,
                'hl': 'en',
                'gl': 'US',
            }
        },
        'videoId': video_id,
        'contentCheckOk': False,
        'racyCheckOk': False,
    }).encode('utf-8')
    request = urllib.request.Request(
        INNERTUBE_PLAYER_URL,
        data=payload,
        method='POST',
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
            'X-Youtube-Client-Name': '1',
            'X-Youtube-Client-Version': INNERTUBE_CLIENT_VERSION,
        },
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode('utf-8'))


def _playability_message(status):
    if not isinstance(status, dict):
        return ''
    parts = [str(status.get('reason') or '')]
    messages = status.get('messages')
    if isinstance(messages, list):
        parts.extend(str(value) for value in messages)
    error_screen = status.get('errorScreen')
    if error_screen:
        parts.append(json.dumps(error_screen, ensure_ascii=False))
    return ' '.join(part for part in parts if part).strip()


def innertube_extract(request, fetch_json=None):
    source_url = str((request or {}).get('url') or '')
    video_id = extract_youtube_id(source_url)
    if not video_id:
        return None

    fetch_json = fetch_json or _innertube_player
    try:
        data = fetch_json(video_id)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return None

    playability = data.get('playabilityStatus') or {}
    if playability.get('status') != 'OK':
        message = _playability_message(playability) or f"YouTube reported {playability.get('status') or 'unavailable'}."
        challenge = classify_provider_message(message)
        if challenge:
            return {
                'status': 'challenge',
                'challenge': challenge,
                'message': message[:1000],
                'sourceUrl': source_url,
                'extractor': 'innertube',
            }
        return None

    item = choose_innertube_format(
        data.get('streamingData') or {},
        (request or {}).get('downloadMode', 'audio'),
        (request or {}).get('videoQuality', '1080'),
    )
    if not item:
        return None

    title = str((data.get('videoDetails') or {}).get('title') or 'media').strip()
    result = {
        'status': 'ready',
        **item,
        'extractor': 'innertube',
    }
    if title:
        result['filename'] = title[:180]
    return result


def _default_ytdlp_factory(options):
    from yt_dlp import YoutubeDL
    return YoutubeDL(options)


def ytdlp_extract(request, ydl_factory=None):
    source_url = str((request or {}).get('url') or '')
    factory = ydl_factory or _default_ytdlp_factory
    options = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'ignore_no_formats_error': True,
        'socket_timeout': 15,
        'retries': 1,
    }

    try:
        with factory(options) as ydl:
            info = ydl.extract_info(source_url, download=False)
            if hasattr(ydl, 'sanitize_info'):
                info = ydl.sanitize_info(info)
    except Exception as exc:
        message = str(exc)[:1000]
        challenge = classify_provider_message(message)
        if challenge:
            return {
                'status': 'challenge',
                'challenge': challenge,
                'message': message,
                'sourceUrl': source_url,
                'extractor': 'yt-dlp',
            }
        return None

    item = choose_ytdlp_format(
        info,
        (request or {}).get('downloadMode', 'audio'),
        (request or {}).get('videoQuality', '1080'),
    )
    if not item:
        return None
    if item.get('challenge'):
        return {
            'status': 'challenge',
            'challenge': item['challenge'],
            'message': item.get('message') or 'The source requires a user action before extraction can continue.',
            'sourceUrl': source_url,
            'extractor': 'yt-dlp',
        }

    return {
        'status': 'ready',
        **item,
        'extractor': 'yt-dlp',
    }
