import pathlib
import sys
import unittest

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

import core
import pipeline
import relay


class PlaybackRegressionTests(unittest.TestCase):
    def request(self):
        return {
            'url': 'https://www.youtube.com/watch?v=kpK4cDk2bRs',
            'downloadMode': 'audio',
            'audioFormat': 'best',
            'audioBitrate': '320',
            'videoQuality': '1080',
        }

    def test_playback_prefers_ytdlp_before_innertube_web(self):
        calls = []

        def ytdlp(req):
            calls.append('yt-dlp')
            return {
                'status': 'ready',
                'type': 'audio',
                'url': 'https://rr.example.googlevideo.com/audio',
                'extractor': 'yt-dlp',
            }

        def innertube(req):
            calls.append('innertube')
            return {
                'status': 'challenge',
                'challenge': 'login_required',
                'message': 'Sign in to confirm you are not a bot',
                'extractor': 'innertube',
            }

        result = pipeline.extract_playback_audio(self.request(), innertube, ytdlp)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['extractor'], 'yt-dlp')
        self.assertEqual(calls, ['yt-dlp'])

    def test_ytdlp_audio_format_preserves_required_http_headers(self):
        info = {
            'title': 'No Time For Caution',
            'http_headers': {
                'User-Agent': 'yt-dlp-global-agent',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            'formats': [
                {
                    'url': 'https://rr.example.googlevideo.com/audio',
                    'ext': 'm4a',
                    'acodec': 'mp4a',
                    'vcodec': 'none',
                    'abr': 128,
                    'http_headers': {
                        'User-Agent': 'yt-dlp-format-agent',
                        'Referer': 'https://www.youtube.com/',
                        'Origin': 'https://www.youtube.com',
                    },
                }
            ],
        }

        item = core.choose_ytdlp_format(info, 'audio', 'max')
        self.assertEqual(item['httpHeaders']['User-Agent'], 'yt-dlp-format-agent')
        self.assertEqual(item['httpHeaders']['Referer'], 'https://www.youtube.com/')
        self.assertEqual(item['httpHeaders']['Origin'], 'https://www.youtube.com')
        self.assertEqual(item['httpHeaders']['Accept-Language'], 'en-US,en;q=0.9')

    def test_relay_sends_extractor_headers_and_range(self):
        request = relay.build_media_request(
            'https://rr.example.googlevideo.com/audio',
            'bytes=0-1023',
            {
                'User-Agent': 'yt-dlp-format-agent',
                'Referer': 'https://www.youtube.com/',
                'Origin': 'https://www.youtube.com',
                'Accept-Language': 'en-US,en;q=0.9',
                'Authorization': 'must-not-forward',
                'Cookie': 'must-not-forward',
            },
        )

        self.assertEqual(request.get_header('Range'), 'bytes=0-1023')
        self.assertEqual(request.get_header('User-agent'), 'yt-dlp-format-agent')
        self.assertEqual(request.get_header('Referer'), 'https://www.youtube.com/')
        self.assertEqual(request.get_header('Origin'), 'https://www.youtube.com')
        self.assertEqual(request.get_header('Accept-language'), 'en-US,en;q=0.9')
        self.assertIsNone(request.get_header('Authorization'))
        self.assertIsNone(request.get_header('Cookie'))


if __name__ == '__main__':
    unittest.main()
