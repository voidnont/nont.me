import pathlib
import sys
import unittest
from unittest.mock import patch

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

try:
    import core
except Exception:
    core = None


class ExtractorCoreTests(unittest.TestCase):
    def require_core(self):
        self.assertIsNotNone(core, 'extractor-worker/core.py must exist')

    def test_core_module_exists(self):
        self.require_core()

    def test_extract_youtube_id_supports_watch_share_and_shorts(self):
        self.require_core()
        self.assertEqual(core.extract_youtube_id('https://www.youtube.com/watch?v=abc123XYZ_0'), 'abc123XYZ_0')
        self.assertEqual(core.extract_youtube_id('https://youtu.be/abc123XYZ_0?t=3'), 'abc123XYZ_0')
        self.assertEqual(core.extract_youtube_id('https://www.youtube.com/shorts/abc123XYZ_0'), 'abc123XYZ_0')
        self.assertIsNone(core.extract_youtube_id('https://example.com/watch?v=abc123XYZ_0'))

    def test_public_url_validation_rejects_private_and_resolved_private_targets(self):
        self.require_core()
        for url in (
            'file:///etc/passwd',
            'http://127.0.0.1/a',
            'http://10.0.0.8/a',
            'http://169.254.1.1/a',
            'http://[::1]/a',
        ):
            with self.assertRaisesRegex(ValueError, 'public|HTTP'):
                core.ensure_public_url(url)

        with patch('core.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('192.168.1.8', 0))]):
            with self.assertRaisesRegex(ValueError, 'public'):
                core.ensure_public_url('https://media.example.test/item')

        with patch('core.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 0))]):
            self.assertEqual(core.ensure_public_url('https://example.com/media'), 'https://example.com/media')

    def test_provider_challenge_classification(self):
        self.require_core()
        self.assertEqual(core.classify_provider_message('Sign in to confirm you are not a bot'), 'login_required')
        self.assertEqual(core.classify_provider_message('Please complete the CAPTCHA to continue'), 'captcha_required')
        self.assertEqual(core.classify_provider_message('Consent is required before playback'), 'consent_required')
        self.assertEqual(core.classify_provider_message('Age verification required'), 'age_verification')
        self.assertEqual(core.classify_provider_message('This media is DRM protected'), 'drm_protected')
        self.assertIsNone(core.classify_provider_message('Video unavailable in this region'))

    def test_innertube_audio_selection_uses_only_direct_urls(self):
        self.require_core()
        streaming = {
            'adaptiveFormats': [
                {
                    'itag': 140,
                    'url': 'https://cdn.example/audio.m4a',
                    'mimeType': 'audio/mp4; codecs="mp4a.40.2"',
                    'bitrate': 128000,
                    'audioQuality': 'AUDIO_QUALITY_MEDIUM',
                },
                {
                    'itag': 251,
                    'signatureCipher': 'url=https%3A%2F%2Fcdn.example%2Fciphered.webm&s=abc',
                    'mimeType': 'audio/webm; codecs="opus"',
                    'bitrate': 160000,
                },
            ]
        }
        item = core.choose_innertube_format(streaming, 'audio', 'max')
        self.assertEqual(item['url'], 'https://cdn.example/audio.m4a')
        self.assertEqual(item['type'], 'audio')

    def test_innertube_video_selection_honors_quality_and_requires_audio_for_auto(self):
        self.require_core()
        streaming = {
            'formats': [
                {
                    'url': 'https://cdn.example/1080.mp4',
                    'mimeType': 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
                    'height': 1080,
                    'width': 1920,
                    'bitrate': 4500000,
                },
                {
                    'url': 'https://cdn.example/720.mp4',
                    'mimeType': 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"',
                    'height': 720,
                    'width': 1280,
                    'bitrate': 2500000,
                },
            ],
            'adaptiveFormats': [
                {
                    'url': 'https://cdn.example/video-only-1440.mp4',
                    'mimeType': 'video/mp4; codecs="avc1.640032"',
                    'height': 1440,
                    'bitrate': 6000000,
                }
            ],
        }
        auto = core.choose_innertube_format(streaming, 'auto', '720')
        self.assertEqual(auto['url'], 'https://cdn.example/720.mp4')
        muted = core.choose_innertube_format(streaming, 'mute', 'max')
        self.assertEqual(muted['url'], 'https://cdn.example/video-only-1440.mp4')

    def test_innertube_returns_none_when_only_ciphered_formats_exist(self):
        self.require_core()
        streaming = {'adaptiveFormats': [{'signatureCipher': 's=abc', 'mimeType': 'audio/webm'}]}
        self.assertIsNone(core.choose_innertube_format(streaming, 'audio', 'max'))

    def test_ytdlp_normalization_maps_direct_formats_and_drm(self):
        self.require_core()
        info = {
            'title': 'Track',
            'formats': [
                {'url': 'https://cdn.example/a.m4a', 'ext': 'm4a', 'acodec': 'mp4a', 'vcodec': 'none', 'abr': 128},
                {'url': 'https://cdn.example/v.mp4', 'ext': 'mp4', 'acodec': 'mp4a', 'vcodec': 'avc1', 'height': 720},
            ],
        }
        item = core.choose_ytdlp_format(info, 'audio', 'max')
        self.assertEqual(item['url'], 'https://cdn.example/a.m4a')
        self.assertEqual(item['filename'], 'Track.m4a')

        drm_info = {'title': 'Protected', 'formats': [{'url': 'https://cdn.example/drm.mpd', 'has_drm': True, 'vcodec': 'avc1', 'acodec': 'mp4a'}]}
        self.assertEqual(core.choose_ytdlp_format(drm_info, 'auto', '1080')['challenge'], 'drm_protected')


if __name__ == '__main__':
    unittest.main()
