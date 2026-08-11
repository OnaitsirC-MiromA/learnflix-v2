import type { ProgressState } from './format';

// Fusão de progresso entre o que já existe nesta máquina e o que vem de um
// arquivo de export.
//
// Regra que governa tudo: NUNCA perder o que a pessoa já assistiu. Um import é
// sempre aditivo — na dúvida entre dois estados, vence o mais avançado.
export type { ProgressState };

// Datas gravadas como ISO 8601 em UTC (toISOString) ordenam lexicograficamente na
// mesma ordem em que aconteceram — dá para comparar com < sem virar Date.
function maisAntiga(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maisRecente(a: string, b: string): string {
  return a > b ? a : b;
}

// A sobrecarga não-nula vem primeiro: quem passa os dois lados preenchidos recebe
// um resultado garantido, sem precisar de `!` no chamador.
export function mergeProgress(local: ProgressState, doArquivo: ProgressState): ProgressState;
export function mergeProgress(local: ProgressState | null, doArquivo: ProgressState | null): ProgressState | null;
export function mergeProgress(local: ProgressState | null, doArquivo: ProgressState | null): ProgressState | null {
  // Aula aberta de um lado só: não há o que comparar, fica o que existe.
  if (!local) return doArquivo;
  if (!doArquivo) return local;

  // A posição acompanha o furthest: pegar a posição do lado menos avançado faria
  // o cursor pular para trás no vídeo — que é exatamente o que dói.
  const maisLonge = doArquivo.furthestSec > local.furthestSec ? doArquivo : local;

  const completed = local.completed || doArquivo.completed;
  // Quem concluiu primeiro define a data — e, junto com ela, se a conclusão foi
  // automática ou no clique. Os dois campos descrevem o MESMO evento, então têm
  // de vir do mesmo lado, ou passariam a contar histórias diferentes.
  const completedAt = maisAntiga(local.completedAt, doArquivo.completedAt);
  const ladoDaConclusao = completedAt === local.completedAt ? local : doArquivo;

  return {
    positionSec: maisLonge.positionSec,
    furthestSec: maisLonge.furthestSec,
    // A duração local saiu do ffprobe deste arquivo de vídeo; a do export veio de
    // outra máquina, que pode ter uma cópia diferente da aula.
    durationSec: local.durationSec ?? doArquivo.durationSec,
    completed,
    completedAt,
    autoCompleted: completed ? ladoDaConclusao.autoCompleted : false,
    updatedAt: maisRecente(local.updatedAt, doArquivo.updatedAt),
  };
}
