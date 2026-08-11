import type { Db } from '../db';
import type { ExportedCourse } from './format';

// Quanto dois conjuntos de aulas precisam coincidir para serem "o mesmo curso".
// Medida simétrica (interseção sobre união): penaliza tanto aula que sobra
// quanto aula que falta — uma pasta pequena contida numa grande não passa.
export const LIMIAR_SEMELHANCA = 0.7;

function semelhanca(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let emComum = 0;
  for (const item of a) if (b.has(item)) emComum++;
  return emComum / (a.size + b.size - emComum);
}

// Reconhece se um curso vindo de um arquivo de export já existe nesta máquina.
// Devolve o id do curso local, ou null quando é curso novo.
//
// Duas passadas, em ordem de confiança:
//   1. mesmo root_path — mesma máquina, certeza absoluta;
//   2. impressão digital das aulas — o curso mudou de disco ou de sistema.
export function matchCourse(db: Db, doArquivo: ExportedCourse): string | null {
  const mesmoCaminho = db.prepare('SELECT id FROM courses WHERE root_path=?').get(doArquivo.rootPath) as
    | { id: string }
    | undefined;
  if (mesmoCaminho) return mesmoCaminho.id;

  const digital = new Set(doArquivo.lessons.map((l) => l.relPath));
  if (digital.size === 0) return null;

  const aulasLocais = db.prepare('SELECT course_id, rel_path FROM lessons') .all() as {
    course_id: string;
    rel_path: string;
  }[];
  const porCurso = new Map<string, Set<string>>();
  for (const l of aulasLocais) {
    const set = porCurso.get(l.course_id) ?? new Set<string>();
    set.add(l.rel_path);
    porCurso.set(l.course_id, set);
  }

  // Empate técnico não existe: fica o mais parecido. Percorrer todos evita que a
  // ordem das linhas no banco decida qual curso recebe o progresso.
  let melhorId: string | null = null;
  let melhorNota = 0;
  for (const [courseId, aulas] of porCurso) {
    const nota = semelhanca(digital, aulas);
    if (nota >= LIMIAR_SEMELHANCA && nota > melhorNota) {
      melhorId = courseId;
      melhorNota = nota;
    }
  }
  return melhorId;
}
