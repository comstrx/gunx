from collections.abc import Mapping
from functools import lru_cache
from urllib.parse import urlsplit

from structlog.dev import ConsoleRenderer
from structlog.processors import JSONRenderer
from structlog.typing import EventDict, Processor, WrappedLogger
from engine.context import context
from .arch import (
    BARE, BEARER, DEPTH, HOST, JWT, KNOWN, LONG, MASK, MASKED, NESTED, OPAQUE, PAIR, PEM, PLAIN, QUERY, QUOTE, QUOTED,
    REST, SCHEME, SECRETS, SHORT, STEMS, URL_AUTH, WHOLE,
)
import re

class Render:

    def correlate ( self, _: WrappedLogger, __: str, event: EventDict ) -> EventDict:

        for key, value in context.dump().items():

            if key == "actor" or key in event: continue

            event[key] = value

        return event

    def redact ( self, _: WrappedLogger, __: str, event: EventDict ) -> EventDict:

        veil = Render._veil_

        for key, value in event.items():

            shown = veil(key, value, DEPTH)

            if shown is not value: event[key] = shown

        return event

    def renderer ( self, name: str, colors: bool ) -> Processor:

        if name == "json": return JSONRenderer()

        return ConsoleRenderer(colors=colors)

    @staticmethod
    def grade ( name: str ) -> int:

        if name.isascii() and STEMS.search(name.lower()) is None: return 0

        found = SECRETS.search(name)

        if found is None: return 0

        return 2 if found.lastgroup or OPAQUE.search(name, found.end()) else 1

    @staticmethod
    def mask ( value: object ) -> str:

        text = value if isinstance(value, str) else str(value)

        if len(text) <= SHORT: return MASK

        return f"{text[:2]}{MASK}{text[-2:]}"

    @staticmethod
    def hide ( value: object, grade: int = 1 ) -> object:

        if value is None or isinstance(value, bool): return value

        return MASK if grade > 1 or isinstance(value, NESTED) else Render.mask(value)

    @staticmethod
    def origin ( value: object ) -> str:

        text = value if isinstance(value, str) else str(value)

        try:

            parts      = urlsplit(text)
            host, port = parts.hostname, parts.port

        except ValueError: return MASK

        if not parts.scheme or text.count("@") != parts.netloc.count("@"): return MASK
        if HOST.fullmatch(host or "") is None: return MASK

        held = MASKED if "@" in parts.netloc else ""
        spot = f"[{host}]" if host and ":" in host else host
        tail = "" if port is None else f":{port}"
        rest = f"/{MASK}" if parts.path.strip("/") or parts.query or parts.fragment else ""

        return f"{parts.scheme}://{held}{spot}{tail}{rest}"

    @staticmethod
    def scrub ( text: str ) -> str:

        if "://" in text: text = URL_AUTH.sub(Render._userinfo_, text)
        if "eyJ" in text: text = JWT.sub(MASK, text)
        if "PRIVATE KEY-----" in text: text = PEM.sub(MASK, text)
        if ("=" in text or ":" in text) and STEMS.search(text.lower()): text = Render._pairs_(text)
        if "earer" in text: text = BEARER.sub(rf"\g<scheme> {MASK}", text)

        return text

    @staticmethod
    def clean ( value: object, depth: int = DEPTH ) -> object:

        if type(value) in PLAIN: return value
        if isinstance(value, str): return Render.scrub(value)
        if isinstance(value, NESTED):

            veil = Render._veil_
            deep = depth - 1

            if depth <= 0: return MASK
            if isinstance(value, Mapping): return { key: veil(str(key), item, deep) for key, item in value.items() }

            return [Render.clean(item, deep) for item in value]

        text  = repr(value)
        shown = Render.scrub(text)

        return value if shown == text else shown

    @staticmethod
    def _veil_ ( name: str, value: object, depth: int ) -> object:

        grade = Render._known_(name[:LONG])

        return Render.hide(value, grade) if grade else Render.clean(value, depth)

    @staticmethod
    @lru_cache(maxsize=KNOWN)
    def _known_ ( name: str ) -> int:

        return Render.grade(name)

    @staticmethod
    def _userinfo_ ( found: re.Match[str] ) -> str:

        user, colon, _ = found.group("info").partition(":")

        return f"{found.group('scheme')}{user}:{MASKED}" if colon else f"{found.group('scheme')}{MASKED}"

    @staticmethod
    def _wanted_ ( text: str, start: int, name: str ) -> bool:

        return bool(Render.grade(name)) or (start > 0 and text[start - 1] in "?&" and name.lower() in QUERY)

    @staticmethod
    def _pairs_ ( text: str ) -> str:

        parts: list[str] = []
        done  = 0
        calm  = 0
        wide  = False

        for found in PAIR.finditer(text):

            start, stop = found.span()
            name        = found.group("name")[-LONG:]

            if text.startswith(MASKED, stop) or not Render._wanted_(text, start, name): continue

            whole = WHOLE.search(name) is not None
            lead  = None if whole else SCHEME.match(text, stop)
            at    = lead.end() if lead else stop
            held  = QUOTE.match(text, at)

            if held: end, shown = held.end(), QUOTED[text[held.end() - 1]]
            elif at < calm and (wide or not whole): continue
            else:

                tail = (REST if whole else BARE).match(text, max(at, calm))

                if tail is None: continue

                end, shown = tail.end(), MASK
                calm, wide = end, whole

            if end <= done: continue
            if stop >= done: parts += (text[done:stop], shown)
            elif calm == done:

                tail = (REST if wide else BARE).match(text, end)
                end  = tail.end() if tail else end
                calm = end

            done = end

        if not parts: return text

        parts.append(text[done:])

        return "".join(parts)
