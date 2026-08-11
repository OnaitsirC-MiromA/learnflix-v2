import { describe, it, expect } from 'vitest';
import { mensagemDeBoot } from './banner';

const base = {
  versao: '2.0.0',
  dataDir: '/Users/ana/.learnflix',
  url: 'http://localhost:7777',
  temFfmpeg: true,
  trocouDePorta: false,
  portaPedida: 7777,
  herdouDoV1: false,
  abrindoNavegador: true,
  plataforma: 'darwin' as NodeJS.Platform,
};

const juntas = (o: Partial<typeof base> = {}) => mensagemDeBoot({ ...base, ...o }).join('\n');

describe('mensagemDeBoot', () => {
  it('mostra versão, onde ficam os dados e o endereço', () => {
    const texto = juntas();

    expect(texto).toContain('Learnflix 2.0.0');
    expect(texto).toContain('/Users/ana/.learnflix');
    expect(texto).toContain('http://localhost:7777');
  });

  // Sem ffmpeg o app funciona inteiro, só sem capas e durações. O aviso precisa
  // dizer o que se perde E como resolver, ou vira ruído que ninguém age sobre.
  it('sem ffmpeg, diz o que falta e como instalar no sistema certo', () => {
    expect(juntas({ temFfmpeg: false, plataforma: 'darwin' })).toContain('brew install ffmpeg');
    expect(juntas({ temFfmpeg: false, plataforma: 'win32' })).toContain('winget install');
    expect(juntas({ temFfmpeg: false, plataforma: 'linux' })).toContain('apt install ffmpeg');
  });

  it('com ffmpeg, não fica falando de ffmpeg', () => {
    expect(juntas({ temFfmpeg: true }).toLowerCase()).not.toContain('ffmpeg');
  });

  // Se o app foi para outra porta, a pessoa precisa saber por quê — senão o
  // endereço "errado" no navegador parece bug.
  it('avisa quando teve de trocar de porta', () => {
    const texto = juntas({ trocouDePorta: true, portaPedida: 7777, url: 'http://localhost:7778' });

    expect(texto).toContain('7777');
    expect(texto).toContain('ocupada');
  });

  it('conta quando adotou os dados do v1', () => {
    expect(juntas({ herdouDoV1: true })).toMatch(/v1/i);
  });

  it('não promete abrir o navegador quando não vai abrir', () => {
    expect(juntas({ abrindoNavegador: false })).not.toContain('navegador');
  });
});
