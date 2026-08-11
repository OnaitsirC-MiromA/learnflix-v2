#!/usr/bin/env node
// Junta o servidor inteiro — código, dependências e a interface embutida — num
// único dist/learnflix.js.
//
// É esse arquivo que o `npx learnflix` executa e que, mais adiante, vira o
// executável único. Nada de node_modules no destino, nada de compilar na
// instalação: o único requisito continua sendo o Node.
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const raiz = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const saida = path.join(raiz, 'dist', 'learnflix.js');

const resultado = await esbuild.build({
  entryPoints: [path.join(raiz, 'server', 'src', 'index.ts')],
  outfile: saida,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: {
    js: [
      // Shebang: faz o arquivo ser executável direto, que é o que o campo "bin"
      // do npm espera.
      '#!/usr/bin/env node',
      // O Fastify e as dependências dele são CommonJS e usam require() em tempo
      // de execução. Numa saída ESM o esbuild troca require por um stub que
      // lança "Dynamic require is not supported" — e o app morre ao subir.
      // Devolver um require de verdade ao escopo do módulo resolve: o stub do
      // esbuild usa o require existente quando encontra um.
      "import { createRequire as __learnflixCreateRequire } from 'node:module';",
      'const require = __learnflixCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  // Sem minificar: quando alguém for investigar um problema, vai ler ISTO. O
  // ganho de tamanho não compensa perder a pista.
  minify: false,
  metafile: true,
  logLevel: 'info',
});

fs.chmodSync(saida, 0o755);

const tamanho = fs.statSync(saida).size;
const web = fs.existsSync(path.join(raiz, 'web', 'dist'));
console.log(`\ndist/learnflix.js — ${(tamanho / 1024 / 1024).toFixed(2)} MB${web ? '' : '  (ATENÇÃO: sem a interface embutida)'}`);

// Um require() que o esbuild não conseguiu resolver vira erro só em produção,
// na máquina de outra pessoa. Melhor descobrir aqui.
const externos = Object.keys(resultado.metafile.inputs).filter((f) => f.includes('node_modules'));
console.log(`empacotou ${Object.keys(resultado.metafile.inputs).length} arquivos (${externos.length} de dependências)`);
