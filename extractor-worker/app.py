import os
import secrets
import urllib.request
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core import VIDEO_ID_RE, ensure_public_url
from extractors import innertube_extract, ytdlp_extract
from pipeline import extract_media, extract_playback_audio
from relay import build_media_request, copy_media_headers, resolve_audio_url

app = FastAPI(title='FRXE Extractor Worker', docs_url=None, redoc_url=None)


class ExtractRequest(BaseModel):
    url: str = Field(min_length=8, max_length=4096)
    downloadMode: Literal['auto', 'audio', 'mute'] = 'audio'
    audioFormat: Literal['best', 'mp3', 'ogg', 'wav', 'opus'] = 'mp3'
    audioBitrate: Literal['320', '256', '128', '96', '64', '8'] = '320'
    videoQuality: Literal['max', '4320', '2160', '1440', '1080', '720', '480', '360', '240', '144'] = '1080'


def _expected_token():
    value = os.environ.get('EXTRACTOR_WORKER_TOKEN', '').strip()
    if not value:
        raise HTTPException(status_code=503, detail='Extractor worker token is not configured.')
    return value


def _authorize(authorization):
    raw = str(authorization or '')
    prefix = 'Bearer '
    supplied = raw[len(prefix):].strip() if raw.startswith(prefix) else ''
    expected = _expected_token()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail='Invalid worker token.')


@app.get('/health')
def health():
    return {'ok': True}


@app.post('/extract')
def extract(request: ExtractRequest, authorization: str | None = Header(default=None)):
    _authorize(authorization)
    data = request.model_dump()
    try:
        data['url'] = ensure_public_url(data['url'])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        return extract_media(data, innertube_extract, ytdlp_extract)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Extractor worker failed: {str(exc)[:500]}') from exc


@app.get('/stream/{video_id}')
def stream_audio(
    video_id: str,
    authorization: str | None = Header(default=None),
    range_header: str | None = Header(default=None, alias='Range'),
):
    _authorize(authorization)
    if not VIDEO_ID_RE.fullmatch(str(video_id or '')):
        raise HTTPException(status_code=400, detail='Invalid YouTube video id.')

    request_data = {
        'url': f'https://www.youtube.com/watch?v={video_id}',
        'downloadMode': 'audio',
        'audioFormat': 'best',
        'audioBitrate': '320',
        'videoQuality': '1080',
    }
    try:
        result = extract_playback_audio(request_data, innertube_extract, ytdlp_extract)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Extractor worker failed: {str(exc)[:500]}') from exc

    media_url = resolve_audio_url(result)
    if not media_url:
        if isinstance(result, dict) and result.get('status') == 'challenge':
            raise HTTPException(status_code=422, detail=str(result.get('message') or 'This track needs user action before playback.')[:500])
        raise HTTPException(status_code=502, detail=str((result or {}).get('message') if isinstance(result, dict) else 'No playable audio stream was returned.')[:500])

    try:
        upstream = urllib.request.urlopen(
            build_media_request(media_url, range_header, (result or {}).get('httpHeaders')),
            timeout=20,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Upstream media request failed: {str(exc)[:400]}') from exc

    status = int(getattr(upstream, 'status', 200) or 200)
    headers = copy_media_headers(getattr(upstream, 'headers', {}))

    def chunks():
        try:
            while True:
                chunk = upstream.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                upstream.close()
            except Exception:
                pass

    return StreamingResponse(chunks(), status_code=status, headers=headers)
