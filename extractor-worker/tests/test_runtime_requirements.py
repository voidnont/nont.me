import pathlib
import sys
import unittest

WORKER_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

import app


class RuntimeRequirementTests(unittest.TestCase):
    def test_health_fails_when_deno_is_unavailable(self):
        original = getattr(app, 'deno_available', None)
        app.deno_available = lambda: False
        try:
            with self.assertRaises(Exception) as raised:
                app.health()
            self.assertIn('Deno', str(raised.exception))
        finally:
            if original is None:
                delattr(app, 'deno_available')
            else:
                app.deno_available = original


if __name__ == '__main__':
    unittest.main()
