import os
import pathlib
import sys
import unittest
from unittest.mock import patch

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

try:
    import app as worker_app
    from fastapi.testclient import TestClient
except Exception:
    worker_app = None
    TestClient = None


class WorkerAppTests(unittest.TestCase):
    def require_app(self):
        self.assertIsNotNone(worker_app, 'extractor-worker/app.py must exist and import successfully')
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


if __name__ == '__main__':
    unittest.main()
