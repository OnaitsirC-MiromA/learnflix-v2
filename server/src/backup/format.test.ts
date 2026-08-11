import { describe, it, expect } from 'vitest';
import { parseExport, FORMAT, VERSION } from './format';

const valido = {
  format: FORMAT,
  version: VERSION,
  exportedAt: '2026-08-10T00:00:00.000Z',
  app: { version: '1.0.0', platform: 'darwin' },
  collections: [],
  courses: [],
  courseRoots: [],
  settings: { allowedRootsExtra: [] },
};

describe('parseExport', () => {
  it('aceita um arquivo do próprio Learnflix', () => {
    const r = parseExport(valido);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.courses).toEqual([]);
  });

  // Escolher o arquivo errado no seletor é o engano mais provável de todos. A
  // mensagem tem de dizer o que houve, não "erro ao importar".
  it('recusa um JSON que não é do Learnflix, dizendo o motivo', () => {
    const r = parseExport({ nome: 'outra coisa qualquer' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/não parece ser um arquivo do Learnflix/i);
  });

  it('recusa um arquivo gerado por uma versão mais nova do app', () => {
    const r = parseExport({ ...valido, version: VERSION + 1 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/versão mais nova/i);
  });

  it('recusa um arquivo com a lista de cursos corrompida', () => {
    const r = parseExport({ ...valido, courses: 'nada disso' });

    expect(r.ok).toBe(false);
  });

  // Um export antigo pode não ter campos que vieram depois. Faltar não é
  // corrupção: o import segue com o que dá, em vez de recusar o arquivo todo.
  it('tolera as seções opcionais ausentes', () => {
    const { collections, courseRoots, settings, ...semAsOpcionais } = valido;

    const r = parseExport(semAsOpcionais);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.collections).toEqual([]);
      expect(r.data.courseRoots).toEqual([]);
      expect(r.data.settings).toEqual({ allowedRootsExtra: [] });
    }
  });
});
