import unittest

from relay import build_media_request, copy_media_headers


class RelayTests(unittest.TestCase):
    def test_build_media_request_forwards_range(self):
        request = build_media_request('https://media.example/audio.webm', 'bytes=100-199')
        self.assertEqual(request.get_header('Range'), 'bytes=100-199')
        self.assertEqual(request.get_header('User-agent').startswith('Mozilla/5.0'), True)

    def test_copy_media_headers_keeps_seek_headers_only(self):
        headers = {
            'Content-Type': 'audio/webm',
            'Content-Length': '1000',
            'Content-Range': 'bytes 100-199/1000',
            'Accept-Ranges': 'bytes',
            'ETag': 'abc',
            'Last-Modified': 'Mon, 14 Sep 2026 10:00:00 GMT',
            'Set-Cookie': 'secret=1',
        }
        copied = copy_media_headers(headers)
        self.assertEqual(copied['Content-Type'], 'audio/webm')
        self.assertEqual(copied['Content-Range'], 'bytes 100-199/1000')
        self.assertNotIn('Set-Cookie', copied)


if __name__ == '__main__':
    unittest.main()
