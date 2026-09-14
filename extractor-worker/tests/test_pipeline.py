import pathlib
import sys
import unittest

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

try:
    import pipeline
except Exception:
    pipeline = None


class PipelineTests(unittest.TestCase):
    def require_pipeline(self):
        self.assertIsNotNone(pipeline, 'extractor-worker/pipeline.py must exist')

    def request(self, url='https://www.youtube.com/watch?v=abc123XYZ_0'):
        return {
            'url': url,
            'downloadMode': 'audio',
            'audioFormat': 'mp3',
            'audioBitrate': '320',
            'videoQuality': '1080',
        }

    def test_youtube_uses_innertube_first_and_stops_on_ready(self):
        self.require_pipeline()
        calls = []

        def innertube(req):
            calls.append('innertube')
            return {'status': 'ready', 'url': 'https://cdn.example/a.m4a', 'extractor': 'innertube'}

        def ytdlp(req):
            calls.append('yt-dlp')
            return {'status': 'fallback', 'reason': 'unexpected'}

        result = pipeline.extract_media(self.request(), innertube, ytdlp)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(calls, ['innertube'])

    def test_youtube_falls_through_to_ytdlp_when_innertube_is_unresolved(self):
        self.require_pipeline()
        calls = []

        def innertube(req):
            calls.append('innertube')
            return None

        def ytdlp(req):
            calls.append('yt-dlp')
            return {'status': 'ready', 'url': 'https://cdn.example/a.m4a', 'extractor': 'yt-dlp'}

        result = pipeline.extract_media(self.request(), innertube, ytdlp)
        self.assertEqual(result['extractor'], 'yt-dlp')
        self.assertEqual(calls, ['innertube', 'yt-dlp'])

    def test_challenge_stops_pipeline_for_user_action(self):
        self.require_pipeline()
        calls = []

        def innertube(req):
            calls.append('innertube')
            return {'status': 'challenge', 'challenge': 'login_required', 'message': 'Sign in on source', 'sourceUrl': req['url'], 'extractor': 'innertube'}

        def ytdlp(req):
            calls.append('yt-dlp')
            return {'status': 'ready', 'url': 'https://cdn.example/a.m4a', 'extractor': 'yt-dlp'}

        result = pipeline.extract_media(self.request(), innertube, ytdlp)
        self.assertEqual(result['status'], 'challenge')
        self.assertEqual(calls, ['innertube'])

    def test_non_youtube_skips_innertube_and_uses_ytdlp(self):
        self.require_pipeline()
        calls = []

        def innertube(req):
            calls.append('innertube')
            return None

        def ytdlp(req):
            calls.append('yt-dlp')
            return {'status': 'ready', 'url': 'https://cdn.example/v.mp4', 'extractor': 'yt-dlp'}

        result = pipeline.extract_media(self.request('https://vimeo.com/12345'), innertube, ytdlp)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(calls, ['yt-dlp'])

    def test_unresolved_extractors_return_cobalt_fallback_marker(self):
        self.require_pipeline()
        result = pipeline.extract_media(self.request(), lambda req: None, lambda req: None)
        self.assertEqual(result, {'status': 'fallback', 'reason': 'unresolved_by_innertube_and_yt_dlp'})


if __name__ == '__main__':
    unittest.main()
