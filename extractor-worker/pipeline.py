from core import extract_youtube_id


def _terminal(result):
    if not isinstance(result, dict):
        return False
    return result.get('status') in {'ready', 'picker', 'challenge', 'error'}


def _ready_audio(result):
    return (
        isinstance(result, dict)
        and result.get('status') == 'ready'
        and result.get('type') == 'audio'
        and bool(result.get('url'))
    )


def extract_media(request, innertube_extract, ytdlp_extract):
    source_url = str((request or {}).get('url') or '')

    if extract_youtube_id(source_url):
        result = innertube_extract(request)
        if _terminal(result):
            return result

    result = ytdlp_extract(request)
    if _terminal(result):
        return result

    return {
        'status': 'error',
        'message': 'InnerTube and yt-dlp could not extract this media.',
        'sourceUrl': source_url,
        'extractor': 'yt-dlp',
    }


def extract_playback_audio(request, innertube_extract, ytdlp_extract):
    source_url = str((request or {}).get('url') or '')
    if not extract_youtube_id(source_url):
        return {
            'status': 'error',
            'message': 'Playback requires a valid YouTube video URL.',
            'sourceUrl': source_url,
            'extractor': 'yt-dlp',
        }

    ytdlp_result = ytdlp_extract(request)
    if _ready_audio(ytdlp_result):
        return ytdlp_result

    innertube_result = innertube_extract(request)
    if _ready_audio(innertube_result):
        return innertube_result

    for result in (ytdlp_result, innertube_result):
        if isinstance(result, dict) and result.get('status') == 'challenge':
            return result

    return {
        'status': 'error',
        'message': 'yt-dlp and InnerTube could not extract playable audio.',
        'sourceUrl': source_url,
        'extractor': 'innertube',
    }
