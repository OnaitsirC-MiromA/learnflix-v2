"""Testes locais com Telegram simulado; nenhuma conta é acessada."""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

from aiohttp.test_utils import TestClient, TestServer
from telethon import types, functions

from bridge import make_app, resolve_source, file_metadata
from core import parse_link, parse_range, safe_name, visual_title

TOKEN = 'teste-de-token-local-com-mais-de-32-caracteres'


class CoreTests(unittest.TestCase):
    def test_ranges(self):
        self.assertEqual(parse_range(None, 10), (0, 9, False))
        self.assertEqual(parse_range('bytes=3-5', 10), (3, 5, True))
        self.assertEqual(parse_range('bytes=3-', 10), (3, 9, True))
        self.assertEqual(parse_range('bytes=-4', 10), (6, 9, True))
        self.assertEqual(parse_range('bytes=8-100', 10), (8, 9, True))
        self.assertEqual(parse_range('bytes=-100', 10), (0, 9, True))
        for invalid in ('bytes=-0', 'bytes=-', 'bytes=10-', 'bytes=5-3', 'bytes=1-2,4-5', 'x=1-2'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                parse_range(invalid, 10)

    def test_links(self):
        self.assertEqual(parse_link('https://t.me/Curso'), parse_link('https://t.me/Curso/'))
        source = parse_link('https://t.me/c/12345/99/101')
        self.assertEqual((source.peer, source.topic_id, source.message_id), (-1000000012345, 99, 101))
        self.assertEqual(parse_link('https://t.me/Curso/99?thread=8').topic_id, 8)
        self.assertEqual(parse_link('https://t.me/+convite_ABC').invite, 'convite_ABC')
        self.assertEqual(parse_link('https://t.me/joinchat/convite_ABC').invite, 'convite_ABC')
        for link in ('http://t.me/Curso', 'https://evil.test/Curso', 'https://t.me@evil.test/Curso',
                     'https://t.me/Curso/0', 'https://t.me/Curso?thread=x',
                     'https://t.me/Curso/8/9?thread=7', 'https://t.me/c/123/../9'):
            with self.subTest(link=link), self.assertRaises(ValueError):
                parse_link(link)

    def test_visual_title(self):
        self.assertEqual(visual_title('#F01 01.1. The Family.mp4'), 'F01 · 01.1 — The Family')
        self.assertEqual(visual_title('#F88 30.1. At the Hotel.mp4'), 'F88 · 30.1 — At the Hotel')
        self.assertEqual(visual_title('#F119 40.3. The Departure.MP4'), 'F119 · 40.3 — The Departure')
        self.assertEqual(visual_title('#F09 Revisão.mp4'), 'F09 · Revisão')
        self.assertEqual(visual_title('Orientações\n#F03 01.3. The Family.mp4\nhttps://t.me/exemplo'), 'F03 · 01.3 — The Family')
        for value in (None, '', '#F01', '#F01.mp4', 'https://t.me/exemplo', '#F01 #curso'):
            self.assertIsNone(visual_title(value))
        self.assertLessEqual(len(visual_title('Uma aula ' * 100)), 480)

    def test_metadata_preserves_original_name(self):
        message = SimpleNamespace(id=88, message='#F88 30.1. At the Hotel.mp4', video=object(),
            file=SimpleNamespace(name='input_nome_generico.mp4', size=10, mime_type='video/mp4', duration=60, ext='.mp4'))
        meta = file_metadata(message)
        self.assertEqual(meta['name'], 'input_nome_generico.mp4')
        self.assertEqual(meta['displayTitle'], 'F88 · 30.1 — At the Hotel')
        message.message = '#F88'
        self.assertNotIn('displayTitle', file_metadata(message))

    def test_name(self):
        self.assertEqual(safe_name('../a\\b\n.mp4', 1), '_a_b_.mp4')
        self.assertEqual(safe_name('', 9, '.mp4'), 'arquivo-9.mp4')


class FakeDownload:
    def __init__(self, client, offset):
        self.client = client
        self.offset = offset

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.offset >= len(self.client.data):
            raise StopAsyncIteration
        if self.client.delay_after_first and self.offset > 0:
            await asyncio.Event().wait()
        value = self.client.data[self.offset:self.offset + 3]
        self.offset += len(value)
        return value

    async def close(self):
        self.client.closed += 1
        self.client.download_closed.set()


class FakeTelegram:
    def __init__(self):
        self.data = b'ABCDEFGHIJ'
        self.closed = 0
        self.downloads = 0
        self.delay_after_first = False
        self.download_closed = asyncio.Event()
        self.requests = []
        self.private_cache_empty = False
        self.lookups = 0
        self.file = SimpleNamespace(name='01 Aula.mp4', size=10, mime_type='video/mp4', ext='.mp4', duration=60)
        self.message = SimpleNamespace(id=99, file=self.file, media=object(), video=object(), reply_to=None)
        self.entity = types.Channel(id=12345, title='Curso', photo=types.ChatPhotoEmpty(),
                                    date=datetime.now(timezone.utc), megagroup=True, forum=True)
        self.messages = [self.message]
        self.invite = types.ChatInviteAlready(chat=self.entity)

    def is_connected(self):
        return True

    async def is_user_authorized(self):
        return True

    async def __call__(self, request):
        self.requests.append(request)
        return self.invite

    async def get_entity(self, peer):
        if isinstance(peer, int) and self.private_cache_empty:
            raise ValueError('Cache vazio')
        return self.entity

    def iter_dialogs(self):
        async def dialogs():
            yield SimpleNamespace(entity=self.entity)
        return dialogs()

    async def get_messages(self, peer, ids):
        self.lookups += 1
        if isinstance(peer, int) and self.private_cache_empty:
            raise ValueError('Precisa resolver access_hash do grupo privado')
        if ids == 8:
            return SimpleNamespace(id=8, action=types.MessageActionTopicCreate(title='Inglês', icon_color=0))
        return self.message if ids == 99 else None

    def iter_messages(self, entity, **kwargs):
        async def messages():
            for message in self.messages:
                yield message
        return messages()

    def iter_download(self, media, **kwargs):
        self.downloads += 1
        return FakeDownload(self, kwargs['offset'])


class HttpTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.telegram = FakeTelegram()
        self.client = TestClient(TestServer(make_app(self.telegram, TOKEN)))
        await self.client.start_server()
        self.headers = {'Authorization': 'Bearer ' + TOKEN}

    async def asyncTearDown(self):
        await self.client.close()

    async def test_auth(self):
        response = await self.client.get('/health')
        self.assertEqual(response.status, 401)
        response = await self.client.get('/health', headers=self.headers)
        self.assertEqual(response.status, 200)

    async def test_range_and_reference_refresh(self):
        response = await self.client.get('/media/-10012345/99', headers={**self.headers, 'Range': 'bytes=3-6'})
        self.assertEqual(response.status, 206)
        self.assertEqual(response.headers['Content-Range'], 'bytes 3-6/10')
        self.assertEqual(await response.read(), b'DEFG')
        response = await self.client.get('/media/-10012345/99', headers={**self.headers, 'Range': 'bytes=-2'})
        self.assertEqual(await response.read(), b'IJ')
        self.assertEqual(self.telegram.lookups, 2)
        self.assertEqual(self.telegram.closed, 2)

    async def test_full_head_and_416(self):
        response = await self.client.get('/media/-10012345/99', headers=self.headers)
        self.assertEqual(response.status, 200)
        self.assertEqual(await response.read(), b'ABCDEFGHIJ')
        response = await self.client.head('/media/-10012345/99', headers={**self.headers, 'Range': 'bytes=5-'})
        self.assertEqual(response.status, 206)
        self.assertEqual(response.headers['Content-Length'], '5')
        self.assertEqual(await response.read(), b'')
        self.assertEqual(self.telegram.downloads, 1)
        response = await self.client.get('/media/-10012345/99', headers={**self.headers, 'Range': 'bytes=100-'})
        self.assertEqual(response.status, 416)
        self.assertEqual(response.headers['Content-Range'], 'bytes */10')
        self.assertEqual(self.telegram.downloads, 1)

    async def test_catalog_and_refresh_do_not_download(self):
        for data in ({'link': 'https://t.me/Curso/8'}, {'chatId': '-10012345', 'topicId': 8}):
            response = await self.client.post('/catalog', json=data, headers=self.headers)
            self.assertEqual(response.status, 200, await response.text())
            catalog = await response.json()
            self.assertEqual(catalog['title'], 'Inglês')
            self.assertEqual(catalog['chatId'], '-1000000012345')
            self.assertEqual(catalog['topicId'], 8)
            self.assertEqual(catalog['files'][0]['messageId'], 99)
        self.assertEqual(self.telegram.downloads, 0)

    async def test_non_video_is_attachment(self):
        self.telegram.file.mime_type = 'text/html'
        self.telegram.file.name = 'arquivo.html'
        self.telegram.message.video = None
        response = await self.client.get('/media/-10012345/99', headers=self.headers)
        self.assertEqual(response.headers['Content-Type'], 'application/octet-stream')
        self.assertTrue(response.headers['Content-Disposition'].startswith('attachment;'))
        await response.read()

    async def test_message_link_is_not_a_whole_channel(self):
        self.telegram.entity.forum = False
        response = await self.client.post('/catalog', json={'link': 'https://t.me/Curso/99'}, headers=self.headers)
        self.assertEqual(response.status, 400)
        self.assertEqual(self.telegram.downloads, 0)

    async def test_disconnect_closes_iterator(self):
        self.telegram.delay_after_first = True
        response = await self.client.get('/media/-10012345/99', headers=self.headers)
        self.assertEqual(await response.content.readexactly(3), b'ABC')
        response.close()
        await asyncio.wait_for(self.telegram.download_closed.wait(), timeout=2)
        self.assertEqual(self.telegram.closed, 1)

    async def test_private_source_populates_cache_without_join(self):
        self.telegram.private_cache_empty = True
        response = await self.client.post('/catalog', json={'chatId': '-1000000012345', 'topicId': 8}, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())
        self.assertEqual(self.telegram.requests, [])
        self.assertEqual(self.telegram.downloads, 0)

    async def test_media_resolves_private_cache_after_backup_import(self):
        self.telegram.private_cache_empty = True
        response = await self.client.get('/media/-1000000012345/99', headers={**self.headers, 'Range': 'bytes=5-'})
        self.assertEqual(response.status, 206, await response.text() if response.status != 206 else '')
        self.assertEqual(await response.read(), b'FGHIJ')
        self.assertEqual(self.telegram.closed, 1)
        self.assertEqual(self.telegram.requests, [])

    async def test_invite_never_joins(self):
        response = await self.client.post('/catalog', json={'link': 'https://t.me/+Convite'}, headers=self.headers)
        self.assertEqual(response.status, 200, await response.text())
        self.telegram.invite = SimpleNamespace()  # Convite de origem ainda não participante.
        response = await self.client.post('/catalog', json={'link': 'https://t.me/+Convite'}, headers=self.headers)
        self.assertEqual(response.status, 403)
        self.assertTrue(all(isinstance(r, functions.messages.CheckChatInviteRequest) for r in self.telegram.requests))
        self.assertEqual(self.telegram.downloads, 0)

    async def test_bad_refresh_ids(self):
        response = await self.client.post('/catalog', json={'chatId': 'https://evil.test', 'topicId': 8}, headers=self.headers)
        self.assertEqual(response.status, 400)


if __name__ == '__main__':
    unittest.main()
