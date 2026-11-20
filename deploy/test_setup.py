import tempfile
import unittest
from pathlib import Path
from setup import prepare_files


class SetupTests(unittest.TestCase):
    def test_private_files_and_repeat_preserve_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = {key: str(root / 'private' / name) for key, name in (
                ('TELEGRAM_API_ID_FILE', 'api_id'), ('TELEGRAM_API_HASH_FILE', 'api_hash'),
                ('TELEGRAM_BRIDGE_TOKEN_FILE', 'bridge.key'), ('ACCESS_PASSWORD_FILE', 'access_password'))}
            env.update(DATA_DIR=str(root / 'data'), TELEGRAM_SESSION=str(root / 'private/session/account'))
            answers = iter(['a' * 32, 'senha-de-teste', 'senha-de-teste'])
            prepare_files(env, lambda _: '12345', lambda _: next(answers))
            token = Path(env['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text()
            self.assertGreaterEqual(len(token), 32)
            self.assertEqual(Path(env['ACCESS_PASSWORD_FILE']).read_text(), 'senha-de-teste')
            for key in ('TELEGRAM_API_ID_FILE', 'TELEGRAM_API_HASH_FILE', 'TELEGRAM_BRIDGE_TOKEN_FILE', 'ACCESS_PASSWORD_FILE'):
                self.assertEqual(Path(env[key]).stat().st_mode & 0o777, 0o600)
            def unexpected(_):
                raise AssertionError('Não deve pedir nem substituir dados salvos.')
            prepare_files(env, unexpected, unexpected)
            self.assertEqual(Path(env['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text(), token)

    def test_explicit_reconfiguration_keeps_token_and_session(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = {key: str(root / 'private' / name) for key, name in (
                ('TELEGRAM_API_ID_FILE', 'api_id'), ('TELEGRAM_API_HASH_FILE', 'api_hash'),
                ('TELEGRAM_BRIDGE_TOKEN_FILE', 'bridge.key'), ('ACCESS_PASSWORD_FILE', 'access_password'))}
            env.update(DATA_DIR=str(root / 'data'), TELEGRAM_SESSION=str(root / 'private/session/account'))
            answers = iter(['a' * 32, 'senha-antiga', 'senha-antiga'])
            prepare_files(env, lambda _: '12345', lambda _: next(answers))
            token = Path(env['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text()
            session = Path(env['TELEGRAM_SESSION'] + '.session')
            session.write_text('sessao-simulada')
            answers = iter(['b' * 32, 'senha-nova', 'senha-nova'])
            prepare_files(env, lambda _: '54321', lambda _: next(answers), replace=True)
            self.assertEqual(Path(env['TELEGRAM_API_ID_FILE']).read_text(), '54321')
            self.assertEqual(Path(env['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text(), token)
            self.assertEqual(session.read_text(), 'sessao-simulada')

    def test_invalid_input_does_not_leave_partial_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = {key: str(root / key) for key in ('TELEGRAM_API_ID_FILE', 'TELEGRAM_API_HASH_FILE', 'TELEGRAM_BRIDGE_TOKEN_FILE', 'ACCESS_PASSWORD_FILE')}
            with self.assertRaises(ValueError):
                prepare_files(env, lambda _: '12345', lambda _: 'hash-invalido')
            self.assertEqual(list(root.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
