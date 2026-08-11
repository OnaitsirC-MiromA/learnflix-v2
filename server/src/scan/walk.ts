import fs from 'node:fs';
import path from 'node:path';
import { VIDEO_EXTS, type ScannedFile } from './derive';

export type MaterialKind = 'pdf' | 'zip' | 'archive' | 'doc' | 'image' | 'other';

const ARCHIVE_EXTS = new Set(['.rar', '.7z', '.tar', '.gz', '.tgz']);
const DOC_EXTS = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.epub']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

export function materialKind(ext: string): MaterialKind {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.zip') return 'zip';
  if (ARCHIVE_EXTS.has(e)) return 'archive';
  if (DOC_EXTS.has(e)) return 'doc';
  if (IMAGE_EXTS.has(e)) return 'image';
  return 'other';
}

export interface WalkResult {
  videos: ScannedFile[];
  materials: Array<ScannedFile & { kind: MaterialKind }>;
  /** Caminhos relativos que apareceram na listagem mas não puderam ser lidos. */
  unreadable: string[];
}

// Um caminho listado nem sempre é alcançável. Em compartilhamentos de rede (SMB),
// o readdir anuncia nomes que o stat seguinte responde com ENOENT — de forma
// intermitente, mudando de arquivo a cada varredura. O mesmo vale para pastas sem
// permissão e para arquivos removidos no meio do escaneamento.
//
// Antes, qualquer um desses casos derrubava a importação inteira: um arquivo fora
// do ar custava os outros 45 cursos. Agora o que não pode ser lido é PULADO e
// REPORTADO — a importação entrega o que existe, e quem chama decide o que contar
// ao usuário. Engolir em silêncio seria pior: aulas sumiriam sem explicação.
export function walkCourseDir(rootPath: string): WalkResult {
  const videos: ScannedFile[] = [];
  const materials: WalkResult['materials'] = [];
  const unreadable: string[] = [];

  const rel = (full: string): string => path.relative(rootPath, full).split(path.sep).join('/');

  const visit = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // A raiz ilegível é problema de quem chamou (pasta indisponível), não um
      // item pulado dentro do curso — quem trata isso é o reconcile/rescan.
      if (dir !== rootPath) unreadable.push(rel(dir));
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // oculto/junk (ex.: .DS_Store)
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        unreadable.push(rel(full));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      const base: ScannedFile = {
        relPath: rel(full),
        sizeBytes: stat.size,
        mtime: Math.floor(stat.mtimeMs),
      };
      if (VIDEO_EXTS.has(ext)) {
        videos.push(base);
      } else {
        materials.push({ ...base, kind: materialKind(ext) });
      }
    }
  };

  visit(rootPath);
  return { videos, materials, unreadable };
}
