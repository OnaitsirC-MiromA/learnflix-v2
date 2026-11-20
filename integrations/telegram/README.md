# Ponte Telegram opcional

O Learnflix continua funcionando para cursos locais apenas com Node. Esta ponte
é necessária somente para assistir cursos que permanecem no Telegram: ela lista
os arquivos e transmite os trechos pedidos pelo player, sem baixar um curso antes
ou guardar vídeos no disco. Python 3.11 ou mais recente é necessário na máquina
que executar a ponte.

A posição de reprodução fica no banco do **Learnflix**, e não na sessão da ponte.
É possível fechar o player e retomar a aula no mesmo ponto. A disponibilidade da
mídia ainda depende do acesso da conta ao grupo e da disponibilidade do Telegram.
Containers/codecs que o navegador não decodifica não ganham transcodificação pela
ponte.

## Preparar e autenticar

No repositório:

```bash
python3 -m venv integrations/telegram/.venv
integrations/telegram/.venv/bin/python -m pip install -r integrations/telegram/requirements.txt
```

No Windows, use `integrations\telegram\.venv\Scripts\python.exe` no lugar do
caminho do Python acima e adapte a definição das variáveis ao PowerShell.

Defina `TELEGRAM_API_ID` e `TELEGRAM_API_HASH` com as credenciais da sua aplicação
em [my.telegram.org](https://my.telegram.org/). Forneça o hash pelo gerenciador de
segredos ou pelo ambiente privado do processo. Não o versione.

A ponte usa por padrão uma sessão **própria**, em
`~/.learnflix-telegram/account.session`. Para mudar o local, defina
`TELEGRAM_SESSION` com o caminho-base da sessão. Não aponte para o arquivo de
sessão de um arquivador em execução: duas aplicações não devem compartilhar o
mesmo SQLite de sessão.

```bash
integrations/telegram/.venv/bin/python integrations/telegram/bridge.py login
```

O telefone é solicitado no terminal; código e senha de duas etapas são entradas
ocultas. Este comando é a única etapa interativa. `serve` nunca inicia um login
nem pede código. A pasta criada tem permissão privada, e novos arquivos são
criados com `umask 077` em sistemas Unix. Mantenha também os backups de sessão em
local privado: eles dão acesso à conta.

## Conectar ao Learnflix

Crie um segredo aleatório privado uma vez. Exemplo para Linux/macOS:

```bash
mkdir -p ~/.learnflix-telegram
chmod 700 ~/.learnflix-telegram
(umask 077; python3 -c 'import secrets; print(secrets.token_urlsafe(32))' > ~/.learnflix-telegram/bridge.key)
export TELEGRAM_BRIDGE_TOKEN="$(cat ~/.learnflix-telegram/bridge.key)"
```

O token precisa ter pelo menos 32 caracteres. Use o mesmo valor no ambiente da
ponte e do Learnflix. O token não é a senha da conta Telegram.

Com `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` e `TELEGRAM_BRIDGE_TOKEN` definidos:

```bash
integrations/telegram/.venv/bin/python integrations/telegram/bridge.py serve
```

A ponte escuta **somente em `127.0.0.1:8099`**. Opcionalmente,
`TELEGRAM_BRIDGE_PORT` muda a porta. No processo do Learnflix, defina:

```bash
export TELEGRAM_BRIDGE_URL=http://127.0.0.1:8099
export TELEGRAM_BRIDGE_TOKEN="$(cat ~/.learnflix-telegram/bridge.key)"
npm start
```

Em desenvolvimento, use `npm run dev` no lugar de `npm start`. Primeiro execute
`npm run build` para produzir a versão de `npm start`.

Ponte e Learnflix devem rodar no mesmo computador nesse arranjo. Para uma ponte em
outra máquina, é necessário um proxy HTTPS autenticado ou um túnel local seguro;
não exponha a porta da ponte diretamente na rede pública. A URL e o token são
configurações do servidor e nunca são enviados ao navegador.

Na biblioteca, escolha a opção Telegram, cole o link de canal/grupo ou tópico,
confira a prévia e adicione. Listar não baixa as mídias. A lista é ordenada por
mensagem; atualizar o catálogo mantém os identificadores das aulas e o progresso.
Não há ingresso ou saída automática de grupos, encaminhamento, criação de canais
ou envio de mensagens.

## Links aceitos

- `https://t.me/NomeDoCanal`: o catálogo inteiro acessível à conta.
- `https://t.me/NomeDoGrupo/123`: resolve o tópico quando 123 é a criação de um
  tópico ou pertence a um tópico de fórum.
- `https://t.me/NomeDoGrupo/123/456`: tópico 123, mensagem 456.
- `https://t.me/c/1234567890/123`: origem privada já acessível; a mensagem precisa
  identificar um tópico. A sessão nova consulta seus próprios diálogos se ainda
  não conhecer o grupo no cache.
- Convites `https://t.me/+…` e `https://t.me/joinchat/…`: aceitos somente quando a
  conta **já participa**. Nenhum pedido de entrada é enviado.

Um link de mensagem de canal sem tópicos não importa o canal inteiro
silenciosamente: use o link do canal sem o número da mensagem. O tópico Geral é
filtrado separadamente para não incluir os demais tópicos.

## Protocolo e limites

Todas as rotas exigem `Authorization: Bearer <token>`:

- `GET /health`: 200 somente com cliente conectado e sessão autorizada.
- `POST /catalog`: `{ "link": "https://t.me/…" }`, ou
  `{ "chatId": "-100…", "topicId": 123 }` para atualizar uma origem já cadastrada.
  `topicId: null` significa canal/grupo inteiro. `chatId` é o ID marcado devolvido
  pelo Telegram, não o trecho numérico de um link `/c/`.
- `GET` / `HEAD /media/{chatId}/{messageId}`: suporta `Range` simples, intervalos
  abertos e sufixos. Responde 206 com `Content-Range` ou 416 quando o intervalo
  não puder ser atendido. `HEAD` e catálogo nunca transferem a mídia.

A ponte rebusca a mensagem para renovar a referência do arquivo a cada requisição.
Há no máximo três transmissões simultâneas, blocos de até 512 KiB e contrapressão
na escrita HTTP. Ao desconectar o navegador, a tarefa é cancelada e o iterador é
fechado. Os blocos de mídia não são gravados em disco. O navegador pode antecipar
alguns trechos no seu próprio buffer, como em qualquer vídeo por HTTP.

Anexos são servidos como download, nunca como HTML ativo na origem do Learnflix.
Um pedido de espera do Telegram vira HTTP 429 com `Retry-After`; nenhum loop
ilimitado de novas tentativas é iniciado. Um catálogo que não terminar em 115
segundos retorna erro em vez de importar uma lista parcial. Origens muito grandes
podem precisar ser divididas por tópico. Falhas durante um stream interrompem a
conexão para o player perceber a transferência incompleta.

## Testes sem conta Telegram

```bash
integrations/telegram/.venv/bin/python -m unittest discover -s integrations/telegram -v
```

Os testes usam dados simulados e um servidor HTTP temporário em loopback. Conferem
links, intervalos, autenticação, catálogo, atualização, `HEAD`, anexos e nova
consulta da mensagem a cada reprodução. Eles não validam latência de uma conta
real, codecs ou reprodução em um navegador real.

Referências: [download por partes](https://core.telegram.org/api/files),
[`iter_download`](https://docs.telethon.dev/en/stable/modules/client.html#telethon.client.downloads.DownloadMethods.iter_download),
[verificação de convites](https://core.telegram.org/method/messages.checkChatInvite).
