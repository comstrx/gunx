from collections.abc import Mapping, Sequence
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network, ip_address, ip_network
from typing import Any
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit

from engine.error import Code, Fault
from engine.cast import cast
from .codec import Codec
from .document import Document
from engine.string import string
from .arch import (
    BYTE, CONTROL, DELETE, DURATION, EMAIL, HEX, HOST_MAX, LABEL, LAT_MAX, LNG_MAX, MAC, MAX_FLOAT, MAX_INT, MAX_QUERY,
    MAX_TEXT, MAX_URL, NOISE, PAIR, PHONE, PORT_MAX, RGB, SEMVER, SHORT, SIZE, SIZES, SLUG, SPELLED, ULID, UNITS, UUID,
    QUOTED_PAIR,
)
from .email import Email
from .mime import Mime
from .url import Url
import csv, io, math

class Parse:

    def integer ( self, text: object, low: int | None = None, high: int | None = None ) -> int:

        if isinstance(text, str) and len(text) > MAX_INT: raise self._refuse_("integer", text)

        try: return cast.integer(text, low, high)
        except Fault as error: raise self._refuse_("integer", text) from error

    def number ( self, text: object, low: float | None = None, high: float | None = None ) -> float:

        if isinstance(text, str) and len(text) > MAX_FLOAT: raise self._refuse_("number", text)

        try: return cast.number(text, low, high)
        except Fault as error: raise self._refuse_("number", text) from error

    def auto ( self, text: object ) -> Any:

        return cast.auto(text)

    def boolean ( self, text: object ) -> bool:

        try: return cast.boolean(text)
        except Fault as error: raise self._refuse_("boolean", text) from error

    def duration ( self, text: object ) -> float:

        if isinstance(text, int | float) and not isinstance(text, bool): return self.number(text, low=0)

        raw = str(text).strip().lower()

        if len(raw) > MAX_FLOAT: raise self._refuse_("duration", text)

        plain = DURATION.fullmatch(raw)

        bad   = not raw or len(raw) > MAX_FLOAT or (plain is None and SPELLED.fullmatch(raw) is None)

        if bad: raise self._refuse_("duration", text)

        total = 0.0

        for amount, unit in DURATION.findall(raw):

            total += float(amount) * UNITS.get((unit or "s").lower(), 1.0)

        return total

    def size ( self, text: object ) -> int:

        if type(text) is int: return self.integer(text, low=0)

        raw = str(text)

        if len(raw) > MAX_FLOAT: raise self._refuse_("size", text)

        found = SIZE.fullmatch(raw)

        if found is None: raise self._refuse_("size", text)

        amount, unit = found.groups()
        factor = SIZES.get((unit or "b").lower())

        if factor is None: raise self._refuse_("size", text)

        try: numerator, denominator = cast.decimal(amount).as_integer_ratio()
        except Fault as error: raise self._refuse_("size", text) from error

        return numerator * factor // denominator

    def query ( self, text: str, limit: int = MAX_QUERY ) -> dict[str, list[str]]:

        if len(text) > MAX_TEXT: raise self._refuse_("query", "too long")

        found: dict[str, list[str]] = {}

        try: pairs = parse_qsl(text.lstrip("?"), keep_blank_values=True, max_num_fields=limit)
        except ValueError as error: raise self._refuse_("query", "too many fields") from error

        for key, value in pairs: found.setdefault(key, []).append(value)

        return found

    def url ( self, text: str, schemes: tuple[str, ...] = ("http", "https") ) -> Url:

        if type(text) is not str: raise self._refuse_("url", type(text).__name__)
        if len(text) > MAX_URL: raise self._refuse_("url", "too long")

        if any(ord(char) < CONTROL or ord(char) == DELETE for char in text):

            raise self._refuse_("url", text)

        try:

            parts = urlsplit(text.strip())
            host  = parts.hostname
            port  = parts.port

        except ValueError as error: raise self._refuse_("url", text) from error

        if parts.scheme.lower() not in schemes or not host: raise self._refuse_("url", text)

        if port == 0: raise self._refuse_("url", text)

        user, secret = parts.username, parts.password

        return Url(
            parts.scheme.lower(), self._host_(host, text), port, parts.path or "/", parts.query,
            unquote(user) if user else None, unquote(secret) if secret else None,
        )

    def quote ( self, text: object, safe: str = "" ) -> str:

        try: return quote(str(text), safe=safe)
        except UnicodeEncodeError as error: raise self._refuse_("text", text) from error

    def unquote ( self, text: str ) -> str:

        return unquote(text)

    def encode ( self, values: Mapping[str, object] | Sequence[tuple[str, object]] ) -> str:

        pairs = values.items() if isinstance(values, Mapping) else values

        return urlencode([(key, str(value)) for key, value in pairs if value is not None])

    def _host_ ( self, host: str, text: str ) -> str:

        try: return str(ip_address(host))
        except ValueError: pass

        try: return self.hostname(host)
        except Fault as error: raise self._refuse_("url", text) from error

    def loads ( self, text: str | bytes, kind: str = "json" ) -> Any:

        return Codec().load(text, kind)

    def dumps ( self, value: Any, kind: str = "json", pretty: bool = False ) -> str:

        return Codec().dump(value, kind, pretty)

    def document ( self, text: str | bytes, kind: str = "json", *, separator: str = "." ) -> Document:

        return Document(self.loads(text, kind), kind, separator)

    def of ( self, value: Any, kind: str = "json", *, separator: str = "." ) -> Document:

        return Document(value, kind, separator)

    def convert ( self, text: str | bytes, source: str, target: str, pretty: bool = False ) -> str:

        return self.dumps(self.loads(text, source), target, pretty)

    def toml ( self, text: str | bytes ) -> dict[str, Any]:

        value = self.loads(text, "toml")

        if not isinstance(value, dict): raise self._refuse_("toml", text)

        return value

    def yaml ( self, text: str | bytes ) -> Any:

        return self.loads(text, "yaml")

    def json ( self, text: str | bytes ) -> Any:

        return self.loads(text, "json")

    def semver ( self, text: str ) -> tuple[int, int, int, str | None, str | None]:

        raw = text.strip()

        if len(raw) > MAX_TEXT or not raw.isascii(): raise self._refuse_("semver", text)

        found = SEMVER.fullmatch(raw)

        if found is None: raise self._refuse_("semver", text)

        major, minor, patch, pre, build = found.groups()

        for part in (pre, build):

            if part is not None and any(not segment for segment in part.split(".")):

                raise self._refuse_("semver", text)

        if pre and any(piece.isdigit() and len(piece) > 1 and piece.startswith("0") for piece in pre.split(".")):

            raise self._refuse_("semver", text)

        return self.integer(major), self.integer(minor), self.integer(patch), pre, build

    def template (
        self, text: str, values: Mapping[str, object], strict: bool = True,
        *, delimiters: tuple[str, str] = ("{", "}"),
    ) -> str:

        try: return string.template(text, values, strict, delimiters=delimiters)
        except Fault as error: raise self._refuse_("template", text) from error

    def keys ( self, text: str, delimiters: tuple[str, str] = ("{", "}") ) -> tuple[str, ...]:

        return tuple(string.keys(text, delimiters))

    def email ( self, text: str ) -> Email:

        raw = text.strip()

        if not EMAIL.match(raw) or raw.endswith(".") or ".." in raw: raise self._refuse_("email", text)

        local, _, domain = raw.rpartition("@")

        return Email(local, domain.lower())

    def phone ( self, text: str, region: str | None = None ) -> str:

        raw = NOISE.sub("", string.digits(str(text)))

        if raw.startswith("00"): raw = "+" + raw[2:]

        if not raw.startswith("+") and region:

            raw = "+" + region.strip().lstrip("+") + raw.lstrip("0")

        if not PHONE.match(raw): raise self._refuse_("phone", text)

        return raw

    def uuid ( self, text: str ) -> str:

        raw = text.strip()

        if not UUID.match(raw): raise self._refuse_("uuid", text)

        plain = raw.replace("-", "").lower()

        return f"{plain[:8]}-{plain[8:12]}-{plain[12:16]}-{plain[16:20]}-{plain[20:]}"

    def ulid ( self, text: str ) -> str:

        raw = text.strip()

        if not ULID.match(raw): raise self._refuse_("ulid", text)

        return raw.upper()

    def slug ( self, text: str ) -> str:

        raw = text.strip()

        if not SLUG.match(raw): raise self._refuse_("slug", text)

        return raw

    def ip ( self, text: str ) -> IPv4Address | IPv6Address:

        try: return ip_address(text.strip())
        except ValueError as error: raise self._refuse_("ip", text) from error

    def cidr ( self, text: str ) -> IPv4Network | IPv6Network:

        try: return ip_network(text.strip(), strict=False)
        except ValueError as error: raise self._refuse_("cidr", text) from error

    def mac ( self, text: str ) -> str:

        found = MAC.match(text.strip())

        if found is None: raise self._refuse_("mac", text)

        return ":".join(part.lower() for part in found.groups())

    def hostname ( self, text: str ) -> str:

        raw = text.strip().rstrip(".").lower()

        try: encoded = raw.encode("idna").decode()
        except UnicodeError as error: raise self._refuse_("hostname", text) from error

        labels = encoded.split(".")

        if not raw or len(encoded) > HOST_MAX or not all(LABEL.match(label) for label in labels):

            raise self._refuse_("hostname", text)

        return encoded

    def port ( self, text: object ) -> int:

        try: value = int(str(text).strip())
        except ValueError as error: raise self._refuse_("port", text) from error

        if not 1 <= value <= PORT_MAX: raise self._refuse_("port", text)

        return value

    def color ( self, text: str ) -> tuple[int, int, int, int]:

        raw = text.strip()
        hexed = HEX.match(raw)

        if hexed:

            digits = hexed.group(1)

            if len(digits) <= SHORT: digits = "".join(ch * 2 for ch in digits)
            if len(digits) == SHORT * 2 - 2: digits += "ff"

            return (int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16), int(digits[6:8], 16))

        found = RGB.match(raw)

        if found is None: raise self._refuse_("color", text)

        red, green, blue = (int(found.group(index)) for index in (1, 2, 3))
        alpha = round(float(found.group(4)) * BYTE) if found.group(4) is not None else BYTE

        if max(red, green, blue, alpha) > BYTE: raise self._refuse_("color", text)

        return (red, green, blue, alpha)

    def coordinates ( self, text: str ) -> tuple[float, float]:

        parts = [part.strip() for part in string.digits(text).split(",")]

        if len(parts) != PAIR: raise self._refuse_("coordinates", text)

        try: lat, lng = float(parts[0]), float(parts[1])
        except ValueError as error: raise self._refuse_("coordinates", text) from error

        valid = math.isfinite(lat) and math.isfinite(lng) and abs(lat) <= LAT_MAX and abs(lng) <= LNG_MAX

        if not valid: raise self._refuse_("coordinates", text)

        return lat, lng

    def numbers ( self, text: str, limit: int = 10000 ) -> list[int]:

        found: set[int] = set()

        for piece in string.digits(text).split(","):

            part = piece.strip()

            if not part: continue

            start, dash, end = part.partition("-")

            if not start.isdigit() or (dash and not end.isdigit()): raise self._refuse_("numbers", text)

            low, high = int(start), int(end) if dash else int(start)

            if high < low or high - low >= limit or len(found) + high - low >= limit:

                raise self._refuse_("numbers", text)

            found.update(range(low, high + 1))

        return sorted(found)

    def pairs ( self, text: str, separator: str = ",", equals: str = "=" ) -> dict[str, str]:

        found: dict[str, str] = {}

        for piece in text.split(separator):

            part = piece.strip()

            if not part: continue

            key, mark, value = part.partition(equals)

            if not mark or not key.strip(): raise self._refuse_("pairs", text)

            found[key.strip()] = value.strip()

        return found

    def csv ( self, text: str, delimiter: str = "," ) -> list[str]:

        if len(text) > MAX_TEXT: raise self._refuse_("csv", text)

        try: return next(csv.reader(io.StringIO(text), delimiter=delimiter, strict=True), [])
        except (csv.Error, TypeError, ValueError) as error: raise self._refuse_("csv", text) from error

    def join ( self, base: str, relative: str ) -> str:

        return urljoin(base, relative)

    def _header_ ( self, text: str, separator: str ) -> list[str]:

        if len(text) > MAX_TEXT or any(char in text for char in ("\r", "\n", "\x00")):

            raise self._refuse_("header", text)

        parts: list[str] = []
        begin = 0
        quoted = escaped = False

        for index, char in enumerate(text):

            if escaped: escaped = False
            elif char == "\\" and quoted: escaped = True
            elif char == '"': quoted = not quoted
            elif char == separator and not quoted:

                parts.append(text[begin:index])
                begin = index + 1

        if quoted or escaped: raise self._refuse_("header", text)

        parts.append(text[begin:])

        return parts

    def mime ( self, text: str ) -> Mime:

        head, *rest = self._header_(text, ";")
        kind, slash, subtype = head.strip().lower().partition("/")

        if not slash or not kind or not subtype: raise self._refuse_("mime", text)

        params: dict[str, str] = {}

        for piece in rest:

            key, mark, value = piece.strip().partition("=")

            if mark and key:

                plain = value.strip()
                params[key.lower()] = QUOTED_PAIR.sub(r"\1", plain[1:-1]) if plain.startswith('"') else plain

        return Mime(kind, subtype, params)

    def accept ( self, text: str ) -> list[str]:

        ranked: list[tuple[float, int, str]] = []

        for index, piece in enumerate(self._header_(text, ",")):

            head, *rest = self._header_(piece, ";")
            name = head.strip().lower()

            if not name: continue

            weight = 1.0

            for param in rest:

                key, _, value = param.strip().partition("=")

                if key.strip().lower() == "q":

                    try: weight = float(value)
                    except ValueError: weight = 0.0

                    weight = max(0.0, min(1.0, weight)) if math.isfinite(weight) else 0.0

            if weight > 0: ranked.append((-weight, index, name))

        return [name for _, _, name in sorted(ranked)]

    def cookie ( self, text: str ) -> dict[str, str]:

        found: dict[str, str] = {}

        for piece in text.split(";"):

            key, mark, value = piece.strip().partition("=")

            if mark and key: found[key.strip()] = value.strip().removeprefix('"').removesuffix('"')

        return found

    def authorization ( self, text: str ) -> tuple[str, str]:

        scheme, _, credentials = text.strip().partition(" ")

        if not scheme or not credentials.strip(): raise self._refuse_("authorization", text)

        return scheme.lower(), credentials.strip()

    def bearer ( self, text: str ) -> str:

        scheme, token = self.authorization(text)

        if scheme != "bearer" or " " in token: raise self._refuse_("bearer", text)

        return token

    def basic ( self, text: str ) -> tuple[str, str]:

        scheme, credentials = self.authorization(text)

        if scheme != "basic": raise self._refuse_("basic", text)

        try: user, mark, secret = string.unbase64(credentials).decode().partition(":")
        except (Fault, UnicodeDecodeError) as error: raise self._refuse_("basic", text) from error

        if not mark: raise self._refuse_("basic", text)

        return user, secret

    def list ( self, text: object, separator: str = "," ) -> list[str]:

        items = cast.list(text if isinstance(text, list | tuple) else str(text), separator)

        return [value for item in items if (value := str(item).strip())]

    def _refuse_ ( self, kind: str, _text: object ) -> Fault:

        return Fault(Code.BAD_REQUEST, f"Cannot parse {kind}", f"parse.{kind}")
