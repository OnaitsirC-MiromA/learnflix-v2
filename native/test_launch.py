import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import launch

class LaunchTests(unittest.TestCase):
    def test_native_environment_keeps_secrets_in_own_files(self):
        with patch.dict(os.environ, {'TELEGRAM_API_HASH': 'outro-ambiente', 'ACCESS_PASSWORD': 'outro-ambiente'}):
            env = launch.environment(Path('/test/data'), 7777, 18099)
        self.assertNotIn('TELEGRAM_API_HASH', env)
        self.assertNotIn('ACCESS_PASSWORD', env)
        self.assertEqual(env['BIND'], '127.0.0.1')
        self.assertEqual(env['TELEGRAM_BRIDGE_URL'], 'http://127.0.0.1:18099')
        self.assertEqual(env['DATA_DIR'], str(Path('/test/data')))

    def test_second_instance_does_not_open_same_session(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lock'
            first = launch.acquire_lock(path)
            self.assertIsNotNone(first)
            try:
                self.assertIsNone(launch.acquire_lock(path))
            finally:
                first.close()
            next_lock = launch.acquire_lock(path)
            self.assertIsNotNone(next_lock)
            next_lock.close()

    def test_refuses_old_node(self):
        with patch('launch.shutil.which', return_value='/fake/bin'), patch('launch.subprocess.check_output', side_effect=[b'v20.0.0\n',b'ffmpeg version test\n',b'ffprobe version test\n']):
            with self.assertRaisesRegex(ValueError, 'Node 22.5'):
                launch.check_components()

if __name__ == '__main__':
    unittest.main()
