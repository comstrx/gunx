from types import MappingProxyType
from typing import cast

from cryptography.exceptions import InvalidTag, UnsupportedAlgorithm
from cryptography.hazmat.primitives.ciphers.aead import AESGCM, AESGCMSIV, ChaCha20Poly1305
from engine.error import Code, Fault
from engine.rand import rand
from .arch import (
    Aead, ALGORITHMS, BINARY_EXTRA, Binding, KEY_COUNT, LEGACY_HEADER, LIMIT, MAX_BYTES, NAME, NAME_BYTES,
    NONCE_BYTES, Key, Ring, TAG_BYTES, VERSION,
)
from .wire import Wire

class Cipher:

    __slots__ = ("_ring", "algorithm", "limit")

    def __init__ ( self, algorithm: str = "aes-gcm", limit: int = LIMIT, ring: Ring | None = None ) -> None:

        if algorithm not in ALGORITHMS: raise Fault(Code.INTERNAL, reason="crypto.algorithm")
        if type(limit) is not int or not 1 <= limit <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="crypto.limit")

        self.algorithm = algorithm
        self.limit     = limit
        self._ring     = ring

    def scope ( self, algorithm: str | None = None, limit: int | None = None ) -> Cipher:

        chosen = self.algorithm if algorithm is None else algorithm
        budget = self.limit if limit is None else limit

        return Cipher(chosen, budget, self._ring)

    def setup ( self, keys: list[Key], current: str | None ) -> None:

        if not isinstance(cast("object", keys), (list, tuple)) or not 1 <= len(keys) <= KEY_COUNT:
            raise Fault(Code.INTERNAL, reason="crypto.keys")
        if any(not isinstance(key, Key) for key in keys): raise Fault(Code.INTERNAL, reason="crypto.keys")

        held   = { key.id: key for key in keys }
        chosen = keys[0].id if current is None else current

        if len(held) != len(keys): raise Fault(Code.INTERNAL, reason="crypto.keys")
        if type(chosen) is not str or chosen not in held: raise Fault(Code.INTERNAL, reason="crypto.current")

        ciphers: dict[tuple[str, str], Binding] = {}

        for key in held.values():

            for algorithm, factory in zip(ALGORITHMS, (AESGCM, ChaCha20Poly1305, AESGCMSIV), strict=True):

                try:

                    cipher = cast("Aead", factory(key.secret))
                    header = Wire.header(key.id, algorithm)
                    prefix = Wire.prefix(key.id, algorithm)

                    ciphers[key.id, algorithm] = Binding(cipher, header, prefix)

                except UnsupportedAlgorithm:

                    if algorithm == self.algorithm: raise Fault(Code.UNAVAILABLE, reason="crypto.algorithm") from None

        self._ring = Ring(chosen, MappingProxyType(held), MappingProxyType(ciphers))

    def ready ( self ) -> bool:

        return self._ring is not None

    def current ( self ) -> Key:

        ring = self._state_()

        return ring.keys[ring.current]

    def names ( self ) -> tuple[str, ...]:

        ring = self._ring

        return tuple(sorted(ring.keys)) if ring else ()

    def describe ( self ) -> dict[str, object]:

        ring = self._ring

        return {
            "keys": tuple(sorted(ring.keys)) if ring else (),
            "current": ring.current if ring else None,
            "algorithm": self.algorithm,
        }

    def seal ( self, data: bytes | str, aad: bytes ) -> str:

        binding, nonce, body = self._encrypt_(data, aad)

        return binding.prefix + Wire.pack(nonce + body)

    def seal_bytes ( self, data: bytes | str, aad: bytes ) -> bytes:

        binding, nonce, body = self._encrypt_(data, aad)

        return b"".join((binding.header, nonce, body))

    def open ( self, text: str, aad: bytes ) -> bytes:

        name, blob, algorithm, version = Wire.read(text, self.limit)

        return self._decrypt_(name, algorithm, version, blob[:NONCE_BYTES], memoryview(blob)[NONCE_BYTES:], aad)

    def open_bytes ( self, blob: bytes, aad: bytes ) -> bytes:

        if not isinstance(cast("object", blob), bytes) or not LEGACY_HEADER <= len(blob) <= self.limit + BINARY_EXTRA:
            raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        version = 1 if blob.startswith(b"E1") else 2 if blob.startswith(b"E2") else 0
        start   = 3 if version == 1 else 4

        if not version or len(blob) < start: raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        index = 0 if version == 1 else blob[2]
        width = blob[start - 1]
        end   = start + width

        sized = NONCE_BYTES + TAG_BYTES <= len(blob) - end <= self.limit + NONCE_BYTES + TAG_BYTES

        if index >= len(ALGORITHMS) or not 1 <= width <= NAME_BYTES or not sized:
            raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        try: name = blob[start:end].decode("ascii")
        except UnicodeDecodeError as error: raise Fault(Code.BAD_REQUEST, reason="crypto.sealed") from error

        if NAME.fullmatch(name) is None: raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        nonce = blob[end:end + NONCE_BYTES]
        body  = memoryview(blob)[end + NONCE_BYTES:]

        return self._decrypt_(name, ALGORITHMS[index], version, nonce, body, aad)

    def stale ( self, text: str ) -> bool:

        name, _, algorithm, version = Wire.read(text, self.limit)
        ring = self._ring

        return ring is None or name != ring.current or algorithm != self.algorithm or version != VERSION

    def rotate ( self, text: str, aad: bytes ) -> str:

        scope = self.scope()

        return scope.seal(scope.open(text, aad), aad)

    def _state_ ( self ) -> Ring:

        ring = self._ring

        if ring is None: raise Fault(Code.INTERNAL, reason="crypto.setup")

        return ring

    def _encrypt_ ( self, data: bytes | str, aad: bytes ) -> tuple[Binding, bytes, bytes]:

        ring    = self._state_()
        binding = ring.ciphers.get((ring.current, self.algorithm))

        if binding is None: raise Fault(Code.UNAVAILABLE, reason="crypto.algorithm")

        raw   = Wire.raw(data, self.limit)
        bound = Wire.raw(aad, self.limit)
        nonce = rand.bytes(NONCE_BYTES)
        body  = binding.cipher.encrypt(nonce, raw, binding.header + bound)

        return binding, nonce, body

    def _decrypt_ (
        self, name: str, algorithm: str, version: int, nonce: bytes, body: bytes | memoryview, aad: bytes,
    ) -> bytes:

        ring = self._ring

        if ring is None: raise Fault(Code.BAD_REQUEST, reason="crypto.unknown_key")

        binding = ring.ciphers.get((name, algorithm))

        if binding is None:

            if name not in ring.keys: raise Fault(Code.BAD_REQUEST, reason="crypto.unknown_key")

            raise Fault(Code.UNAVAILABLE, reason="crypto.algorithm")

        bound = Wire.raw(aad, self.limit)

        if version == VERSION: bound = binding.header + bound

        try: return binding.cipher.decrypt(nonce, body, bound)
        except InvalidTag as error: raise Fault(Code.BAD_REQUEST, reason="crypto.tampered") from error
