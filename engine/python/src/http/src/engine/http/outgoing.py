from collections.abc import Iterator
from http import HTTPStatus
from typing import override

from sanic import HTTPResponse
from sanic.response.types import HEADER_TRANSLATION_TABLE as CLEAN
from .arch import BODILESS, MEDIA, NAMED, names

class Outgoing(HTTPResponse):

    fixed: tuple[tuple[bytes, bytes], ...] = ()

    @property
    @override
    def processed_headers ( self ) -> Iterator[tuple[bytes, bytes]]:

        headers = self.headers

        if self.status >= HTTPStatus.OK and self.status not in BODILESS: headers.setdefault(MEDIA, self.content_type)

        encoded = list(self.fixed)
        value: object

        for name, value in headers.items():

            key = names.get(name) or self.named(name)

            if type(value) is str and value.isprintable(): encoded.append((key, value.encode()))
            elif type(value) is int: encoded.append((key, b"%d" % value))
            else: encoded.append((key, f"{value}".translate(CLEAN).encode()))

        return iter(encoded)

    @staticmethod
    def named ( name: str ) -> bytes:

        key = name.translate(CLEAN).encode("ascii")

        if len(names) < NAMED: names[name] = key

        return key
