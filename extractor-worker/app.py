import os
import secrets
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from core import ensure_public_url
from extractors import innertube_extract, ytdlp_extract
from pipeline import extract_media

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
