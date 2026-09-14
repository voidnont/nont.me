import pathlib
import sys
import unittest

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

try:
    import extractors
except Exception:
    extractors = None


class ExtractorAdapterTests(unittest.TestCase):
    def require_extractors(self):
        self.assertIsNotNone(extractors, 'extractor-worker/extractors.py must exist')

    def request(self):
        return {
            'url': 'https://www.youtube.com/watch?v=abc123XYZ_0',
            'downloadMode': 'audio',
            'audioFormat': 'mp3',
            'audioBitrate': '320',
            'videoQuality': '1080',
        }

    def test_innertube_ready_result_uses_direct_stream_only(self):
        self.require_extractors()
        calls = []

        def fetch_json(video_id):
            calls.append(video_id)
            return {
                'playabilityStatus': {'status': 'OK'},
                'videoDetails': {'title': 'Signal'},
                'streamingData': {
                    'adaptiveFormats': [
                        {'url': 'https://cdn.example/audio.m4a', 'mimeType': 'audio/mp4; codecs="mp4a.40.2"', 'bitrate': 128000}
                    ]
                },
            }

        result = extractors.innertube_extract(self.request(), fetch_json=fetch_json)
        self.assertEqual(calls, ['abc123XYZ_0'])
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['extractor'], 'innertube')
        self.assertEqual(result['url'], 'https://cdn.example/audio.m4a')

    def test_innertube_playability_message_becomes_user_challenge(self):
        self.require_extractors()

        def fetch_json(video_id):
            return {'playabilityStatus': {'status': 'LOGIN_REQUIRED', 'reason': 'Sign in to confirm your age'}}

        result = extractors.innertube_extract(self.request(), fetch_json=fetch_json)
        self.assertEqual(result['status'], 'challenge')
        self.assertEqual(result['challenge'], 'login_required')
        self.assertEqual(result['sourceUrl'], self.request()['url'])

    def test_innertube_cipher_only_result_falls_through(self):
        self.require_extractors()

        def fetch_json(video_id):
            return {
                'playabilityStatus': {'status': 'OK'},
                'streamingData': {'adaptiveFormats': [{'signatureCipher': 's=x', 'mimeType': 'audio/webm'}]},
            }

        self.assertIsNone(extractors.innertube_extract(self.request(), fetch_json=fetch_json))

    def test_ytdlp_extract_uses_metadata_only_without_cookie_or_login_options(self):
        self.require_extractors()
        captured = {}

        class FakeYDL:
            def __init__(self, options):
                captured.update(options)
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def extract_info(self, url, download=False):
                self.url = url
                self.download = download
                return {
                    'title': 'Signal',
                    'formats': [
                        {'url': 'https://cdn.example/audio.m4a', 'ext': 'm4a', 'acodec': 'mp4a', 'vcodec': 'none', 'abr': 128}
                    ],
                }
            def sanitize_info(self, value):
                return value

        result = extractors.ytdlp_extract(self.request(), ydl_factory=FakeYDL)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['extractor'], 'yt-dlp')
        self.assertTrue(captured.get('skip_download'))
        lowered = ' '.join(captured.keys()).lower()
        self.assertNotIn('cookie', lowered)
        self.assertNotIn('username', lowered)
        self.assertNotIn('password', lowered)

    def test_ytdlp_error_message_becomes_user_challenge(self):
        self.require_extractors()

        class FakeYDL:
            def __init__(self, options):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def extract_info(self, url, download=False):
                raise RuntimeError('Please complete the CAPTCHA in your browser')

        result = extractors.ytdlp_extract(self.request(), ydl_factory=FakeYDL)
        self.assertEqual(result['status'], 'challenge')
        self.assertEqual(result['challenge'], 'captcha_required')
        self.assertIn('CAPTCHA', result['message'])


if __name__ == '__main__':
    unittest.main()
