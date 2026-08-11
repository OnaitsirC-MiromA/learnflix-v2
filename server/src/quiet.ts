// O SQLite embutido do Node ainda é marcado como experimental, e o Node avisa
// isso em VERMELHO a cada inicialização. É um detalhe de implementação sobre o
// qual quem só quer assistir aula não pode agir — e um aviso desses no primeiro
// contato com o app passa a impressão de que algo quebrou.
//
// Silenciamos exatamente esse aviso, e só ele: qualquer outro continua passando.
//
// Este módulo precisa ser o PRIMEIRO import do processo. Em ESM as dependências
// são avaliadas na ordem em que aparecem, então importá-lo antes de qualquer
// coisa que puxe node:sqlite garante que o filtro já esteja de pé.
const original = process.emitWarning;

process.emitWarning = ((aviso: string | Error, ...resto: unknown[]) => {
  const texto = typeof aviso === 'string' ? aviso : (aviso?.message ?? '');
  if (texto.includes('SQLite is an experimental feature')) return;
  return (original as (...args: unknown[]) => void).call(process, aviso, ...resto);
}) as typeof process.emitWarning;
