# Learnflix — instalação nativa, sem Docker

**Docker não é necessário para o Learnflix nem para o FFmpeg.** Este pacote
prepara uma instalação pessoal com Node 22, Python 3.12, FFmpeg e FFprobe.
Esses componentes são baixados automaticamente para uma pasta do usuário;
não é preciso instalá-los um por um ou alterar o PATH global do computador.

O ambiente é gerenciado pelo micromamba, usando pacotes do conda-forge. A
primeira instalação precisa de internet e espaço para o programa e seus
componentes; o download pode ser grande e levar vários minutos. O instalador
confere a soma SHA-256 do micromamba antes de executá-lo.

## Instalar

Extraia **todo o ZIP** antes de começar. Mantenha a pasta `native` ao lado de
`dist`, `deploy` e `integrations`; não execute apenas um arquivo retirado do ZIP.

### Windows

**Windows x64 (64 bits):** abra `native/Instalar.cmd`. Windows ARM64 ainda não é
aceito por este instalador; não foi validado em emulação. O instalador prepara os
componentes e mostra o andamento no terminal. O programa é instalado no perfil do usuário, em
`%LOCALAPPDATA%\Learnflix`. O arquivo `install.ps1` é uma alternativa explícita
para ambientes que já permitem executar scripts PowerShell; não é necessário
liberar a execução de `.ps1` para usar o caminho principal pelo `.cmd`.

Se o Windows ou uma política da organização impedir a execução de scripts,
não desative essa proteção para prosseguir. Guarde a mensagem apresentada e
solicite a liberação pelo responsável pelo computador, quando aplicável.

### macOS

**Mac Intel ou Apple Silicon:** abra `native/Instalar.command`. Se o arquivo
extraído estiver sem a permissão de execução, abra o Terminal na pasta extraída e execute:

```sh
bash native/install.sh
```

Esse comando é o caminho de terminal para o mesmo instalador. Ele não deve ser
usado para contornar um alerta de segurança ou uma proibição da organização.
Se o macOS apresentar um bloqueio de segurança, interrompa e confira a mensagem
antes de continuar.

### Linux

**Linux com glibc, x64 ou ARM64:** abra um terminal na pasta extraída e execute:

```sh
bash native/install.sh
```

Alpine e outros sistemas com musl ainda não são suportados.

Não execute o instalador com `sudo`. Ele usa pastas do próprio usuário.

## Primeira abertura e Telegram

Na primeira configuração, informe **os dados da sua própria aplicação e conta
Telegram**:

1. API ID e API hash, obtidos em [my.telegram.org/apps](https://my.telegram.org/apps).
2. Uma senha para abrir o Learnflix, se desejar. No modo nativo local, deixar essa
   senha em branco mantém o acesso sem login no navegador.
3. Telefone da conta Telegram, código recebido e senha de duas etapas, se houver.

Hash, código e senhas são digitados de forma oculta no terminal. O pacote não
contém a sessão ou as credenciais de outra pessoa. Não copie sessões Telegram
entre instalações para evitar o login: autentique a sua conta nesta máquina.

O Learnflix escuta somente neste computador. A página usa normalmente
**http://localhost:7777** e o navegador abre automaticamente. Se essa porta já
estiver ocupada, o programa informa outra porta disponível. Se você definiu uma
senha, o usuário de acesso é **learnflix**.

Em **Adicionar → Do Telegram**, cole o link do canal ou tópico, confira a prévia
e adicione o curso. A conta autenticada precisa ter acesso à origem. Os vídeos
são buscados por trechos durante a reprodução; o curso inteiro não é baixado
antes de assistir. O ponto em que você parou fica salvo no Learnflix.

## Abrir nas próximas vezes

No Windows, o instalador prepara atalhos `Learnflix.cmd` no menu Iniciar e na
área de trabalho, sem substituir arquivos estranhos de mesmo nome. Abra um
desses atalhos para iniciar o programa; não é preciso repetir a instalação e o
login Telegram.

No Windows, também fica disponível o iniciador direto
`%LOCALAPPDATA%\Learnflix\Abrir-Learnflix.cmd`, mesmo quando um atalho de mesmo
nome no menu Iniciar/área de trabalho foi preservado.

No macOS/Linux, execute o iniciador pelo caminho completo:

```sh
~/.local/bin/learnflix
```

No macOS, você também pode abrir
`~/.local/share/learnflix/Abrir-Learnflix.command`.

Mantenha a janela do terminal aberta enquanto usa o Learnflix. Para encerrar,
use **Ctrl+C** nessa janela; fechar apenas a aba do navegador não apaga o
progresso nem necessariamente encerra o servidor.

O instalador não altera o PATH global. Se essa pasta já estiver no seu PATH,
`learnflix` também funciona no terminal.

## Onde ficam o programa e seus dados

| Sistema | Programa e componentes | Banco de progresso |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Learnflix\program` e `runtime` | `%LOCALAPPDATA%\Learnflix\app.db` |
| macOS e Linux | `~/.local/share/learnflix/program` e `runtime` | `~/.learnflix/app.db` |

A sessão Telegram e os arquivos de configuração são privados desta instalação.
Não os envie a outras pessoas. Atualizar os arquivos do programa não deve
substituir o banco de progresso.

Para levar sua biblioteca e o ponto de cada aula para outra máquina, use
**Exportar biblioteca** na instalação atual e **Configurações → Backup e
migração → Importar** na nova. O arquivo exportado não contém a sessão Telegram;
a nova máquina precisa de sua própria autenticação.

## FFmpeg incluído na preparação

FFmpeg e FFprobe são instalados no ambiente privado junto com os demais
componentes. Eles ajudam a identificar formatos, ler durações, gerar miniaturas
de arquivos locais e executar as conversões locais já disponíveis no Learnflix.

Isso **não acrescenta miniaturas ou conversão dos vídeos remotos do Telegram**.
Esses vídeos ainda precisam ter um formato compatível com o navegador; suas
durações vêm dos metadados do Telegram.

## Limites da validação

Este é um pacote nativo novo. Não considere a presença de um script de instalação
como prova de que ele foi executado em todas as versões de Windows, macOS e
Linux. A entrega deve informar quais sistemas foram realmente testados. Alertas
do sistema operacional, falta de espaço e restrições de rede podem impedir a
instalação e devem ser tratados pela mensagem exibida, sem desativar proteções.

A opção Docker continua disponível separadamente. Ela é outra forma de reunir
os componentes, não uma exigência do FFmpeg.
