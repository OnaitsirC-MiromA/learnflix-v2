import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, defaultDataDir } from './config';

describe('defaultDataDir', () => {
  // O v1 guardava os dados dentro da própria pasta do projeto. No v2 o app pode
  // ser um executável que vive em qualquer lugar e é substituído a cada
  // atualização — se os dados morassem junto, atualizar apagaria o histórico.
  it('fica fora da pasta de instalação, na área do usuário', () => {
    expect(defaultDataDir({}, 'darwin')).toBe(path.join(os.homedir(), '.learnflix'));
  });

  it('no Linux usa o mesmo lugar do macOS', () => {
    expect(defaultDataDir({}, 'linux')).toBe(path.join(os.homedir(), '.learnflix'));
  });

  // No Windows, pasta oculta na home não é a convenção — dados de aplicativo
  // moram em LOCALAPPDATA, que é onde backup e perfil móvel vão procurar.
  it('no Windows usa LOCALAPPDATA', () => {
    expect(defaultDataDir({ LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' }, 'win32')).toBe(
      path.join('C:\\Users\\ana\\AppData\\Local', 'Learnflix'),
    );
  });

  it('no Windows sem LOCALAPPDATA cai na home, em vez de quebrar', () => {
    expect(defaultDataDir({}, 'win32')).toBe(path.join(os.homedir(), '.learnflix'));
  });
});

describe('loadConfig', () => {
  it('aplica defaults quando env vazio', () => {
    const c = loadConfig({});
    expect(c.port).toBe(7777);
    expect(c.bind).toBe('127.0.0.1');
    expect(c.allowedRoots).toContain(os.homedir());
    if (process.platform === 'darwin') {
      // no macOS, /Volumes (compartilhamentos de rede e discos externos) entra nas raízes padrão
      expect(c.allowedRoots).toContain('/Volumes');
    }
    if (process.platform === 'linux') {
      expect(c.allowedRoots).toContain('/media');
    }
    expect(c.autocompleteThreshold).toBe(0.9);
    expect(c.dbPath).toBe(path.join(c.dataDir, 'app.db'));
    expect(c.thumbsDir).toBe(path.join(c.dataDir, 'thumbs'));
    expect(c.convertedDir).toBe(path.join(c.dataDir, 'converted'));
  });

  it('respeita overrides do env', () => {
    const c = loadConfig({
      PORT: '8080', BIND: '0.0.0.0', DATA_DIR: '/tmp/d',
      ALLOWED_ROOTS: '/a:/b', AUTOCOMPLETE_THRESHOLD: '0.8',
    });
    expect(c.port).toBe(8080);
    expect(c.bind).toBe('0.0.0.0');
    expect(c.dataDir).toBe(path.resolve('/tmp/d'));
    expect(c.allowedRoots).toEqual([path.resolve('/a'), path.resolve('/b')]);
    expect(c.autocompleteThreshold).toBe(0.8);
  });

  it('openBrowser: abre por padrão e respeita o override', () => {
    expect(loadConfig({}).openBrowser).toBe(true);
    expect(loadConfig({ OPEN_BROWSER: '0' }).openBrowser).toBe(false);
  });
});
