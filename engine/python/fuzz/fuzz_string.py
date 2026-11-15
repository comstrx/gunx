from engine.error import Fault
from engine.string import String, string
from engine.func import func
from rapidfuzz import fuzz
from collections.abc import Callable
from collections import Counter
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any, Literal
import base64, html, re, unicodedata, warnings

EXAMPLES = 1000
WIDE     = 1 << 20
ALPHABET = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/-_=")
SPECIALS = "<>\"'"
SIDES    = ("both", "left", "right")
VERBS    = (
    "blank", "squish", "trim", "fold", "slug", "ascii", "transliterate", "digits", "eastern", "arabic", "simplify",
    "direction", "snake", "kebab", "camel", "pascal", "title", "apa", "words", "word_count", "char_count", "sentences",
    "numbers", "numeric", "lines", "reverse", "ucsplit", "strip_ansi", "strip_symbols", "plural", "singular", "escape",
    "unescape", "plain", "initials", "ucfirst", "lcfirst", "dedupe", "normalize", "dedent", "read_time", "of",
)
ODD      = st.sampled_from(["\ud800", "a\udfffb", "\x00", "ß" * 9, "مَرْحَبًا، ٢٠٢٤", "<" * 99, "\x1b[" * 40, "é" * 20, " " * 60, "İi", "ǅ"])
WILD     = st.one_of(st.text(max_size=40), ODD, st.builds("".join, st.lists(st.one_of(st.text(max_size=6), ODD), max_size=4)))
TINY     = st.text("ab*.", max_size=10)
MARKUP   = st.text("<>ab &;lt", max_size=24)
CODED    = st.text("aGk=+/-_ \n!é", max_size=12)
SIZES    = st.one_of(st.integers(-4, 48), st.sampled_from([-(10 ** 30), 10 ** 30, WIDE, WIDE + 1]))
SWAPS    = st.dictionaries(st.text("ab", max_size=3), st.text("abc\\1", max_size=3), max_size=4)
PIECE    = re.compile(r"[a-z0-9\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF]+")
SMALL    = st.text("ab ", max_size=12)
PARTS    = st.text("ab ", max_size=2)
PATTERNS = st.one_of(st.text("ab()[]*+?|\\.^$1{},", max_size=8), st.sampled_from(["(a)(b)?", "a|", "(?P<x>a)", "\\d+"]))

warnings.simplefilter("ignore", FutureWarning)

def tried [T] ( work: Callable[[], T] ) -> T | Fault:

    try: return work()
    except Fault as fault: return fault

def swapped ( text: str, changes: dict[str, str] ) -> str:

    olds  = sorted((old for old in changes if old), key=len, reverse=True)
    built = ""
    at    = 0

    while at < len(text):

        found = next((old for old in olds if text.startswith(old, at)), None)
        built += text[at] if found is None else changes[found]
        at    += 1 if found is None else len(found)

    return built

def filled ( text: str, search: str, fills: list[str] ) -> str:

    if not search or not fills: return text

    head, *rest = text.split(search)

    return head + "".join((fills[index] if index < len(fills) else search) + piece for index, piece in enumerate(rest))

def seated ( text: str, needle: str, offset: int ) -> int:

    start = offset if offset >= 0 else max(0, len(text) + offset)
    exact = re.compile(re.escape(needle), re.IGNORECASE)

    return next((at for at in range(start, len(text) + 1) if exact.fullmatch(text, at, at + len(needle))), -1)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD)
def no_verb_leaks_a_raw_error ( text: str ) -> None:

    for name in VERBS:

        found = tried(partial(getattr(string, name), text))

        assert not isinstance(found, Fault), name

    assert string.fold(string.fold(text)) == string.fold(text)
    assert string.slug(string.slug(text)) == string.slug(text)
    assert string.squish(string.squish(text)) == string.squish(text)
    assert "".join(string.words(text)) == "".join(string.words(" ".join(string.words(text))))
    assert Counter(string.reverse(text)) == Counter(text)
    assert string.diff(text, text) == ""
    assert string.keep(text).isalnum() or not string.keep(text)
    assert string.highlight(text, text[:3], "", "") == text

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD, SIZES, st.sampled_from(["…", "...", "", "ab"]))
def cuts_stay_inside_their_size ( text: str, size: int, tail: str ) -> None:

    cut   = string.truncate(text, size, tail)
    parts = tried(partial(string.chunk, text, size))
    short = string.shorten(text, size, tail)

    assert cut == text if len(text) <= size else len(cut) <= max(0, size)
    assert short == text or len(short.split()) <= max(0, size) + 1
    assert string.take(text, size) == (text[:size] if size >= 0 else text[size:])
    assert string.char_at(text, size) == (text[size] if -len(text) <= size < len(text) else None)

    if isinstance(parts, Fault):

        assert size < 1
        assert parts.reason == "string.chunk"

        return

    assert size >= 1
    assert "".join(parts) == text
    assert all(0 < len(part) <= size for part in parts)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text("xyz", max_size=24), st.integers(-6, 16), st.sampled_from(["*", "#", "", "••"]))
def a_mask_shows_only_what_it_keeps ( text: str, keep: int, char: str ) -> None:

    made = string.mask(text, keep, char)
    kept = max(0, keep)

    if len(text) <= kept * 2:

        assert made == char * len(text)

        return

    assert made == text[:kept] + char * (len(text) - kept * 2) + text[len(text) - kept:]
    assert sum(1 for letter in made if letter in "xyz") == kept * 2

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD, SIZES, st.sampled_from([" ", "0", "ab", "", "é́"]), st.sampled_from(SIDES))
def a_pad_reaches_its_width ( text: str, width: int, char: str, side: Any ) -> None:

    made = tried(partial(string.pad, text, width, char, side))

    if isinstance(made, Fault):

        assert width > WIDE
        assert made.reason == "string.width"

        return

    assert width <= WIDE
    assert len(made) == (max(len(text), width) if char else len(text))
    assert text in made

    if side == "left": assert made.endswith(text)
    if side == "right": assert made.startswith(text)
    if len(char) == 1: assert made == { "both": text.center, "left": text.rjust, "right": text.ljust }[side](max(0, width), char)

    for wrap in (string.fill, string.word_wrap):

        lines = tried(partial(wrap, text, width))

        assert isinstance(lines, Fault) is not (1 <= width <= WIDE)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(TINY, TINY)
def a_glob_matches_like_the_regex ( text: str, pattern: str ) -> None:

    model = ".*".join(re.escape(piece) for piece in pattern.split("*"))

    assert string.like(text, pattern) is (re.fullmatch(model, text, re.DOTALL) is not None)
    assert string.like(text, text) or "*" in text
    assert string.like(text, "*")
    assert string.like(text, f"{text}*")
    assert string.like(text, f"*{text}")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD, st.sampled_from(["-", "_", "--", "", "\\1", "\\n"]), SIZES)
def a_slug_is_clean_and_bounded ( text: str, separator: str, limit: int ) -> None:

    made  = string.slug(text, separator, limit)
    whole = string.slug(text, separator, 10 ** 6)

    assert len(made) <= max(0, limit)
    assert whole.startswith(made)
    assert re.fullmatch(r"[a-z0-9ؐ-ؚؠ-٩ٮ-ۓە-ۜ۟-۪ۨ-ۼۿ\\1n_-]*", made)

    if separator in ("-", "_", "--"):

        assert not made.endswith(separator[:1])
        assert not whole or all(PIECE.fullmatch(piece) for piece in whole.split(separator))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=24), st.binary(max_size=3), st.integers(-30, 30), st.text("abé", max_size=12), st.text("abé", max_size=2))
def a_search_agrees_with_the_plain_one ( haystack: bytes, needle: bytes, start: int, text: str, part: str ) -> None:

    assert string.find(haystack, needle, start) == haystack.find(needle, start)
    assert string.find(text, part, start) == text.find(part, start)
    assert string.find(text, part.encode(), start) == text.encode().find(part.encode(), start)
    assert string.contains(text, part) is (part in text)
    assert string.position(text, part, start) == text.find(part, start)
    assert string.position(text, part.upper(), start, insensitive=True) == seated(text, part.upper(), start)
    assert string.count(text, part) == (text.count(part) if part else 0)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=32), CODED)
def base64_round_trips_and_junk_is_refused ( raw: bytes, text: str ) -> None:

    assert string.unbase64(string.base64(raw)) == raw
    assert string.unbase64(string.base64(raw, url=True)) == raw
    assert string.base64(raw) == base64.b64encode(raw).decode()

    found = tried(partial(string.unbase64, text))
    mixed = bool(set(text) & set("-_")) and bool(set(text) & set("+/"))

    if isinstance(found, Fault):

        assert found.reason == "string.base64"
        assert found.errors == { "text": ["is not readable"] }

        return

    assert set(text) <= ALPHABET
    assert not mixed
    assert found == base64.b64decode(text.replace("-", "+").replace("_", "/") + "=" * (-len(text) % 4))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD, MARKUP)
def markup_is_escaped_and_stripped ( text: str, markup: str ) -> None:

    safe = string.escape(text)

    assert not any(mark in safe for mark in SPECIALS)
    assert html.unescape(safe) == text
    assert string.escape(markup) == html.escape(markup).replace("&#x27;", "&#39;")
    assert string.plain(markup) == " ".join(html.unescape(re.sub("<[^>]*>", " ", markup)).split())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text("abc", max_size=14), SWAPS, st.text("ab", max_size=2), st.lists(st.text("ab?\\", max_size=2), max_size=4))
def replacing_is_one_pass ( text: str, changes: dict[str, str], search: str, fills: list[str] ) -> None:

    assert string.replace_many(text, changes) == swapped(text, changes)
    assert string.replace_array(text, search, fills) == filled(text, search, fills)
    assert string.dedupe(text, "a") == re.sub("a+", "a", text)
    assert string.dedupe(text, "") == text
    assert string.remove(text, search) == (text.replace(search, "") if search else text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text("ab1", max_size=10), PATTERNS, st.sampled_from(["#", "\\1", "\\9", "\\g<x>", ""]), st.integers(-2, 3))
def a_pattern_is_read_or_refused ( text: str, pattern: str, fill: str, limit: int ) -> None:

    for work in (
        partial(string.match, text, pattern), partial(string.matches, text, pattern), partial(string.test, text, pattern),
        partial(string.replace_matches, text, pattern, fill, limit),
    ):

        found = tried(work)

        assert not isinstance(found, Fault) or found.reason == "string.pattern"

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SMALL, PARTS, PARTS, st.integers(-3, 6))
def cut_pieces_rejoin ( text: str, part: str, other: str, size: int ) -> None:

    held = part in text
    cut  = string.excerpt(text, part.upper(), size, "~")

    assert string.before(text, part) + part + string.after(text, part) == (text if held else text + part)
    assert string.before_last(text, part) + part + string.after_last(text, part) == (text if held else text + part)
    assert string.unwrap(string.wrap(text, part, other), part, other) == text
    assert string.unwrap(string.wrap(text, part), part) == text
    assert string.start(string.start(text, part), part) == string.start(text, part)
    assert string.finish(string.finish(text, part), part) == string.finish(text, part)
    assert string.chop_start(part + text, part) == text
    assert string.chop_end(text + part, part) == text
    assert string.replace_first(text, part, other) == (text.replace(part, other, 1) if part else text)
    assert string.replace_last(text, part, other)[::-1] == (text[::-1].replace(part[::-1], other[::-1], 1) if part else text[::-1])
    assert string.replace_start(part + text, part, other) == (other + text if part else text)
    assert string.replace_end(text + part, part, other) == (text + other if part else text)
    assert string.lacks(text, [part, other]) is not ((bool(part) and held) or (bool(other) and other in text))
    assert (cut is None) is (part.lower() not in text.lower())
    assert cut is None or len(cut) <= len(part) + max(0, size) * 2 + 2

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD, WILD, st.lists(WILD, max_size=5), st.integers(-2, 7))
def likeness_is_bounded ( left: str, right: str, choices: list[str], limit: int ) -> None:

    ranked = string.rank(left, choices, limit)
    found  = string.closest(left, choices)

    assert 0.0 <= string.ratio(left, right) <= 1.0
    assert string.ratio(left, left) == 1.0
    assert string.same(left, right) is (string.fold(left) == string.fold(right))
    assert string.distance(left, left) == 0
    assert string.distance(left, right) == string.distance(right, left) <= max(len(left), len(right))
    assert len(ranked) == min(max(0, limit), len(choices))
    assert all(item in choices and 0.0 <= score <= 1.0 for item, score in ranked)
    assert [score for _, score in ranked] == sorted((score for _, score in ranked), reverse=True)
    assert found is None or found in choices

    scores = [(choice, float(fuzz.WRatio(string.fold(left), string.fold(choice))) / 100.0) for choice in choices]
    scores.sort(key=lambda row: row[1], reverse=True)

    assert ranked == scores[:max(0, limit)]
    assert found == (scores[0][0] if scores and scores[0][1] >= 0.6 else None)


previous = func.mode()

try:

    func.setup("pure")

    pure = String()

    func.setup("native")

    native = String()

finally: func.setup(previous)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.binary(max_size=16384), st.binary(max_size=128), SIZES)
def search_providers_agree_on_binary_data ( data: bytes, needle: bytes, start: int ) -> None:

    expected = data.find(needle, start)

    assert pure.find(data, needle, start) == expected
    assert native.find(data, needle, start) == expected

search_providers_agree_on_binary_data()

no_verb_leaks_a_raw_error()
cuts_stay_inside_their_size()
a_mask_shows_only_what_it_keeps()
a_pad_reaches_its_width()
a_glob_matches_like_the_regex()
a_slug_is_clean_and_bounded()
a_search_agrees_with_the_plain_one()
base64_round_trips_and_junk_is_refused()
markup_is_escaped_and_stripped()
replacing_is_one_pass()
a_pattern_is_read_or_refused()
cut_pieces_rejoin()
likeness_is_bounded()



@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, st.text(max_size=5), st.text(max_size=5))
def between_matches_nested_delimiter_operations ( text: str, opening: str, closing: str ) -> None:

    assert string.between(text, opening, closing) == string.before(string.after(text, opening), closing)

between_matches_nested_delimiter_operations()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, WILD, SIZES, st.one_of(st.none(), SIZES))
def ranges_select_characters_without_duplication (
    text: str, replacement: str, start: int, length: int | None,
) -> None:

    chars = list(text)
    rest  = chars[start:]
    head  = chars[:len(chars) - len(rest)]

    if length is None: picked = rest
    elif length >= 0: picked = rest[:length]
    else: picked = [char for index, char in enumerate(chars) if len(head) <= index < len(chars) + length]

    tail = rest[len(picked):]

    assert string.substr(text, start, length) == "".join(picked)
    assert string.splice(text, replacement, start, length) == "".join([*head, replacement, *tail])
    assert "".join([*head, *picked, *tail]) == text

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.text("ab1", max_size=12), PATTERNS)
def regex_results_follow_the_first_capture_contract ( text: str, pattern: str ) -> None:

    try: compiled = re.compile(pattern)
    except (re.PatternError, RecursionError, OverflowError): return

    matches = list(compiled.finditer(text))
    group   = 1 if compiled.groups else 0

    assert string.matches(text, pattern) == [match.group(group) or "" for match in matches]
    assert string.match(text, pattern) == (matches[0].group(group) if matches else None)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, SIZES)
def counts_and_initials_keep_unicode_whitespace_semantics ( text: str, limit: int ) -> None:

    assert string.word_count(text) == len(re.findall(r"\w+", text))
    assert string.initials(text, limit) == "".join(word[0] for word in text.split()[:max(0, limit)]).upper()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, st.lists(WILD, max_size=8), st.floats(min_value=0.0, max_value=1.0))
def filtered_rank_and_closest_agree ( query: str, choices: list[str], floor: float ) -> None:

    expected = [(item, score) for item, score in string.rank(query, choices, len(choices)) if score >= floor]
    ranked   = string.rank(query, iter(choices), len(choices), floor=floor)

    assert ranked == expected
    assert string.closest(query, iter(choices), floor=floor) == (expected[0][0] if expected else None)

    mapping = dict.fromkeys(choices, "not a choice")
    ranked  = string.rank(query, mapping, len(mapping), floor=floor)

    assert string.closest(query, mapping, floor=floor) == (ranked[0][0] if ranked else None)

ranges_select_characters_without_duplication()
regex_results_follow_the_first_capture_contract()
counts_and_initials_keep_unicode_whitespace_semantics()
filtered_rank_and_closest_agree()



@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD)
def normalization_matches_the_previous_unicode_contract ( text: str ) -> None:

    decomposed = unicodedata.normalize("NFKD", text)
    unmarked   = "".join(char for char in decomposed if unicodedata.combining(char) == 0)
    expected   = re.sub("[\\u064b-\\u0652\\u0670\\u0640]", "", unmarked).casefold()

    assert string.fold(text) == expected

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.lists(st.sampled_from(["e\u0301", "👩🏽‍💻", "🇪🇬", "🇯🇵", "1️⃣", "✈️", "\r\n", "a", "é", "\u1100\u1161\u11a8"]), max_size=40))
def reversal_keeps_delimited_graphemes ( clusters: list[str] ) -> None:

    text     = "|".join(clusters)
    expected = "|".join(reversed(clusters))

    assert string.reverse(text) == expected
    assert string.reverse(expected) == text

normalization_matches_the_previous_unicode_contract()
reversal_keeps_delimited_graphemes()



@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.text(alphabet=st.characters(max_codepoint=127), max_size=100), st.text("\r\n", max_size=100))
def ascii_reversal_matches_grapheme_boundaries ( text: str, endings: str ) -> None:

    text += endings
    expected = "".join(str(group) for group in reversed(list(unicodedata.iter_graphemes(text))))

    assert string.reverse(text) == expected

ascii_reversal_matches_grapheme_boundaries()


@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD)
def squishing_matches_unicode_whitespace ( text: str ) -> None:

    assert string.squish(text) == re.sub(r"\s+", " ", text).strip()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, st.integers(-3, 40), WILD)
def grapheme_cuts_follow_complete_boundaries ( text: str, limit: int, suffix: str ) -> None:

    parts = list(map(str, unicodedata.iter_graphemes(text)))
    tail = list(map(str, unicodedata.iter_graphemes(suffix)))

    if len(parts) <= limit: expected = text
    elif limit <= 0: expected = ""
    elif len(tail) >= limit: expected = "".join(tail[:limit])
    else:

        selected = parts[:limit - len(tail)]

        while selected and selected[-1].isspace(): selected.pop()

        expected = "".join(selected) + suffix

    assert "".join(string.graphemes(text)) == text
    assert string.truncate(text, limit, suffix, graphemes=True) == expected

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, st.dictionaries(st.text(min_size=1, max_size=1), st.text(max_size=4), max_size=8))
def character_substitution_is_literal ( text: str, changes: dict[str, str] ) -> None:

    assert string.replace_many(text, changes) == "".join(changes.get(char, char) for char in text)

squishing_matches_unicode_whitespace()
grapheme_cuts_follow_complete_boundaries()
character_substitution_is_literal()


@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WILD, st.integers(-3, 50), WILD, st.sampled_from(SIDES))
def padding_keeps_pattern_order ( text: str, width: int, fill: str, side: Literal["both", "left", "right"] ) -> None:

    room = max(0, width - len(text))
    left = room if side == "left" else 0 if side == "right" else room // 2 + (room & width & 1)
    repeated = "".join(fill[index % len(fill)] for index in range(room)) if fill else ""
    expected = repeated[:left] + text + repeated[:room - left]

    assert string.pad(text, width, fill, side) == expected

padding_keeps_pattern_order()


@settings(max_examples=1500, deadline=None, database=None)
@given(st.text(max_size=200))
def templates_insert_values_literally_once ( text: str ) -> None:

    assert string.template("{value}", {"value": text}) == text
    assert string.template("__value__", {"value": text}, delimiters=("__", "__")) == text

templates_insert_values_literally_once()

@settings(max_examples=1000, deadline=None, database=None)
@given(st.text(max_size=100), st.text(max_size=100))
def adjacent_custom_values_never_consume_each_others_placeholders ( left: str, right: str ) -> None:

    assert string.template("__left____right__", {"left": left, "right": right}, delimiters=("__", "__")) == left + right

adjacent_custom_values_never_consume_each_others_placeholders()

@settings(max_examples=1000, deadline=None, database=None)
@given(st.text(max_size=200), st.sampled_from([("{", "}"), ("__", "__"), ("**__", "__**")]))
def padded_markers_preserve_literal_values ( value: str, marks: tuple[str, str] ) -> None:

    source = f"{marks[0]} \tvalue {marks[1]}"
    assert string.template(source, {"value": value}, delimiters=marks) == value
    assert string.keys(source, marks) == ["value"]

padded_markers_preserve_literal_values()



@settings(max_examples=2000, deadline=None, database=None)
@given(st.binary(max_size=4096))
def strict_base64_matches_reference_encoding ( raw: bytes ) -> None:

    standard = base64.b64encode(raw).decode()
    url = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    assert string.base64(raw) == standard and string.base64(raw, url=True) == url
    assert string.unbase64(standard, url=False, canonical=True) == raw
    assert string.unbase64(url, url=True, canonical=True) == raw

strict_base64_matches_reference_encoding()

print("fuzz string  properties=30  ok")
