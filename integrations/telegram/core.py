"""Validação pura de links, nomes e intervalos usados pela ponte Telegram."""
from dataclasses import dataclass
import re
from urllib.parse import parse_qs, urlsplit


@dataclass(frozen=True)
class Source:
    peer: str | int | None = None
    message_id: int | None = None
    topic_id: int | None = None
    invite: str | None = None


def positive(value: str) -> int:
    if not re.fullmatch(r'[1-9][0-9]{0,9}', value):
        raise ValueError('Identificador inválido.')
    return int(value)


def parse_link(link: str) -> Source:
    if not isinstance(link, str) or len(link) > 2048:
        raise ValueError('Link inválido.')
    u = urlsplit(link)
    if u.scheme != 'https' or u.netloc != 't.me' or u.fragment:
        raise ValueError('Use um link https://t.me/.')
    parts = u.path.strip('/').split('/')
    query = parse_qs(u.query, keep_blank_values=True)
    if any(k not in ('topic', 'thread', 'single') for k in query):
        raise ValueError('Parâmetro de link inválido.')
    topic = None
    for key in ('topic', 'thread'):
        if key in query:
            if len(query[key]) != 1:
                raise ValueError('Tópico inválido.')
            proposed = positive(query[key][0])
            if topic is not None and proposed != topic:
                raise ValueError('Tópico ambíguo.')
            topic = proposed
    if len(parts) == 1 and parts[0].startswith('+'):
        invite = parts[0][1:]
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', invite) or topic:
            raise ValueError('Convite inválido.')
        return Source(invite=invite)
    if len(parts) == 2 and parts[0] == 'joinchat':
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', parts[1]) or topic:
            raise ValueError('Convite inválido.')
        return Source(invite=parts[1])
    if parts[0] == 'c':
        if not 2 <= len(parts) <= 4:
            raise ValueError('Link privado inválido.')
        channel = positive(parts[1])
        peer: str | int = -(10**12 + channel)
        ids = parts[2:]
    else:
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,31}', parts[0]) or len(parts) > 3:
            raise ValueError('Canal inválido.')
        peer = parts[0]
        ids = parts[1:]
    nums = [positive(v) for v in ids]
    if len(nums) == 2:
        if topic is not None and topic != nums[0]:
            raise ValueError('Tópico ambíguo.')
        topic = nums[0]
    return Source(peer=peer, message_id=nums[-1] if nums else None, topic_id=topic)


def parse_range(header: str | None, size: int) -> tuple[int, int, bool]:
    """Um intervalo inclusivo; o servidor nunca ignora Range inválido."""
    if size <= 0:
        raise ValueError('Arquivo vazio.')
    if header is None:
        return 0, size - 1, False
    m = re.fullmatch(r'bytes=([0-9]*)-([0-9]*)', header.strip())
    if not m or not (m[1] or m[2]):
        raise ValueError('Intervalo inválido.')
    if not m[1]:
        length = int(m[2])
        if length <= 0:
            raise ValueError('Intervalo inválido.')
        return max(0, size - length), size - 1, True
    start = int(m[1])
    end = min(int(m[2]), size - 1) if m[2] else size - 1
    if start >= size or start > end:
        raise ValueError('Intervalo fora do arquivo.')
    return start, end, True


def safe_name(name: str | None, message_id: int, extension: str = '') -> str:
    # É um nome para exibição, nunca um caminho fornecido ao sistema de arquivos.
    clean = re.sub(r'[\x00-\x1f\x7f/\\]', '_', name or '')[:900].strip(' .')
    return clean or f'arquivo-{message_id}{extension}'


def visual_title(caption: str | None) -> str | None:
    """Usa texto explícito da legenda; não deduz conteúdo a partir do vídeo."""
    if not isinstance(caption, str):
        return None
    lines = [' '.join(re.sub(r'[\x00-\x1f\x7f]', ' ', line).split())
             for line in caption.splitlines()[:12]]
    candidates = [line for line in lines if line and not re.search(r'https?://|t\.me/', line, re.I)
                  and not re.fullmatch(r'(?:#[\w-]+\s*)+', line)]
    if not candidates:
        return None
    # Uma legenda pode terminar com publicidade; prioriza a linha que identifica
    # expressamente a aula, sem transportar o restante da mensagem para o título.
    line = next((line for line in candidates if re.match(r'^#?F\d+\s+\S', line, re.I)), candidates[0])
    line = re.sub(r'\.(?:mp4|m4v|webm|mov|mkv|avi|ts)\s*$', '', line, flags=re.I).strip()
    if re.fullmatch(r'(?:#[\w-]+\s*)+', line):
        return None
    numbered = re.fullmatch(r'#?(F\d+)\s+(\d+(?:\.\d+)+)\.?\s+(.+)', line, re.I)
    if numbered:
        code, sequence, title = numbered.groups()
        line = f'{code.upper()} · {sequence} — {title}'
    else:
        coded = re.fullmatch(r'#?(F\d+)\s+(.+)', line, re.I)
        if coded:
            line = f'{coded[1].upper()} · {coded[2]}'
    return line[:480] if re.search(r'[^\W\d_]', line, re.UNICODE) else None
