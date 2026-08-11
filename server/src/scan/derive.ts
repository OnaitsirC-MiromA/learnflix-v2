import path from 'node:path';
import { naturalCompare } from './natural-sort';

export { naturalCompare } from './natural-sort';

export const VIDEO_EXTS = new Set([
  '.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.flv', '.wmv', '.ts', '.mpg', '.mpeg',
]);
export const PLAYABLE_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov']);

export interface ScannedFile {
  relPath: string;
  sizeBytes: number;
  mtime: number;
}

export interface DerivedLesson {
  relPath: string;
  module: string | null;
  title: string;
  orderIndex: number;
  moduleOrder: number;
  container: string;
  playable: boolean;
  sizeBytes: number;
  mtime: number;
}

export interface DerivedCourse {
  structure: 'modules' | 'flat';
  lessons: DerivedLesson[];
}

export function cleanTitle(filename: string): string {
  const base = filename.replace(/\.[^./]+$/, '');
  return base.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function segments(relPath: string): string[] {
  return relPath.split('/').filter(Boolean);
}

export function deriveCourse(videoFiles: ScannedFile[]): DerivedCourse {
  const hasModules = videoFiles.some((file) => segments(file.relPath).length > 1);
  const structure: 'modules' | 'flat' = hasModules ? 'modules' : 'flat';

  // Agrupa por módulo (1º segmento; null quando o arquivo está na raiz).
  const moduleOf = (relPath: string): string | null => {
    const segs = segments(relPath);
    return segs.length > 1 ? segs[0] : null;
  };

  const moduleNames = Array.from(new Set(videoFiles.map((f) => moduleOf(f.relPath))));
  moduleNames.sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return naturalCompare(a, b);
  });

  const lessons: DerivedLesson[] = [];
  let orderIndex = 0;

  moduleNames.forEach((moduleName, moduleOrder) => {
    const inModule = videoFiles
      .filter((f) => moduleOf(f.relPath) === moduleName)
      .sort((a, b) => naturalCompare(a.relPath, b.relPath));

    for (const file of inModule) {
      const segs = segments(file.relPath);
      const filename = segs[segs.length - 1];
      // aninhamento mais profundo é dobrado no título
      const deeper = segs.slice(1, -1);
      const title = deeper.length
        ? `${deeper.join(' / ')} — ${cleanTitle(filename)}`
        : cleanTitle(filename);
      const ext = path.extname(filename).toLowerCase();

      lessons.push({
        relPath: file.relPath,
        module: moduleName,
        title,
        orderIndex: orderIndex++,
        moduleOrder,
        container: ext.replace('.', ''),
        playable: PLAYABLE_EXTS.has(ext),
        sizeBytes: file.sizeBytes,
        mtime: file.mtime,
      });
    }
  });

  return { structure, lessons };
}
