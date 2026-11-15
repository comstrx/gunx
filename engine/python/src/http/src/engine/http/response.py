from collections.abc import AsyncIterator, Mapping, Sequence
from http import HTTPStatus
from pathlib import Path
from typing import Any, cast

from sanic import HTTPResponse
from sanic.response import ResponseStream, file_stream as served, redirect as moved
from engine.array import array
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.json import json
from engine.parse import parse
from engine.thread import thread
from .arch import Answer, ANSWERS, CHALLENGE, Headers, JSON, Meta, TEXT
from .envelope import Envelope
from .outgoing import Outgoing
import csv, io, math

class Response:

    @classmethod
    def answer ( cls, result: Any ) -> Answer:

        if isinstance(result, ANSWERS): return result
        if result is None: return cls.empty()

        return cls.ok(result)

    @staticmethod
    def raw (
        body: bytes, status: int = HTTPStatus.OK, media: str = JSON, headers: Headers | None = None,
    ) -> HTTPResponse:

        return Outgoing(body, status, cast("dict[str, str] | None", headers), media)

    @classmethod
    def json ( cls, payload: object, status: int = HTTPStatus.OK, headers: Headers | None = None ) -> HTTPResponse:

        return cls.raw(json.encode(payload), status, JSON, headers)

    @classmethod
    def ok ( cls, data: object = None, message: str | None = None, meta: Meta | None = None ) -> HTTPResponse:

        return Outgoing(json.encode(Envelope.success(data, message, Code.OK, meta)), HTTPStatus.OK, None, JSON)

    @classmethod
    def created (
        cls, data: object = None, message: str | None = None, meta: Meta | None = None, location: str | None = None,
    ) -> HTTPResponse:

        headers = { "Location": location } if location else None

        return cls.json(Envelope.success(data, message, Code.CREATED, meta), HTTPStatus.CREATED, headers)

    @classmethod
    def accepted ( cls, data: object = None, message: str | None = None, meta: Meta | None = None ) -> HTTPResponse:

        return cls.json(Envelope.success(data, message, Code.ACCEPTED, meta), HTTPStatus.ACCEPTED)

    @classmethod
    def empty ( cls, headers: Headers | None = None ) -> HTTPResponse:

        return Outgoing(b"", HTTPStatus.NO_CONTENT, cast("dict[str, str] | None", headers))

    @classmethod
    def page (
        cls, rows: Sequence[object], total: int, page: int = 1, limit: int = 20, meta: Meta | None = None,
    ) -> HTTPResponse:

        return cls.ok(list(rows), meta={ **array.page(total, page, limit).dump(), **(meta or {}) })

    @classmethod
    def fail ( cls, fault: Fault, meta: Meta | None = None ) -> HTTPResponse:

        headers = dict(fault.headers or {})

        if fault.retry_after is not None: headers["Retry-After"] = str(math.ceil(fault.retry_after))
        if fault.status == HTTPStatus.UNAUTHORIZED: headers.setdefault("WWW-Authenticate", CHALLENGE)

        return cls.json(Envelope.failure(fault, meta), int(fault.status), headers)

    @classmethod
    def problem (
        cls, code: Code, reason: str | None = None, errors: Mapping[str, list[str]] | None = None,
    ) -> HTTPResponse:

        return cls.fail(Fault(code, reason=reason, errors=dict(errors) if errors else None))

    @classmethod
    def text ( cls, content: str, status: int = HTTPStatus.OK, media: str = TEXT ) -> HTTPResponse:

        return cls.raw(content.encode(), status, media)

    @classmethod
    def html ( cls, content: str, status: int = HTTPStatus.OK ) -> HTTPResponse:

        return cls.text(content, status, "text/html; charset=utf-8")

    @classmethod
    def csv (
        cls, rows: Sequence[Sequence[object]], name: str = "export.csv", header: Sequence[str] | None = None,
    ) -> HTTPResponse:

        buffer = io.StringIO()
        writer = csv.writer(buffer)

        if header: writer.writerow(header)

        writer.writerows(rows)

        return cls.download(buffer.getvalue().encode(), name, "text/csv; charset=utf-8")

    @classmethod
    def csv_stream (
        cls, rows: AsyncIterator[Sequence[object]], name: str = "export.csv", header: Sequence[str] | None = None,
    ) -> ResponseStream:

        async def chunks () -> AsyncIterator[bytes]:

            buffer = io.StringIO()
            writer = csv.writer(buffer)

            try:

                if header:

                    writer.writerow(header)

                    yield buffer.getvalue().encode()

                    buffer.seek(0)
                    buffer.truncate(0)

                async for row in rows:

                    writer.writerow(row)

                    yield buffer.getvalue().encode()

                    buffer.seek(0)
                    buffer.truncate(0)

            finally:

                buffer.close()
                close = getattr(rows, "aclose", None)

                if close is not None: await close()

        return cls.stream(chunks(), "text/csv; charset=utf-8", { "Content-Disposition": cls._attachment_(name) })

    @classmethod
    def download ( cls, body: bytes, name: str, media: str = "application/octet-stream" ) -> HTTPResponse:

        return cls.raw(body, HTTPStatus.OK, media, { "Content-Disposition": cls._attachment_(name) })

    @staticmethod
    def _attachment_ ( name: str ) -> str:

        safe = "".join(ch if ch.isascii() and (ch.isalnum() or ch in "._-") else "_" for ch in str(name)) or "download"
        head = f'attachment; filename="{safe}"'

        if name.isascii(): return head

        shown = "".join(ch if ch.isprintable() and ch not in "/\\" else "_" for ch in name)

        return head + "; filename*=UTF-8" + "''" + parse.quote(shown)

    @staticmethod
    def etag ( body: bytes | str, weak: bool = True ) -> str:

        tag = f'"{crypto.hash(body, "blake3")[:32]}"'

        return f"W/{tag}" if weak else tag

    @staticmethod
    def cached ( response: HTTPResponse, seconds: int, public: bool = True, etag: str | None = None ) -> HTTPResponse:

        scope = "public" if public else "private"

        if type(seconds) is not int or seconds < 0: raise Fault(Code.INTERNAL, reason="http.cache")

        response.headers["Cache-Control"] = f"{scope}, max-age={seconds}" if seconds else "no-store"

        if etag: response.headers["ETag"] = etag

        return response

    @staticmethod
    def not_modified ( etag: str | None = None ) -> HTTPResponse:

        headers = { "ETag": etag } if etag else {}

        return HTTPResponse(b"", status=HTTPStatus.NOT_MODIFIED, headers=headers)

    @staticmethod
    def redirect ( target: str, status: int = HTTPStatus.TEMPORARY_REDIRECT ) -> HTTPResponse:

        sound = type(target) is str and target.isascii() and target.isprintable()
        sound = sound and target.startswith(("/", "https://", "http://"))

        if not sound or target.startswith(("//", "/\\")): raise Fault(Code.INTERNAL, reason="http.redirect")

        return moved(target, status=status)

    @classmethod
    async def file (
        cls, path: Path, media: str | None = None, name: str | None = None, cache: int = 0,
    ) -> ResponseStream:

        if not await thread.offload(path.is_file): raise Fault(Code.NOT_FOUND, reason="http.file")

        headers = { "Cache-Control": f"public, max-age={cache}" if cache else "no-store" }

        if name: headers["Content-Disposition"] = cls._attachment_(name)

        return await served(str(path), mime_type=media, headers=headers, chunk_size=256 * 1024)

    @staticmethod
    def stream (
        source: AsyncIterator[bytes] | None, media: str = "application/octet-stream", headers: Headers | None = None,
        status: int = HTTPStatus.OK,
    ) -> ResponseStream:

        async def pump ( response: Any ) -> None:

            if source is None: return

            try:

                async for chunk in source: await response.write(chunk)

            finally:

                close = getattr(source, "aclose", None)

                if close is not None: await close()

        return ResponseStream(pump, status=status, content_type=media, headers=dict(headers or {}))

    @classmethod
    def json_stream (
        cls, source: AsyncIterator[object], status: int = HTTPStatus.OK, headers: Headers | None = None,
    ) -> ResponseStream:

        return cls.stream(json.encode_stream(source), JSON, headers, status)

    @classmethod
    def sse ( cls, source: AsyncIterator[tuple[str, object]], retry: int = 3000 ) -> ResponseStream:

        if type(retry) is not int or retry < 0: raise Fault(Code.INTERNAL, reason="http.sse")

        async def frames () -> AsyncIterator[bytes]:

            try:

                yield f"retry: {retry}\n\n".encode()

                async for event, data in source:

                    if type(event) is not str or any(char in event for char in "\r\n\x00"):

                        raise Fault(Code.INTERNAL, reason="http.sse")

                    yield b"".join((b"event: ", event.encode(), b"\ndata: ", json.encode(data), b"\n\n"))

            finally:

                close = getattr(source, "aclose", None)

                if close is not None: await close()

        return cls.stream(frames(), "text/event-stream", { "Cache-Control": "no-cache", "X-Accel-Buffering": "no" })
