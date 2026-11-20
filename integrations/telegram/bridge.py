#!/usr/bin/env python3
"""Ponte opcional de leitura: catálogo e mídia por partes, sem arquivos de mídia."""
import argparse
import asyncio
import getpass
import hmac
import math
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote

from aiohttp import web
from telethon import TelegramClient, errors, functions, types, utils

from core import Source, parse_link, parse_range, safe_name, visual_title

CHUNK = 512 * 1024
MAX_FILES = 100000


def api_error(status: int, text: str, **headers) -> web.HTTPException:
    cls = {400: web.HTTPBadRequest, 401: web.HTTPUnauthorized, 403: web.HTTPForbidden,
           404: web.HTTPNotFound, 429: web.HTTPTooManyRequests, 502: web.HTTPBadGateway,
           503: web.HTTPServiceUnavailable}[status]
    return cls(text=text, headers=headers)


async def entity_for(client, peer):
    try:
        return await client.get_entity(peer)
    except ValueError:
        if not isinstance(peer, int):
            raise
        # Uma sessão nova ainda não tem access_hash dos grupos privados no cache.
        # A lista dos próprios diálogos preenche esse cache sem entrar em grupos.
        async for dialog in client.iter_dialogs():
            if utils.get_peer_id(dialog.entity) == peer:
                return dialog.entity
        raise api_error(403, 'Esta origem não está nos grupos acessíveis à conta.') from None


async def resolve_source(client, data):
    if 'link' in data:
        try:
            source = parse_link(data['link'])
        except (ValueError, TypeError):
            raise api_error(400, 'Link de origem inválido.') from None
    else:
        chat_id, topic_id = data.get('chatId'), data.get('topicId')
        if not isinstance(chat_id, str) or not re.fullmatch(r'-[1-9][0-9]{0,18}', chat_id):
            raise api_error(400, 'Identificador de origem inválido.')
        if topic_id is not None and (type(topic_id) is not int or not 0 < topic_id < 2**31):
            raise api_error(400, 'Identificador de tópico inválido.')
        source = Source(peer=int(chat_id), topic_id=topic_id)
    if source.invite:
        invite = await client(functions.messages.CheckChatInviteRequest(source.invite))
        if not isinstance(invite, types.ChatInviteAlready):
            raise api_error(403, 'A conta precisa participar da origem. Nenhum ingresso foi solicitado.')
        entity = invite.chat
    else:
        entity = await entity_for(client, source.peer)
    # Não tratar um perfil/DM ou um bot como um curso inteiro por engano.
    if not isinstance(entity, (types.Channel, types.Chat)):
        raise api_error(400, 'Selecione um canal ou grupo.')
    topic = source.topic_id
    root = None
    if topic is not None:
        if not getattr(entity, 'forum', False):
            raise api_error(400, 'Esta origem não é um fórum com tópicos.')
        root = await client.get_messages(entity, ids=topic)
        if topic != 1 and not isinstance(getattr(root, 'action', None), types.MessageActionTopicCreate):
            raise api_error(400, 'O link não aponta para um tópico válido.')
    elif source.message_id:
        message = await client.get_messages(entity, ids=source.message_id)
        if not message:
            raise api_error(404, 'Mensagem não disponível.')
        if not getattr(entity, 'forum', False):
            raise api_error(400, 'Este é um link de mensagem. Use o link do canal inteiro ou de um tópico.')
        action = getattr(message, 'action', None)
        reply = getattr(message, 'reply_to', None)
        if isinstance(action, types.MessageActionTopicCreate):
            topic, root = message.id, message
        elif reply and getattr(reply, 'forum_topic', False):
            topic = getattr(reply, 'reply_to_top_id', None) or reply.reply_to_msg_id
            root = await client.get_messages(entity, ids=topic)
        else:
            topic = 1  # Tópico Geral do fórum.
    title = getattr(getattr(root, 'action', None), 'title', None)
    if not title:
        title = ('Geral — ' if topic == 1 else '') + entity.title
    return entity, topic, title[:1000]


def file_metadata(message):
    file = getattr(message, 'file', None)
    if not file or not file.size or file.size <= 0:
        return None
    mime = file.mime_type or 'application/octet-stream'
    video = bool(getattr(message, 'video', None)) or mime.startswith('video/')
    duration = getattr(file, 'duration', None)
    if not isinstance(duration, (float, int)) or not math.isfinite(duration) or duration < 0:
        duration = None
    name = safe_name(file.name, message.id, file.ext or '')
    meta = {'messageId': message.id, 'name': name, 'size': file.size, 'mime': mime,
            'video': video, 'duration': duration}
    title = visual_title(getattr(message, 'message', None)) if video else None
    if title:
        meta['displayTitle'] = title
    return meta


def make_app(client, token: str):
    if not isinstance(token, str) or len(token) < 32:
        raise ValueError('TELEGRAM_BRIDGE_TOKEN precisa ter pelo menos 32 caracteres.')
    slots = asyncio.Semaphore(3)
    catalog_slot = asyncio.Semaphore(1)

    @web.middleware
    async def protect(request, handler):
        supplied = request.headers.get('Authorization', '')
        if not hmac.compare_digest(supplied.encode(), ('Bearer ' + token).encode()):
            raise api_error(401, 'Conexão não autorizada.')
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except errors.FloodWaitError as err:
            raise api_error(429, 'O Telegram pediu uma espera.', **{'Retry-After': str(err.seconds)}) from None
        except (errors.ChannelPrivateError, errors.ChatAdminRequiredError):
            raise api_error(403, 'Origem inacessível para esta conta.') from None
        except (errors.AuthKeyError, errors.UnauthorizedError):
            raise api_error(503, 'A sessão Telegram precisa ser autenticada novamente.') from None
        except (ValueError, TypeError):
            raise api_error(400, 'Origem ou requisição inválida.') from None
        except (errors.RPCError, asyncio.TimeoutError, ConnectionError):
            raise api_error(502, 'O Telegram não respondeu. Tente novamente.') from None
        except Exception:
            raise api_error(502, 'O serviço Telegram encontrou uma falha. Tente novamente.') from None

    app = web.Application(middlewares=[protect], client_max_size=4096)

    async def health(request):
        connected = client.is_connected() and await client.is_user_authorized()
        return web.json_response({'connected': connected}, status=200 if connected else 503)

    async def catalog(request):
        try:
            data = await request.json()
        except (ValueError, TypeError):
            raise api_error(400, 'JSON inválido.') from None
        if not isinstance(data, dict):
            raise api_error(400, 'Origem inválida.')
        async with catalog_slot, asyncio.timeout(115):
            entity, topic, title = await resolve_source(client, data)
            files = []
            kwargs = {'reply_to': topic} if topic and topic != 1 else {}
            async for message in client.iter_messages(entity, **kwargs):
                if topic == 1:
                    reply = getattr(message, 'reply_to', None)
                    msg_topic = (getattr(reply, 'reply_to_top_id', None) or
                                 getattr(reply, 'reply_to_msg_id', None)) if getattr(reply, 'forum_topic', False) else 1
                    if msg_topic != 1:
                        continue
                meta = file_metadata(message)
                if meta:
                    files.append(meta)
                if len(files) > MAX_FILES:
                    raise api_error(400, 'Origem muito grande. Selecione um tópico menor.')
            return web.json_response({'chatId': str(utils.get_peer_id(entity)), 'topicId': topic,
                                      'title': title, 'files': sorted(files, key=lambda f: f['messageId'])})

    async def media(request):
        chat, message_id = request.match_info['chat'], request.match_info['message']
        if not re.fullmatch(r'-[1-9][0-9]{0,18}', chat) or not re.fullmatch(r'[1-9][0-9]{0,9}', message_id):
            raise api_error(400, 'Identificador inválido.')
        async with slots:
            # Rebuscar a mensagem atualiza file_reference antes de cada Range.
            async with asyncio.timeout(45):
                entity = await entity_for(client, int(chat))
                message = await client.get_messages(entity, ids=int(message_id))
            meta = file_metadata(message)
            if not meta:
                raise api_error(404, 'Arquivo indisponível.')
            size = meta['size']
            try:
                start, end, partial = parse_range(request.headers.get('Range'), size)
            except ValueError:
                return web.Response(status=416, headers={'Content-Range': f'bytes */{size}', 'Accept-Ranges': 'bytes'})
            mime = meta['mime'] if meta['video'] else 'application/octet-stream'
            # Valores do Telegram não podem injetar headers HTTP.
            if not re.fullmatch(r'[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+', mime):
                mime = 'application/octet-stream'
            headers = {'Content-Type': mime, 'Content-Length': str(end - start + 1),
                       'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
                       'X-Content-Type-Options': 'nosniff'}
            if not meta['video']:
                headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + quote(meta['name'], safe='')
            if partial:
                headers['Content-Range'] = f'bytes {start}-{end}/{size}'
            if request.method == 'HEAD':
                return web.Response(status=206 if partial else 200, headers=headers)
            remaining = end - start + 1
            iterator = client.iter_download(message.media, offset=start, request_size=CHUNK,
                                            chunk_size=CHUNK, file_size=size)
            response = web.StreamResponse(status=206 if partial else 200, headers=headers)
            prepared = False
            try:
                while remaining > 0:
                    async with asyncio.timeout(45):
                        chunk = await anext(iterator)
                    if not chunk:
                        raise ConnectionError('Mídia interrompida.')
                    if not prepared:
                        await response.prepare(request)
                        prepared = True
                    data = bytes(chunk[:remaining])
                    await response.write(data)
                    remaining -= len(data)
                await response.write_eof()
                return response
            except (StopAsyncIteration, errors.RPCError, asyncio.TimeoutError, ConnectionError):
                if prepared:
                    # Headers já enviados: interromper o transporte sinaliza vídeo
                    # incompleto. Nunca concluir com sucesso um arquivo truncado.
                    if request.transport:
                        request.transport.close()
                    return response
                raise
            finally:
                await iterator.close()

    app.router.add_get('/health', health)
    app.router.add_post('/catalog', catalog)
    app.router.add_get('/media/{chat}/{message}', media)  # GET + HEAD.
    return app


def main():
    parser = argparse.ArgumentParser(description='Ponte Telegram opcional do Learnflix')
    parser.add_argument('command', choices=['login', 'serve'])
    args = parser.parse_args()
    os.umask(0o077)
    try:
        api_id = int(os.environ.get('TELEGRAM_API_ID') or Path(os.environ['TELEGRAM_API_ID_FILE']).read_text().strip())
        api_hash = os.environ.get('TELEGRAM_API_HASH') or Path(os.environ['TELEGRAM_API_HASH_FILE']).read_text().strip()
        session = Path(os.environ.get('TELEGRAM_SESSION', str(Path.home() / '.learnflix-telegram' / 'account'))).expanduser()
        if not session.parent.exists():
            session.parent.mkdir(mode=0o700, parents=True)
        client = TelegramClient(str(session), api_id, api_hash, flood_sleep_threshold=0,
                                request_retries=2, connection_retries=2, timeout=20,
                                receive_updates=False)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        if args.command == 'login':
            async def login():
                await client.start(phone=lambda: input('Telefone Telegram (com código do país): '),
                                   code_callback=lambda: getpass.getpass('Código recebido no Telegram: '),
                                   password=lambda: getpass.getpass('Senha de duas etapas: '))
                await client.disconnect()
            loop.run_until_complete(login())
            print('Sessão própria do Learnflix autenticada. Agora execute serve.')
        else:
            token = os.environ.get('TELEGRAM_BRIDGE_TOKEN') or (Path(os.environ['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text().strip() if os.environ.get('TELEGRAM_BRIDGE_TOKEN_FILE') else '')
            if len(token) < 32:
                raise ValueError('Configure TELEGRAM_BRIDGE_TOKEN com pelo menos 32 caracteres.')
            async def startup(app):
                await client.connect()
                if not await client.is_user_authorized():
                    await client.disconnect()
                    raise ValueError('Sessão não autenticada. Execute login primeiro.')
            async def cleanup(app):
                await client.disconnect()
            app = make_app(client, token)
            app.on_startup.append(startup)
            app.on_cleanup.append(cleanup)
            web.run_app(app, host='127.0.0.1', port=int(os.environ.get('TELEGRAM_BRIDGE_PORT', '8099')),
                        access_log=None, handler_cancellation=True, loop=loop)
    except KeyError as err:
        print(f'Configure a variável {err.args[0]}.', file=sys.stderr)
        return 1
    except (ValueError, errors.RPCError, OSError):
        print('Falha na configuração ou autenticação. Confira as variáveis e a sessão própria do Learnflix.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
