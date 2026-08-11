import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { reconcileCourse } from './reconcile';
import { loadConfig } from '../config';
import { openDb } from '../db/index';

export interface CourseRow {
  id: string;
  title: string;
  root_path: string;
}

export interface RepointPlanItem {
  id: string;
  title: string;
  oldPath: string;
  newPath: string;
}

// O separador vem do sistema: no Windows os root_path são gravados com "\", então
// comparar com "/" fixo daria plano vazio — o lote não moveria nada, em silêncio.
function isUnderPrefix(rootPath: string, prefix: string): boolean {
  if (rootPath === prefix) return true;
  if (!rootPath.startsWith(prefix)) return false;
  const rest = rootPath.slice(prefix.length);
  return rest.startsWith('/') || rest.startsWith('\\');
}

// Pura: calcula o novo caminho de cada curso cujo root_path está sob fromPrefix.
// Cursos fora do prefixo são ignorados (não fazem parte desta migração em lote).
export function planBatchRepoint(courses: CourseRow[], fromPrefix: string, toPrefix: string): RepointPlanItem[] {
  return courses
    .filter((c) => isUnderPrefix(c.root_path, fromPrefix))
    .map((c) => ({
      id: c.id,
      title: c.title,
      oldPath: c.root_path,
      newPath: toPrefix + c.root_path.slice(fromPrefix.length),
    }));
}

export interface BatchRepointResult {
  total: number;
  succeeded: { id: string; title: string; newPath: string }[];
  abortedAt?: { id: string; title: string; newPath: string; reason: 'root_unavailable' };
}

// Aplica o plano curso a curso, na ordem de criação (rowid), reusando reconcileCourse
// — o mesmo motor do M3 usado pelo botão "Re-apontar". Aborta no primeiro curso cujo
// novo caminho não existe/não é diretório — não deixa a biblioteca meio-migrada em
// silêncio. Processa TODOS os cursos (inclusive arquivados): mover o acervo é total.
export function runBatchRepoint(
  db: Database.Database,
  config: AppConfig,
  fromPrefix: string,
  toPrefix: string,
  onProgress?: (item: RepointPlanItem) => void,
): BatchRepointResult {
  const courses = db.prepare('SELECT id, title, root_path FROM courses ORDER BY rowid').all() as CourseRow[];
  const plan = planBatchRepoint(courses, fromPrefix, toPrefix);
  const succeeded: BatchRepointResult['succeeded'] = [];

  for (const item of plan) {
    onProgress?.(item);
    const res = reconcileCourse(db, config, item.id, { newRootPath: item.newPath });
    if ('status' in res) {
      return { total: plan.length, succeeded, abortedAt: { id: item.id, title: item.title, newPath: item.newPath, reason: 'root_unavailable' } };
    }
    succeeded.push({ id: item.id, title: item.title, newPath: item.newPath });
  }
  return { total: plan.length, succeeded };
}

function parseArgs(argv: string[]): { from: string; to: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    if (argv[i] === '--to') args.to = argv[++i];
  }
  if (!args.from || !args.to) {
    throw new Error('uso: npm run repoint --workspace=server -- --from <prefixo-antigo> --to <prefixo-novo>');
  }
  return { from: args.from, to: args.to };
}

function main(): void {
  const { from, to } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const db = openDb(config.dbPath);
  console.log(`Re-apontando cursos de "${from}" para "${to}"...`);
  const result = runBatchRepoint(db, config, from, to, (item) => {
    console.log(`  ${item.title}: ${item.oldPath} -> ${item.newPath}`);
  });
  db.close();
  console.log(`${result.succeeded.length}/${result.total} curso(s) re-apontado(s).`);
  if (result.abortedAt) {
    console.error(`Abortado em "${result.abortedAt.title}": pasta indisponível em ${result.abortedAt.newPath}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
