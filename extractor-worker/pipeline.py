from core import extract_youtube_id


def _terminal(result):
    if not isinstance(result, dict):
        return False
    return result.get('status') in {'ready', 'picker', 'challenge', 'error'}


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
