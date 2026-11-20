"""Testes de distribuição/planos sem alterar a máquina nem autenticar contas."""
import csv
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('install_support', ROOT / 'install-support.py')
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


class BootstrapTests(unittest.TestCase):
    def test_manifest_has_pinned_verified_targets(self):
        with (ROOT / 'micromamba-platforms.tsv').open() as handle:
            rows = list(csv.DictReader(handle, delimiter='\t'))
        self.assertEqual({row['platform'] for row in rows}, {'linux-64', 'linux-aarch64', 'osx-64', 'osx-arm64', 'win-64'})
        self.assertEqual(len(rows), 5)
        for row in rows:
            self.assertRegex(row['sha256'], r'^[0-9a-f]{64}$')
            self.assertTrue(row['url'].startswith('https://github.com/mamba-org/micromamba-releases/releases/download/' + row['version'] + '/'))
            self.assertNotIn('latest', row['url'])

    def test_plan_does_not_create_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'raiz com espaço'
            result = subprocess.run(['bash', str(ROOT / 'install.sh'), '--plan'],
                env={**os.environ, 'LEARNFLIX_INSTALL_ROOT': str(target)}, check=True, capture_output=True, text=True)
            self.assertIn(str(target / 'runtime'), result.stdout)
            self.assertFalse(target.exists())

    def test_payload_update_preserves_data_and_ignores_private_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / 'pacote com espaço', root / 'instalado'
            (source / 'integrations/telegram').mkdir(parents=True)
            (source / 'integrations/telegram/bridge.py').write_text('codigo novo')
            (source / 'integrations/telegram/conta.session').write_text('nao copiar')
            (source / 'integrations/telegram/secreto.key').write_text('nao copiar')
            (destination / 'integrations/telegram').mkdir(parents=True)
            (destination / 'integrations/telegram/bridge.py').write_text('codigo antigo')
            (destination / 'app.db').write_text('progresso preservado')
            support.copy_payload(source, destination)
            self.assertEqual((destination / 'app.db').read_text(), 'progresso preservado')
            self.assertEqual((destination / 'integrations/telegram/bridge.py').read_text(), 'codigo novo')
            self.assertFalse((destination / 'integrations/telegram/conta.session').exists())
            self.assertFalse((destination / 'integrations/telegram/secreto.key').exists())

    def test_windows_launcher_uses_relative_ascii_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'usuário com espaço'
            root.mkdir()
            before = os.environ.get('LEARNFLIX_INSTALL_ROOT')
            os.environ['LEARNFLIX_INSTALL_ROOT'] = str(root)
            try:
                launcher = support.write_windows_launchers(root)
            finally:
                if before is None: os.environ.pop('LEARNFLIX_INSTALL_ROOT', None)
                else: os.environ['LEARNFLIX_INSTALL_ROOT'] = before
            value = launcher.read_bytes().decode('ascii')
            self.assertIn('%~dp0tools\\micromamba.exe', value)
            self.assertNotIn(str(root), value)


if __name__ == '__main__':
    unittest.main()
