import os
import pathlib
import sys
import unittest
from unittest.mock import patch

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

IMPORT_ERROR = None
try:
    import app as worker_app
    from fastapi.testclient import TestClient
except Exception as exc:
    IMPORT_ERROR = exc
    worker_app = None
    TestClient = None


class FakeMediaResponse:
    status = 206
    headers = {
        'Content-Type': 'audio/webm',
        'Content-Length': '10',
        'Content-Range': 'bytes 10-19/100',
        'Accept-Ranges': 'bytes',
    }

    def __init__(self):
        self._chunks = [b'0123456789', b'']
        self.closed = False

    def read(self, size=-1):
        return self._chunks.pop(0) if self._chunks else b''

    def close(self):
        self.closed = True


class WorkerAppTests(unittest.TestCase):
    def require_app(self):
        detail = f': {type(IMPORT_ERROR).__name__}: {IMPORT_ERROR}' if IMPORT_ERROR else ''
        self.assertIsNotNone(worker_app, f'extractor-worker/app.py must exist and import successfully{detail}')
        self.assertIsNotNone(TestClient)

    def payload(self):
        return {
            'url': 'https://www.youtube.com/watch?v=abc123XYZ_0',
            'downloadMode': 'audio',
            'audioFormat': 'mp3',
            'audioBitrate': '320',
            'videoQuality': '1080',
        }

    def test_extract_requires_worker_bearer_token(self):
        self.require_app()
        with patch.dict(os.environ, {'EXTRACTOR_WORKER_TOKEN': 'test-worker-token'}, clear=False):
            client = TestClient(worker_app.app)
            response = client.post('/extract', json=self.payload())
        self.assertEqual(response.status_code, 401)

    def test_extract_returns_normalized_pipeline_result(self):
        self.require_app()
        expected = {
            'status': 'challenge',
            'challenge': 'captcha_required',
            'message': 'Complete CAPTCHA on source',
            'sourceUrl': self.payload()['url'],
            'extractor': 'yt-dlp',
        }
        with patch.dict(os.environ, {'EXTRACTOR_WORKER_TOKEN': 'test-worker-token'}, clear=False), \
             patch.object(worker_app, 'extract_media', return_value=expected) as extract_media:
            client = TestClient(worker_app.app)
            response = client.post(
                '/extract',
                json=self.payload(),
                headers={'Authorization': 'Bearer test-worker-token'},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected)
        request = extract_media.call_args.args[0]
        self.assertEqual(request['downloadMode'], 'audio')

    def test_extract_rejects_private_source_before_provider_calls(self):
        self.require_app()
        with patch.dict(os.environ, {'EXTRACTOR_WORKER_TOKEN': 'test-worker-token'}, clear=False), \
             patch.object(worker_app, 'extract_media') as extract_media:
            client = TestClient(worker_app.app)
            response = client.post(
                '/extract',
                json={**self.payload(), 'url': 'http://127.0.0.1/private'},
                headers={'Authorization': 'Bearer test-worker-token'},
            )
        self.assertEqual(response.status_code, 400)
        extract_media.assert_not_called()

    def test_stream_extracts_then_relays_range_from_worker(self):
        self.require_app()
        ready = {
            'status': 'ready',
            'type': 'audio',
            'url': 'https://media.example/audio.webm',
            'httpHeaders': {
                'User-Agent': 'yt-dlp-agent',
                'Referer': 'https://www.youtube.com/',
            },
            'extractor': 'yt-dlp',
        }
        fake_media = FakeMediaResponse()
        with patch.dict(os.environ, {'EXTRACTOR_WORKER_TOKEN': 'test-worker-token'}, clear=False), \
             patch.object(worker_app, 'extract_playback_audio', return_value=ready) as extract_playback_audio, \
             patch('urllib.request.urlopen', return_value=fake_media) as urlopen:
            client = TestClient(worker_app.app)
            response = client.get(
                '/stream/dQw4w9WgXcQ',
                headers={'Authorization': 'Bearer test-worker-token', 'Range': 'bytes=10-19'},
            )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers['content-range'], 'bytes 10-19/100')
        self.assertEqual(response.content, b'0123456789')
        request = extract_playback_audio.call_args.args[0]
        self.assertEqual(request['downloadMode'], 'audio')
        media_request = urlopen.call_args.args[0]
        self.assertEqual(media_request.get_header('Range'), 'bytes=10-19')
        self.assertEqual(media_request.get_header('User-agent'), 'yt-dlp-agent')
        self.assertEqual(media_request.get_header('Referer'), 'https://www.youtube.com/')
        self.assertTrue(fake_media.closed)


if __name__ == '__main__':
    unittest.main()
