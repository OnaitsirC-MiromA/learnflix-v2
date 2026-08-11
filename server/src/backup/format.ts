import type { Structure } from '../types';

// Marca do formato: é o que separa um arquivo do Learnflix de um JSON qualquer
// que a pessoa escolheu por engano. A versão sobe quando o formato mudar de um
// jeito que versões antigas não conseguem ler.
export const FORMAT = 'learnflix-library';
export const VERSION = 1;

// Formato do arquivo de export/import da biblioteca.
//
// Princípio que governa o que entra e o que fica de fora: o arquivo carrega o que
// a PESSOA construiu (progresso, organização, escolhas) e nunca o que é fato sobre
// ESTE disco (thumb_path, size_bytes, mtime, container, missing). Esses últimos o
// re-scan reconstrói na máquina de destino; levá-los no arquivo seria afirmar
// coisas falsas sobre um computador que ainda nem foi visto.
export interface ProgressState {
  positionSec: number;
  furthestSec: number;
  durationSec: number | null;
  completed: boolean;
  completedAt: string | null;
  autoCompleted: boolean;
  updatedAt: string;
}

export interface ExportedLesson {
  relPath: string;
  module: string | null;
  title: string;
  orderIndex: number;
  moduleOrder: number;
  durationSec: number | null;
  progress: ProgressState | null;
}

export interface ExportedCourseRoot {
  path: string;
  createdAt: string;
  lastCheckedAt: string | null;
}

export interface ExportedCollection {
  id: string;
  name: string;
  createdAt: string;
  sortIndex: number | null;
}

export interface ExportedCourse {
  title: string;
  rootPath: string;
  structure: Structure;
  archived: boolean;
  sortIndex: number | null;
  collectionId: string | null;
  // A capa viaja como caminho relativo, nunca como id de aula: o id é gerado
  // nesta máquina e não quer dizer nada na de destino.
  posterLessonRelPath: string | null;
  lessons: ExportedLesson[];
}

export type ParseResult = { ok: true; data: LibraryExport } | { ok: false; error: string };

/**
 * Valida um JSON já desserializado e devolve o export tipado.
 *
 * A validação é deliberadamente rasa: confere a marca do formato, a versão e a
 * forma das listas — o suficiente para separar "arquivo errado" de "arquivo do
 * Learnflix". Campo solto fora do lugar não derruba a importação inteira; o que
 * derruba é o arquivo não ser o que diz ser.
 */
export function parseExport(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object' || (raw as any).format !== FORMAT) {
    return { ok: false, error: 'Este arquivo não parece ser um arquivo do Learnflix.' };
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.version !== 'number' || o.version > VERSION) {
    return {
      ok: false,
      error: 'Este arquivo foi criado por uma versão mais nova do Learnflix. Atualize o app e tente de novo.',
    };
  }
  if (!Array.isArray(o.courses)) {
    return { ok: false, error: 'A lista de cursos deste arquivo está corrompida.' };
  }

  // Seções que vieram depois podem faltar num export antigo: ausência não é
  // corrupção, e recusar o arquivo inteiro por isso seria perder o que dá para
  // aproveitar.
  const extras = (o.settings ?? {}) as { allowedRootsExtra?: unknown };
  return {
    ok: true,
    data: {
      format: FORMAT,
      version: o.version as typeof VERSION,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      app: (o.app ?? { version: 'desconhecida', platform: 'desconhecida' }) as LibraryExport['app'],
      collections: Array.isArray(o.collections) ? (o.collections as ExportedCollection[]) : [],
      courses: o.courses as ExportedCourse[],
      courseRoots: Array.isArray(o.courseRoots) ? (o.courseRoots as ExportedCourseRoot[]) : [],
      settings: {
        allowedRootsExtra: Array.isArray(extras.allowedRootsExtra)
          ? extras.allowedRootsExtra.filter((p): p is string => typeof p === 'string')
          : [],
      },
    },
  };
}

export interface LibraryExport {
  format: typeof FORMAT;
  version: typeof VERSION;
  exportedAt: string;
  // Procedência: ajuda a entender um arquivo estranho meses depois — de que
  // versão saiu e de qual sistema (caminhos com barra invertida, por exemplo).
  app: { version: string; platform: string };
  collections: ExportedCollection[];
  courses: ExportedCourse[];
  courseRoots: ExportedCourseRoot[];
  settings: { allowedRootsExtra: string[] };
}
