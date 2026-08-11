import { describe, it, expect } from 'vitest';
import { mergeProgress, type ProgressState } from './merge';

// Um progresso "zerado" completo, para cada teste variar só o campo que está em jogo.
function prog(over: Partial<ProgressState> = {}): ProgressState {
  return {
    positionSec: 0,
    furthestSec: 0,
    durationSec: null,
    completed: false,
    completedAt: null,
    autoCompleted: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('mergeProgress', () => {
  it('mantém a posição de quem foi mais longe', () => {
    const local = prog({ positionSec: 120, furthestSec: 200 });
    const doArquivo = prog({ positionSec: 900, furthestSec: 1500 });

    expect(mergeProgress(local, doArquivo)).toMatchObject({ positionSec: 900, furthestSec: 1500 });
  });

  it('não desfaz uma conclusão, mesmo quando o outro lado foi mais longe', () => {
    const local = prog({ furthestSec: 200, completed: true, completedAt: '2026-02-01T00:00:00.000Z' });
    const doArquivo = prog({ furthestSec: 1500, completed: false });

    expect(mergeProgress(local, doArquivo).completed).toBe(true);
  });

  // Quando a pessoa concluiu a aula nas duas máquinas, o que vale é quando ela
  // concluiu de verdade pela primeira vez — não a última cópia a saber disso.
  it('guarda a data de conclusão mais antiga das duas', () => {
    const local = prog({ furthestSec: 200, completed: true, completedAt: '2026-01-05T00:00:00.000Z' });
    const doArquivo = prog({ furthestSec: 1500, completed: true, completedAt: '2026-03-10T00:00:00.000Z' });

    expect(mergeProgress(local, doArquivo).completedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('usa a data de conclusão do lado que concluiu, mesmo que o outro tenha ido mais longe', () => {
    const local = prog({ furthestSec: 200, completed: true, completedAt: '2026-01-05T00:00:00.000Z' });
    const doArquivo = prog({ furthestSec: 1500, completed: false, completedAt: null });

    expect(mergeProgress(local, doArquivo).completedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  // A duração local saiu do ffprobe DESTE arquivo de vídeo; a do arquivo de export
  // veio de outra máquina, que pode ter uma cópia diferente da aula.
  it('prefere a duração medida nesta máquina', () => {
    const local = prog({ furthestSec: 200, durationSec: 612.4 });
    const doArquivo = prog({ furthestSec: 1500, durationSec: 600 });

    expect(mergeProgress(local, doArquivo).durationSec).toBe(612.4);
  });

  it('adota a duração do arquivo quando não há duração local', () => {
    const local = prog({ furthestSec: 1500, durationSec: null });
    const doArquivo = prog({ furthestSec: 200, durationSec: 612.4 });

    expect(mergeProgress(local, doArquivo).durationSec).toBe(612.4);
  });

  it('marca autoCompleted conforme o lado que concluiu', () => {
    const local = prog({ furthestSec: 200, completed: true, completedAt: '2026-01-05T00:00:00.000Z', autoCompleted: true });
    const doArquivo = prog({ furthestSec: 1500, completed: false, autoCompleted: false });

    expect(mergeProgress(local, doArquivo).autoCompleted).toBe(true);
  });

  it('fica com o carimbo de atualização mais recente', () => {
    const local = prog({ furthestSec: 1500, updatedAt: '2026-05-01T00:00:00.000Z' });
    const doArquivo = prog({ furthestSec: 200, updatedAt: '2026-06-01T00:00:00.000Z' });

    expect(mergeProgress(local, doArquivo).updatedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  // Aula nunca aberta de um dos lados: não há o que comparar, e "nunca perder"
  // quer dizer ficar com o único progresso que existe.
  it('adota o progresso do arquivo quando não há progresso local', () => {
    const doArquivo = prog({ positionSec: 300, furthestSec: 450 });

    expect(mergeProgress(null, doArquivo)).toEqual(doArquivo);
  });

  it('mantém o progresso local quando o arquivo não tem progresso da aula', () => {
    const local = prog({ positionSec: 300, furthestSec: 450 });

    expect(mergeProgress(local, null)).toEqual(local);
  });

  it('devolve nulo quando nenhum dos lados tem progresso', () => {
    expect(mergeProgress(null, null)).toBeNull();
  });
});
