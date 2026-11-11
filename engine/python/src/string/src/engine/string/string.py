from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any, Literal, cast

from rapidfuzz import fuzz, process
from rapidfuzz.distance import Levenshtein
from engine.error import Code, Fault
from engine.func import func
from .arch import (
    ANSI, ARABIC, CAMEL, DIACRITICS, DIGITS, EASTERN, HTML, INVERSE, IRREGULAR, LATIN, MINOR, NUMBER, OTHERS, PLURALS,
    ROMAN, RTL, SENTENCE, SHORT, Side, SIMPLE, SINGULARS, SLUG, SPACES, SYMBOL, TAG, TOKEN, UNCOUNTABLE, URLSAFE, WIDE,
    WORD, WPM,
)
from .fluent import Fluent
import base64, binascii, difflib, fnmatch, html, re, textwrap, unicodedata

class String:

    def __init__ ( self ) -> None:

        self._find = func.pick("string.find", "stringzilla", self._native_find_, lambda: self._pure_find_)

    def of ( self, text: str ) -> Fluent:

        return Fluent(text, self)

    def blank ( self, text: str | None ) -> bool:

        return not text or not text.strip()

    def squish ( self, text: str ) -> str:

        return SPACES.sub(" ", text).strip()

    def trim ( self, text: str, chars: str | None = None, side: Side = "both" ) -> str:

        if side == "left": return text.lstrip(chars)
        if side == "right": return text.rstrip(chars)

        return text.strip(chars)

    def truncate ( self, text: str, limit: int, ellipsis: str = "…" ) -> str:

        if len(text) <= limit: return text
        if limit <= len(ellipsis): return ellipsis[:max(0, limit)]

        return text[:limit - len(ellipsis)].rstrip() + ellipsis

    def shorten ( self, text: str, words: int, ellipsis: str = "…" ) -> str:

        parts = text.split()

        if len(parts) <= words: return text

        return " ".join(parts[:max(0, words)]) + ellipsis

    def excerpt ( self, text: str, phrase: str, radius: int = 100, omission: str = "…" ) -> str | None:

        at = self.position(text, phrase, insensitive=True)

        if at < 0: return None

        reach = max(0, radius)
        start = max(0, at - reach)
        end   = min(len(text), at + len(phrase) + reach)
        body  = text[start:end].strip()

        return (omission if start > 0 else "") + body + (omission if end < len(text) else "")

    def find ( self, haystack: bytes | str, needle: bytes | str, start: int = 0 ) -> int:

        if isinstance(haystack, str):

            if isinstance(needle, str): return haystack.find(needle, start)

            haystack = self._bytes_(haystack)

        return cast("int", self._find(haystack, self._bytes_(needle), start))

    def contains ( self, haystack: bytes | str, needle: bytes | str ) -> bool:

        return self.find(haystack, needle) >= 0

    def position ( self, text: str, needle: str, offset: int = 0, insensitive: bool = False ) -> int:

        if not insensitive: return text.find(needle, offset)

        size  = len(text)
        start = offset if offset >= 0 else max(0, size + offset)

        if start > size: return -1

        found = re.compile(re.escape(needle), re.IGNORECASE).search(text, start)

        return -1 if found is None else found.start()

    def count ( self, text: str, part: str ) -> int:

        return text.count(part) if part else 0

    def has_any ( self, text: str, *parts: str, insensitive: bool = False ) -> bool:

        body = text.casefold() if insensitive else text

        return any((part.casefold() if insensitive else part) in body for part in parts if part)

    def has_all ( self, text: str, *parts: str, insensitive: bool = False ) -> bool:

        body = text.casefold() if insensitive else text

        return bool(parts) and all((part.casefold() if insensitive else part) in body for part in parts)

    def starts ( self, text: str, *prefixes: str ) -> bool:

        return any(text.startswith(prefix) for prefix in prefixes if prefix)

    def ends ( self, text: str, *suffixes: str ) -> bool:

        return any(text.endswith(suffix) for suffix in suffixes if suffix)

    def like ( self, text: str, pattern: str ) -> bool:

        if "*" not in pattern: return text == pattern

        head, *inner, tail = pattern.split("*")
        at, end            = len(head), len(text) - len(tail)

        if at > end or not text.startswith(head) or not text.endswith(tail): return False

        for piece in inner:

            at = text.find(piece, at, end)

            if at < 0: return False

            at += len(piece)

        return True

    def same ( self, left: str, right: str ) -> bool:

        return self.fold(left) == self.fold(right)

    def before ( self, text: str, part: str ) -> str:

        at = text.find(part)

        return text if at < 0 else text[:at]

    def before_last ( self, text: str, part: str ) -> str:

        at = text.rfind(part)

        return text if at < 0 else text[:at]

    def after ( self, text: str, part: str ) -> str:

        at = text.find(part)

        return "" if at < 0 else text[at + len(part):]

    def after_last ( self, text: str, part: str ) -> str:

        at = text.rfind(part)

        return "" if at < 0 else text[at + len(part):]

    def between ( self, text: str, open_: str, close: str ) -> str:

        return self.before(self.after(text, open_), close)

    def take ( self, text: str, count: int ) -> str:

        return text[:count] if count >= 0 else text[count:]

    def substr ( self, text: str, start: int, length: int | None = None ) -> str:

        return text[start:] if length is None else text[start:start + length]

    def chunk ( self, text: str, size: int ) -> list[str]:

        if size < 1: raise Fault(Code.INTERNAL, reason="string.chunk")

        return [text[at:at + size] for at in range(0, len(text), size)]

    def lines ( self, text: str, keep_blank: bool = False ) -> list[str]:

        found = text.splitlines()

        return found if keep_blank else [line for line in found if line.strip()]

    def sentences ( self, text: str ) -> list[str]:

        return [piece for piece in SENTENCE.split(text.strip()) if piece]

    def words ( self, text: str ) -> list[str]:

        return WORD.findall(text)

    def word_count ( self, text: str ) -> int:

        return len(TOKEN.findall(text))

    def char_count ( self, text: str, spaces: bool = False ) -> int:

        return len(text) if spaces else len(SPACES.sub("", text))

    def read_time ( self, text: str, wpm: int = WPM ) -> float:

        return round(self.word_count(text) / max(1, wpm), 2)

    def numbers ( self, text: str ) -> list[str]:

        return NUMBER.findall(self.digits(text))

    def numeric ( self, text: str ) -> str:

        return OTHERS.sub("", self.digits(text))

    def replace_first ( self, text: str, old: str, new: str ) -> str:

        return text.replace(old, new, 1) if old else text

    def replace_last ( self, text: str, old: str, new: str ) -> str:

        at = text.rfind(old) if old else -1

        return text if at < 0 else text[:at] + new + text[at + len(old):]

    def replace_many ( self, text: str, changes: Mapping[str, str] ) -> str:

        olds = sorted((old for old in changes if old), key=len, reverse=True)

        if not olds: return text

        parts       = re.split(f"({'|'.join(map(re.escape, olds))})", text)
        parts[1::2] = [changes[part] for part in parts[1::2]]

        return "".join(parts)

    def replace_start ( self, text: str, old: str, new: str ) -> str:

        return new + text[len(old):] if old and text.startswith(old) else text

    def replace_end ( self, text: str, old: str, new: str ) -> str:

        return text[:-len(old)] + new if old and text.endswith(old) else text

    def remove ( self, text: str, *parts: str, insensitive: bool = False ) -> str:

        for part in parts:

            if not part: continue

            text = re.sub(re.escape(part), "", text, flags=re.IGNORECASE) if insensitive else text.replace(part, "")

        return text

    def start ( self, text: str, prefix: str ) -> str:

        return text if text.startswith(prefix) else prefix + text

    def finish ( self, text: str, suffix: str ) -> str:

        return text if text.endswith(suffix) else text + suffix

    def wrap ( self, text: str, before: str, after: str | None = None ) -> str:

        return f"{before}{text}{before if after is None else after}"

    def unwrap ( self, text: str, before: str, after: str | None = None ) -> str:

        return self.chop_end(self.chop_start(text, before), before if after is None else after)

    def chop_start ( self, text: str, *prefixes: str ) -> str:

        for prefix in prefixes:

            if prefix and text.startswith(prefix): return text[len(prefix):]

        return text

    def chop_end ( self, text: str, *suffixes: str ) -> str:

        for suffix in suffixes:

            if suffix and text.endswith(suffix): return text[:-len(suffix)]

        return text

    def pad ( self, text: str, width: int, char: str = " ", side: Side = "both" ) -> str:

        room = self._width_(max(0, width), 0) - len(text)

        if room <= 0 or not char: return text

        left = room if side == "left" else 0 if side == "right" else room // 2 + (room & width & 1)

        return self._run_(char, left) + text + self._run_(char, room - left)

    def fill ( self, text: str, width: int = 80 ) -> str:

        return textwrap.fill(text, self._width_(width, 1))

    def indent ( self, text: str, prefix: str = "    " ) -> str:

        return textwrap.indent(text, prefix)

    def dedent ( self, text: str ) -> str:

        return textwrap.dedent(text)

    def ucfirst ( self, text: str ) -> str:

        return text[:1].upper() + text[1:]

    def lcfirst ( self, text: str ) -> str:

        return text[:1].lower() + text[1:]

    def fold ( self, text: str ) -> str:

        if text.isascii(): return text.casefold()

        return DIACRITICS.sub("", self._strip_marks_(text)).casefold()

    def normalize ( self, text: str, form: Literal["NFC", "NFD", "NFKC", "NFKD"] = "NFC" ) -> str:

        return unicodedata.normalize(form, text)

    def slug ( self, text: str, separator: str = "-", limit: int = 96 ) -> str:

        folded = text.casefold() if text.isascii() else self.fold(self.digits(text))
        pieces = [piece for piece in SLUG.split(folded) if piece]
        joined = separator.join(pieces)

        if len(joined) <= limit: return joined

        kept = ""

        for piece in pieces:

            room = limit - len(kept) - (len(separator) if kept else 0)

            if room <= 0: break

            kept += (separator if kept else "") + piece[:room]

        return kept

    def ascii ( self, text: str ) -> str:

        return self.transliterate(text).encode("ascii", "ignore").decode()

    def transliterate ( self, text: str ) -> str:

        if text.isascii(): return text

        plain = DIACRITICS.sub("", text).translate(DIGITS).translate(ROMAN)

        return self._strip_marks_(plain).translate(LATIN)

    def digits ( self, text: str ) -> str:

        plain = text.translate(DIGITS)

        if plain.isascii(): return plain

        marks = (str(unicodedata.decimal(mark)) if not mark.isascii() and mark.isdecimal() else mark for mark in plain)

        return "".join(marks)

    def glob ( self, text: str, pattern: str ) -> bool:

        return fnmatch.fnmatchcase(text, pattern)

    def width ( self, text: str ) -> int:

        if text.isascii(): return len(text)

        wide = sum(unicodedata.east_asian_width(mark) in "WF" for mark in text)
        void = sum(unicodedata.category(mark) in ("Mn", "Me") for mark in text)

        return len(text) + wide - void

    def eastern ( self, text: str ) -> str:

        return text.translate(EASTERN)

    def arabic ( self, text: str ) -> bool:

        return bool(ARABIC.search(text))

    def simplify ( self, text: str ) -> str:

        return DIACRITICS.sub("", text).translate(SIMPLE)

    def direction ( self, text: str ) -> str:

        return "rtl" if RTL.match(text) else "ltr"

    def snake ( self, text: str ) -> str:

        return "_".join(self.words(CAMEL.sub(" ", text))).lower()

    def kebab ( self, text: str ) -> str:

        return "-".join(self.words(CAMEL.sub(" ", text))).lower()

    def camel ( self, text: str ) -> str:

        parts = self.words(CAMEL.sub(" ", text))

        return "".join(part.lower() if index == 0 else part.capitalize() for index, part in enumerate(parts))

    def pascal ( self, text: str ) -> str:

        return "".join(part.capitalize() for part in self.words(CAMEL.sub(" ", text)))

    def title ( self, text: str ) -> str:

        return " ".join(part.capitalize() for part in self.words(CAMEL.sub(" ", text)))

    def apa ( self, text: str ) -> str:

        words = text.split()
        last  = len(words) - 1

        def cased ( index: int, word: str ) -> str:

            minor = word.lower() in MINOR and len(word) <= SHORT and index not in (0, last)

            return word.lower() if minor else word[:1].upper() + word[1:]

        return " ".join(cased(index, word) for index, word in enumerate(words))

    def between_first ( self, text: str, start: str, end: str ) -> str:

        if not start or not end: return text

        head = text.find(start)

        if head < 0: return text

        tail = text.find(end, head + len(start))

        return text if tail < 0 else text[head + len(start):tail]

    def char_at ( self, text: str, index: int ) -> str | None:

        try: return text[index]
        except IndexError: return None

    def lacks ( self, text: str, needles: str | Iterable[str] ) -> bool:

        parts = [needles] if isinstance(needles, str) else list(needles)

        return not any(part and part in text for part in parts)

    def dedupe ( self, text: str, char: str = " " ) -> str:

        if not char: return text

        return re.sub(f"(?:{re.escape(char)}){{2,}}", char.replace("\\", "\\\\"), text)

    def match ( self, text: str, pattern: str ) -> str | None:

        found = self._pattern_(pattern).search(text)

        if found is None: return None

        return found.group(1) if found.groups() else found.group(0)

    def matches ( self, text: str, pattern: str ) -> list[str]:

        found = self._pattern_(pattern).finditer(text)

        return [item.group(1) if item.groups() else item.group(0) for item in found]

    def test ( self, text: str, pattern: str ) -> bool:

        return self._pattern_(pattern).search(text) is not None

    def replace_array ( self, text: str, search: str, replacements: Sequence[str] ) -> str:

        if not search or not replacements: return text

        pieces = text.split(search, len(replacements))
        fills  = [*replacements[:len(pieces) - 1], ""]

        return "".join(f"{piece}{fill}" for piece, fill in zip(pieces, fills, strict=True))

    def replace_matches (
        self, text: str, pattern: str, replacement: str | Callable[[re.Match[str]], str], limit: int = 0,
    ) -> str:

        found = self._pattern_(pattern)

        if callable(replacement): return found.sub(replacement, text, count=max(0, limit))

        try: return found.sub(replacement, text, count=max(0, limit))
        except (re.PatternError, IndexError) as error: raise Fault(Code.INTERNAL, reason="string.pattern") from error

    def reverse ( self, text: str ) -> str:

        clusters: list[str] = []

        for char in text:

            if clusters and unicodedata.combining(char): clusters[-1] += char
            else: clusters.append(char)

        return "".join(reversed(clusters))

    def splice ( self, text: str, replacement: str, start: int, length: int | None = None ) -> str:

        end = len(text) if length is None else start + length if length >= 0 else len(text) + length

        return text[:start] + replacement + text[end:]

    def ucsplit ( self, text: str ) -> list[str]:

        return [part for part in CAMEL.split(text) if part]

    def word_wrap ( self, text: str, width: int = 75, newline: str = "\n", cut: bool = False ) -> str:

        lines = textwrap.wrap(text, self._width_(width, 1), break_long_words=cut, break_on_hyphens=False)

        return newline.join(lines)

    def match_case ( self, text: str, like: str ) -> str:

        if like.isupper(): return text.upper()
        if like.islower(): return text.lower()
        if like.istitle(): return text.title()

        return text

    def strip_ansi ( self, text: str ) -> str:

        return ANSI.sub("", text)

    def strip_symbols ( self, text: str ) -> str:

        return SYMBOL.sub("", text)

    def diff ( self, before: str, after: str, context: int = 3, left: str = "before", right: str = "after" ) -> str:

        lines = difflib.unified_diff(before.splitlines(), after.splitlines(), left, right, n=context, lineterm="")

        return "\n".join(lines)

    def keep ( self, text: str, extra: str = "", fill: str = "" ) -> str:

        return "".join(char if char.isalnum() or char in extra else fill for char in text)

    def plural ( self, word: str, count: int = 2 ) -> str:

        bare = word.strip()

        if not bare or count == 1: return bare

        lower = bare.lower()

        if lower in UNCOUNTABLE or lower in INVERSE: return bare
        if lower in IRREGULAR: return self._match_case_(bare, IRREGULAR[lower])

        return self._apply_(bare, PLURALS)

    def singular ( self, word: str ) -> str:

        bare  = word.strip()
        lower = bare.lower()

        if not bare or lower in UNCOUNTABLE or lower in IRREGULAR: return bare
        if lower in INVERSE: return self._match_case_(bare, INVERSE[lower])

        return self._apply_(bare, SINGULARS)

    def mask ( self, text: str, keep: int = 2, char: str = "*" ) -> str:

        size = len(text)
        kept = max(0, keep)

        if size <= kept * 2: return char * size

        return text[:kept] + char * (size - kept * 2) + text[size - kept:]

    def escape ( self, text: str ) -> str:

        for raw, safe in HTML: text = text.replace(raw, safe)

        return text

    def unescape ( self, text: str ) -> str:

        return html.unescape(text)

    def plain ( self, text: str ) -> str:

        return self.squish(html.unescape(self._untag_(text)))

    def highlight ( self, text: str, needle: str, open_: str = "<mark>", close: str = "</mark>" ) -> str:

        if not needle: return text

        return re.sub(re.escape(needle), lambda found: f"{open_}{found.group(0)}{close}", text, flags=re.IGNORECASE)

    def initials ( self, text: str, limit: int = 2 ) -> str:

        return "".join(word[0] for word in text.split()[:limit]).upper()

    def base64 ( self, text: str | bytes, url: bool = False ) -> str:

        raw = self._bytes_(text)

        return (base64.urlsafe_b64encode(raw).rstrip(b"=") if url else base64.b64encode(raw)).decode()

    def unbase64 ( self, text: str ) -> bytes:

        safe  = "-" in text or "_" in text
        plain = text.translate(URLSAFE) if safe else text

        if safe and ("+" in text or "/" in text): raise self._refuse_("base64")

        try: return base64.b64decode(plain + "=" * (-len(plain) % 4), validate=True)
        except (binascii.Error, ValueError) as error: raise self._refuse_("base64") from error

    def ratio ( self, left: str, right: str ) -> float:

        return float(fuzz.ratio(self.fold(left), self.fold(right))) / 100.0

    def distance ( self, left: str, right: str ) -> int:

        return int(Levenshtein.distance(left, right))

    def closest ( self, needle: str, choices: Sequence[str], floor: float = 0.6 ) -> str | None:

        if not choices: return None

        found = process.extractOne(self.fold(needle), [self.fold(choice) for choice in choices], scorer=fuzz.WRatio)

        if found[1] / 100.0 < floor: return None

        return choices[found[2]]

    def rank ( self, needle: str, choices: Iterable[str], limit: int = 5 ) -> list[tuple[str, float]]:

        if limit < 1: return []

        items  = list(choices)
        folded = [self.fold(item) for item in items]
        scored = process.extract(self.fold(needle), folded, scorer=fuzz.WRatio, limit=limit)

        return [(items[index], score / 100.0) for _, score, index in scored]

    def _native_find_ ( self ) -> Any:

        from stringzilla import Str

        def find ( haystack: bytes, needle: bytes, start: int ) -> int:

            return cast("int", Str(haystack).find(needle, start))

        return find

    @staticmethod
    def _pure_find_ ( haystack: bytes, needle: bytes, start: int ) -> int:

        return haystack.find(needle, start)

    def _match_case_ ( self, sample: str, text: str ) -> str:

        if sample.isupper(): return text.upper()
        if sample[:1].isupper(): return text[:1].upper() + text[1:]

        return text

    def _apply_ ( self, word: str, rules: tuple[tuple[re.Pattern[str], str], ...] ) -> str:

        for pattern, result in rules:

            if pattern.search(word): return pattern.sub(result, word, count=1)

        return word

    def _strip_marks_ ( self, text: str ) -> str:

        decomposed = unicodedata.normalize("NFKD", text)

        return "".join(ch for ch in decomposed if not unicodedata.combining(ch))

    def _untag_ ( self, text: str ) -> str:

        last = text.rfind(">") + 1

        return TAG.sub(" ", text[:last]) + text[last:]

    def _run_ ( self, char: str, size: int ) -> str:

        return (char * (size // len(char) + 1))[:size]

    def _width_ ( self, width: int, least: int ) -> int:

        if least <= width <= WIDE: return width

        raise Fault(Code.INTERNAL, reason="string.width")

    def _pattern_ ( self, pattern: str ) -> re.Pattern[str]:

        try: return re.compile(pattern)
        except (re.PatternError, RecursionError, OverflowError) as error:

            raise Fault(Code.INTERNAL, reason="string.pattern") from error

    def _bytes_ ( self, text: str | bytes ) -> bytes:

        if isinstance(text, bytes): return text

        try: return text.encode()
        except UnicodeEncodeError as error: raise self._refuse_("encoding") from error

    def _refuse_ ( self, reason: str ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Cannot read the text", f"string.{reason}", { "text": ["is not readable"] })
