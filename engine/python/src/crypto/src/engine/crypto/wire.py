from engine.error import Code, Fault
from engine.string import string
from .arch import ALGORITHMS, LIMIT, MAX_BYTES, NAME, NONCE_BYTES, TAG_BYTES, TEXT_START, VERSION
from .sealed import Sealed

class Wire:

    @staticmethod
    def raw ( data: bytes | str, limit: int = LIMIT ) -> bytes:

        if isinstance(data, bytes):

            if len(data) > limit: raise Fault(Code.BAD_REQUEST, reason="crypto.size")

            return data

        if not isinstance(data, str): raise Fault(Code.BAD_REQUEST, reason="crypto.data")
        if len(data) > limit: raise Fault(Code.BAD_REQUEST, reason="crypto.size")

        try: raw = data.encode()
        except UnicodeEncodeError as error: raise Fault(Code.BAD_REQUEST, reason="crypto.encoding") from error

        if len(raw) > limit: raise Fault(Code.BAD_REQUEST, reason="crypto.size")

        return raw

    @staticmethod
    def pack ( raw: bytes ) -> str:

        return string.base64(raw, url=True)

    @staticmethod
    def unpack ( text: str ) -> bytes | None:

        try: return string.unbase64(text, url=True, canonical=True)
        except Fault: return None

    @staticmethod
    def encode ( sealed: Sealed ) -> str:

        if NAME.fullmatch(sealed.key) is None or len(sealed.nonce) != NONCE_BYTES or len(sealed.body) < TAG_BYTES:
            raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        raw = Wire.pack(sealed.nonce + sealed.body)

        if sealed.version == 1 and sealed.algorithm == ALGORITHMS[0]: return f"v1.{sealed.key}.{raw}"
        if sealed.version != VERSION or sealed.algorithm not in ALGORITHMS:
            raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        return Wire.prefix(sealed.key, sealed.algorithm) + raw

    @staticmethod
    def decode ( text: str, limit: int = LIMIT ) -> Sealed:

        name, blob, algorithm, version = Wire.read(text, limit)

        return Sealed(name, blob[:NONCE_BYTES], blob[NONCE_BYTES:], algorithm, version)

    @staticmethod
    def read ( text: str, limit: int ) -> tuple[str, bytes, str, int]:

        if type(limit) is not int or not 1 <= limit <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="crypto.limit")

        ceiling = ((limit + NONCE_BYTES + TAG_BYTES + 2) // 3) * 4 + 72

        if type(text) is not str or len(text) > ceiling: raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        version = 1 if text.startswith("v1.") else 2 if text.startswith("v2.") else 0
        start   = 3 if version == 1 else 5
        valid   = len(text) >= TEXT_START and text[3] in "012" and text[4] == "."
        index   = 0 if version == 1 else int(text[3]) if valid else -1
        end     = text.rfind(".")
        name    = text[start:end]

        if not version or index < 0 or NAME.fullmatch(name) is None:
            raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        blob = Wire.unpack(text[end + 1:])

        if blob is None or not NONCE_BYTES + TAG_BYTES <= len(blob) <= limit + NONCE_BYTES + TAG_BYTES:
            raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        return name, blob, ALGORITHMS[index], version

    @staticmethod
    def header ( name: str, algorithm: str ) -> bytes:

        label = name.encode()

        return b"E2" + bytes((ALGORITHMS.index(algorithm), len(label))) + label

    @staticmethod
    def prefix ( name: str, algorithm: str ) -> str:

        return f"v2.{ALGORITHMS.index(algorithm)}.{name}."
