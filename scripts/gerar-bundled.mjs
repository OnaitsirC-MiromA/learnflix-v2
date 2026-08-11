#!/usr/bin/env node
// Gera server/src/bundled.ts — o módulo com tudo o que o build "congela" dentro
// do app: os arquivos da interface e a versão.
//
// Existe para o servidor não depender do diretório de onde foi iniciado. No v1,
// a SPA era procurada em `cwd/../web/dist` e a versão lida de `cwd/../package.json`
// — as duas coisas quebravam se o processo subisse de outro lugar, e nenhuma
// delas sobreviveria a virar um executável único.
//
// Roda antes do typecheck, do teste e do bundle. Sem web/dist, gera um módulo
// vazio: é o estado normal em desenvolvimento, onde quem serve a interface é o
// Vite.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const raiz = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const webDist = path.join(raiz, 'web', 'dist');
const destino = path.join(raiz, 'server', 'src', 'bundled.ts');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function listar(dir, base = '') {
  const saida = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, item.name);
    // Sempre com barra normal: a chave é uma URL, não um caminho de disco — no
    // Windows, path.join daria barra invertida e nenhuma rota casaria.
    const rel = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) saida.push(...listar(completo, rel));
    else saida.push({ rel, completo });
  }
  return saida;
}

const versao = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
const arquivos = fs.existsSync(webDist) ? listar(webDist) : [];

const entradas = arquivos.map(({ rel, completo }) => {
  const tipo = TIPOS[path.extname(rel).toLowerCase()] ?? 'application/octet-stream';
  const base64 = fs.readFileSync(completo).toString('base64');
  return `  ${JSON.stringify('/' + rel)}: { tipo: ${JSON.stringify(tipo)}, base64: ${JSON.stringify(base64)} },`;
});

fs.writeFileSync(
  destino,
  `// GERADO por scripts/gerar-bundled.mjs — não edite à mão.
//
// Cada arquivo da interface entra aqui em base64 para o servidor poder entregá-lo
// sem tocar no disco. É o que permite o app inteiro caber num arquivo só.
export interface AssetEmbutido {
  tipo: string;
  base64: string;
}

export const APP_VERSION = ${JSON.stringify(versao)};

export const WEB_ASSETS: Record<string, AssetEmbutido> = {
${entradas.join('\n')}
};
`,
);

const total = arquivos.reduce((n, a) => n + fs.statSync(a.completo).size, 0);
console.log(
  arquivos.length
    ? `bundled.ts: ${arquivos.length} arquivos da interface (${(total / 1024).toFixed(0)} KB), versão ${versao}`
    : `bundled.ts: sem web/dist — interface fica por conta do Vite (versão ${versao})`,
);
