#!/usr/bin/env node
// Gera o executável único do Learnflix para ESTA máquina, usando o SEA
// (Single Executable Application) do próprio Node.
//
// O resultado é uma cópia do binário do Node com o nosso bundle injetado dentro.
// Isso explica o tamanho — cerca de 110 MB — e também o que ele entrega: quem
// baixa não precisa ter Node, nem npm, nem nada. Dois cliques, ou um comando.
//
// Pré-requisitos: `npm run build` já ter rodado (o executável embute o
// dist/learnflix.cjs).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const raiz = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const build = path.join(raiz, 'build');
const bundle = path.join(raiz, 'dist', 'learnflix.cjs');

if (!fs.existsSync(bundle)) {
  console.error('dist/learnflix.cjs não existe — rode `npm run build` antes.');
  process.exit(1);
}

const ehWindows = process.platform === 'win32';
const ehMac = process.platform === 'darwin';
const alvo = `${process.platform}-${process.arch}`;
const executavel = path.join(build, ehWindows ? 'learnflix.exe' : 'learnflix');

fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });

// 1. A configuração que o Node lê para montar o blob.
const configPath = path.join(build, 'sea-config.json');
fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: bundle,
      output: path.join(build, 'learnflix.blob'),
      // Sem isto o app cospe um aviso de "SEA é experimental" a cada execução —
      // ruído sobre o qual quem só quer assistir aula não pode agir.
      disableExperimentalSEAWarning: true,
      // Cache de código: o executável já nasce com o JS compilado, o que corta
      // um bom pedaço do tempo de inicialização. Vale porque o binário do Node
      // embutido é exatamente o que gerou o cache.
      useCodeCache: true,
    },
    null,
    2,
  ),
);

console.log(`alvo: ${alvo}`);
execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit' });

// 2. O executável é uma cópia do próprio Node desta máquina.
fs.copyFileSync(process.execPath, executavel);
fs.chmodSync(executavel, 0o755);

// 3. No macOS, injetar dentro de um binário assinado invalida a assinatura e o
//    sistema recusa executá-lo. Remove-se antes, assina-se depois.
if (ehMac) {
  try {
    execFileSync('codesign', ['--remove-signature', executavel], { stdio: 'pipe' });
  } catch {
    // binário sem assinatura nenhuma: nada a remover
  }
}

// 4. Injeta o blob.
//
// Chamando o postject pelo Node, e não por `npx`: no Windows o npx é um arquivo
// .cmd, que o execFileSync não resolve sem ligar o shell — e ligar o shell
// traria problema de aspas em caminhos com espaço. Resolver o script pelo
// require é direto e igual nos três sistemas.
const postject = createRequire(import.meta.url).resolve('postject/dist/cli.js');
const argsPostject = [
  postject,
  executavel,
  'NODE_SEA_BLOB',
  path.join(build, 'learnflix.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (ehMac) argsPostject.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, argsPostject, { stdio: 'inherit', cwd: raiz });

// 5. Assinatura ad-hoc: sem ela o macOS mata o processo com "killed: 9".
if (ehMac) execFileSync('codesign', ['--sign', '-', executavel], { stdio: 'inherit' });

const tamanho = fs.statSync(executavel).size / 1024 / 1024;
console.log(`\n${path.relative(raiz, executavel)} — ${tamanho.toFixed(0)} MB (${alvo})`);
console.log('teste com: ' + path.relative(raiz, executavel));
