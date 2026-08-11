import fs from 'node:fs';
import path from 'node:path';

export type ResultadoDaHeranca = 'adotado' | 'ja-tinha' | 'nada-encontrado';

// Onde o v1 deixava o banco, relativo à pasta de onde o app era iniciado. Eram
// dois jeitos de rodar: da raiz do projeto (./start.sh) e de dentro de server/
// (npm start), e cada um deixava o cwd num lugar.
const LUGARES_DO_V1 = [path.join('server', 'data'), 'data'];

// O SQLite em modo WAL mantém gravações recentes fora do .db. Copiar só o banco
// perderia as últimas aulas assistidas antes da troca de versão.
const ARQUIVOS_DO_BANCO = ['app.db', 'app.db-wal', 'app.db-shm'];

/**
 * Adota o banco do Learnflix v1, se ele estiver por perto.
 *
 * Só funciona quando o v2 é iniciado de dentro da pasta onde o v1 morava — um
 * app instalado por `npx` ou baixado como binário não tem como adivinhar onde
 * ficava aquele repositório. Para todos os outros casos existe o arquivo de
 * export, que atravessa máquinas e sistemas.
 *
 * Nunca sobrescreve um banco existente: isso apagaria o histórico de quem já
 * usa o v2, que é o oposto do que a herança serve para fazer.
 */
export function herdarDadosDoV1(cwd: string, dataDir: string): ResultadoDaHeranca {
  if (fs.existsSync(path.join(dataDir, 'app.db'))) return 'ja-tinha';

  const origem = LUGARES_DO_V1.map((rel) => path.join(cwd, rel)).find((dir) =>
    fs.existsSync(path.join(dir, 'app.db')),
  );
  if (!origem) return 'nada-encontrado';

  fs.mkdirSync(dataDir, { recursive: true });
  for (const nome of ARQUIVOS_DO_BANCO) {
    const de = path.join(origem, nome);
    if (fs.existsSync(de)) fs.copyFileSync(de, path.join(dataDir, nome));
  }

  // As miniaturas não vêm junto de propósito: são derivadas dos vídeos, podem
  // pesar centenas de megabytes, e o app as regenera sozinho conforme os cursos
  // vão sendo abertos.
  return 'adotado';
}
