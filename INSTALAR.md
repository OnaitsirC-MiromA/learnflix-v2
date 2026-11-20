# Learnflix com Telegram e FFmpeg — instalar em outra máquina

Este pacote contém a versão com Telegram e títulos visuais. Ela ainda não foi
publicada no npm ou nas releases do GitHub: `npx learnflix` e o instalador público
podem trazer a versão anterior. Para instalar esta versão, use o ZIP fornecido.

## Primeira instalação

1. Instale e abra o [Docker Desktop](https://docs.docker.com/get-docker/desktop/)
   no Windows/macOS. No Linux, pode usar Docker Engine com o
   [plugin Compose](https://docs.docker.com/compose/install/linux/).
2. Extraia o ZIP e abra o terminal na pasta `learnflix-v2`, onde está
   `compose.local.yaml`.
3. Execute os comandos abaixo, um de cada vez. Continue somente se o anterior
   terminar sem erro:

```sh
docker compose -f compose.local.yaml build
docker compose -f compose.local.yaml run --rm learnflix python3 deploy/setup.py
docker compose -f compose.local.yaml up -d
```

O primeiro comando prepara um ambiente com **Node, Python, FFmpeg e FFprobe**.
Esses programas ficam no contêiner; não precisam ser instalados separadamente no
computador. A primeira preparação baixa os componentes pela internet e pode levar
alguns minutos. Não use `compose.telegram.yaml`: esse arquivo é específico do
ZimaOS onde a instalação original está rodando.

Durante a configuração, a pessoa informa:

- **API ID e API hash da própria aplicação Telegram**, obtidos em
  [my.telegram.org/apps](https://my.telegram.org/apps).
- Uma senha própria para abrir o Learnflix.
- Telefone da própria conta Telegram, código recebido e senha de duas etapas,
  quando solicitada. Código, hash e senhas são digitados de forma oculta.

Não há dados da conta do autor neste pacote. A configuração grava os segredos em
arquivos privados no volume Docker desta instalação. Não compartilhe o volume
com outras pessoas nem copie sessões Telegram de outra instalação.

Ao terminar, abra **http://localhost:7778**. Usuário: **learnflix**. Senha: a que
foi criada na configuração. Em **Adicionar → Do Telegram**, cole o link do canal
ou tópico, confira a prévia e adicione o curso. A conta precisa ter acesso à origem.

A porta é publicada apenas neste computador. O contêiner precisa ficar rodando
para assistir. O progresso fica no volume `learnflix-runtime` do projeto Compose;
fechar o navegador ou reiniciar o contêiner não o apaga.

## FFmpeg incluído

O Dockerfile instala os pacotes FFmpeg/FFprobe do Debian junto com o Learnflix.
Eles permitem ler formatos e durações e gerar miniaturas dos **arquivos locais**.
A conversão sem perda de arquivos locais compatíveis continua disponível no app.

**Instalar FFmpeg não implementa miniaturas ou conversão dos vídeos remotos do
Telegram.** A transmissão e os títulos visuais desses vídeos funcionam pela
ponte; a duração vem dos metadados do Telegram. Os codecs ainda precisam ser
compatíveis com o navegador.

## Cursos locais (opcional)

A pasta `courses` ao lado de `compose.local.yaml` aparece como `/library` no
seletor do Learnflix. Para usar uma pasta já existente, altere só a origem do
volume `./courses:/library:ro` no arquivo Compose. Por exemplo, no Windows:

```yaml
- "C:/MeusCursos:/library:ro"
```

Use caminhos com barras normais no YAML. O `:ro` mantém a pasta em somente leitura.
Depois de alterar o volume, execute novamente `docker compose -f compose.local.yaml up -d`.

## Parar e abrir novamente

Para parar, mantendo catálogo e progresso:

```sh
docker compose -f compose.local.yaml stop
```

Para abrir novamente:

```sh
docker compose -f compose.local.yaml up -d
```

Não precisa repetir o login a cada abertura. Para autenticar novamente, pare o
serviço antes de executar `deploy/setup.py`, para que dois processos não abram
a mesma sessão Telegram simultaneamente.

Para atualizar o código, guarde uma exportação da biblioteca pela interface,
substitua os arquivos do programa pelo pacote novo e execute:

```sh
docker compose -f compose.local.yaml up -d --build
```

Mantenha o mesmo diretório/nome do projeto Compose para reutilizar o volume.
Não exclua o volume e não use `down -v`: ele contém também a sessão e o progresso.
A exportação da biblioteca contém catálogo/progresso, mas não senhas ou sessão.

## Levar seu progresso para outra instalação

Se é você mudando de máquina, use **Exportar biblioteca** no Learnflix atual e
importe esse arquivo em **Configurações → Backup e migração** na nova instalação.
Ele leva a organização, os títulos e o progresso. A autenticação Telegram deve
ser feita novamente na nova instalação; o arquivo exportado não contém a sessão.

## Corrigir credenciais de configuração

Se informou API ID/hash incorretos ou quer trocar a senha do Learnflix, pare o
serviço e execute a configuração com a opção explícita de substituição:

```sh
docker compose -f compose.local.yaml stop
docker compose -f compose.local.yaml run --rm learnflix python3 deploy/setup.py --reconfigure
docker compose -f compose.local.yaml up -d
```

O catálogo, a sessão e o progresso não são apagados. O comando pede os novos
valores antes de substituir os arquivos privados.

## Verificação

```sh
docker compose -f compose.local.yaml ps
docker compose -f compose.local.yaml exec learnflix ffmpeg -version
docker compose -f compose.local.yaml exec learnflix ffprobe -version
```

O serviço deve ficar `healthy`. A montagem e os programas foram validados no
ZimaOS/Linux.

## Instalar sem Docker

Há também um instalador nativo que não exige Docker nem instalar componentes um
a um. Ele prepara Node, Python, FFmpeg e FFprobe numa pasta do usuário, no
Windows, macOS ou Linux. Veja `INSTALAR-NATIVO.md` junto a este arquivo.

A execução do pacote nativo foi validada no Linux (glibc x64); Windows e macOS
ainda não foram executados nesta entrega.

Referências: [Docker Compose](https://docs.docker.com/compose/install/),
[FFmpeg](https://ffmpeg.org/download.html),
[credenciais de aplicações Telegram](https://core.telegram.org/api/obtaining_api_id).
