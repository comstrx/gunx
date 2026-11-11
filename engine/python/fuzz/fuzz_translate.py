from engine.error import Code, Fault
from engine.translate import Plural, Translate
from engine.translate.arch import PLURALS
from collections.abc import Callable
from decimal import Decimal
from fractions import Fraction
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

type Operands = dict[str, Fraction]
type Part     = tuple[str, str | None, str | None, str | None]
type Offer    = tuple[str, str | None, bool, str, float]
type Books    = dict[str, dict[str, Any]]

EXAMPLES = 400
FORMS    = ("zero", "one", "two", "few", "many", "other")
OTHER    = "other"
DIGITS   = 64
HEADER   = 256
OFFERS   = 16
KEPT     = 512
DEPTH    = 16
WIDE     = 10 ** 4000
REFUSED  = ("translate.catalog", "translate.locale", "translate.fallback", "translate.folder")
HOMES    = { tag: rules for tags, rules in PLURALS.items() for tag in tags.split() }
POOL     = ("en", "en-GB", "ar", "ar-EG", "pt-BR", "pt-PT", "zh-Hans", "zh-Hant-TW", "es-419", "de-CH-1996", "fr", "sr-Latn")
KEYS     = ("a", "b", "s.a", "s.b", "p", "s.p")
JUNK     = ("e", "12345", "a1b2c3d4e5", "en--GB", "-", "english", "en-", "é", "en GB")
WEIGHTS  = (
    ("", 1.0), (";q=1", 1.0), (";q=0.9", 0.9), ("; q=0.5", 0.5), (";Q=0.5", 0.5), (" ; q = 0.3", 0.3), (";q=0", 0.0), (";q=abc", 0.0),
    (";q=2", 1.0), (";q=-1", 0.0), (";q=nan", 0.0), (";q=inf", 0.0), (";level=1;q=0.4", 0.4), (";q=0.4;q=0.7", 0.7), (";q=", 0.0),
)
SPELL    = st.integers(0, 3)
SEP      = st.sampled_from("-_")
PARTS    = st.tuples(
    st.sampled_from(["en", "ar", "pt", "zh", "es", "de", "fr", "sr", "xx", "ast"]), st.sampled_from([None, None, "Hans", "Hant", "Latn"]),
    st.sampled_from([None, None, "GB", "EG", "BR", "PT", "TW", "419", "CH", "US"]), st.sampled_from([None, None, None, "1996", "valencia", "x1"]),
)
SHELF    = st.sets(st.sampled_from(POOL), min_size=1, max_size=8)
WHOLE    = st.one_of(st.integers(0, 300), st.integers(0, 10 ** 30), st.integers(0, 60).map(lambda step: step * 10 ** 6))
PART     = st.text("0123456789", min_size=1, max_size=8)
SHORT    = st.one_of(st.just(""), st.tuples(st.text("0123456789", max_size=5), st.sampled_from("123456789")).map("".join))
HOME     = st.tuples(st.sampled_from(sorted(HOMES)), st.sampled_from([None, None, "EG", "PT", "BR", "US", "419"]), SPELL, SEP)
ODD      = st.one_of(
    st.none(), st.booleans(), st.text(max_size=5), st.floats(), st.decimals(), st.binary(max_size=3),
    st.sampled_from([Decimal("1E999999"), Decimal("1E-999999"), Decimal("sNaN"), Decimal("-Infinity"), 10 ** 5000, -10 ** 5000, (), 1j]),
)
TEXTS    = st.one_of(st.text(max_size=24), st.text("abXY019-_ é", max_size=24), st.sampled_from(["en" + "-abcdefgh" * 40, "a" * 300, ""]))
HOSTILE  = st.one_of(
    st.text(max_size=600),
    st.lists(st.sampled_from(["en", "ar-EG;q=0.5", "*", "xx", "zh_hant_tw", ";q=1", "q=0", " ", "pt;q=0.0001", "e" * 90]), max_size=300).map(",".join),
)
LEAF     = st.one_of(st.none(), st.booleans(), st.integers(), st.floats(), st.text(max_size=6), st.binary(max_size=3), st.sampled_from([WIDE * 10, (), 1j]))
NAMED    = st.one_of(st.text(max_size=4), st.sampled_from(FORMS), st.integers(0, 3), st.none())
WILD: st.SearchStrategy[Any] = st.recursive(LEAF, lambda inner: st.one_of(st.lists(inner, max_size=2), st.dictionaries(NAMED, inner, max_size=4)), max_leaves=16)
LOCALES  = st.one_of(st.sampled_from(["en", "ar", "EN_gb", "", "e", "english", "en-", "zz-ZZ"]), st.text(max_size=6), st.integers(0, 3))
SHELVES  = st.dictionaries(LOCALES, st.one_of(WILD, st.dictionaries(st.text("ab.", min_size=1, max_size=3), st.text(max_size=4), max_size=4)), max_size=4)
FILES    = st.dictionaries(
    st.sampled_from(["en.json", "ar.json", "EN_gb.json", "english.json", "x.json", "en.txt", "zz-ZZ.json", "ar-EG.json"]),
    st.one_of(
        st.binary(max_size=24),
        st.sampled_from([
            b"", b"{}", b"[]", b"null", b'{"a": 1}', b'{"a": {"b": "c"}}', b'{"a": [1]}', b"\xff", b'{"a": "\\ud800"}', b'{"": "x"}', b'{"a": true}',
            b"[" * 4000, b'{"a":' * 15 + b'"x"' + b"}" * 15, b'{"a":' * 16 + b'"x"' + b"}" * 16, b'{"p": {"one": "1", "other": "n"}}',
        ]),
    ),
    max_size=4,
)
PARAMS   = st.dictionaries(st.sampled_from(["count", "name", "n", "user"]), st.one_of(ODD, st.integers(-5, 5), st.dictionaries(st.sampled_from(["name", "n"]), ODD, max_size=2)), max_size=3)
HELLO    = "Hi {name} {n} {user.name} {count}"
plural   = Plural()
shared   = Translate()
phrase   = Translate()
folder   = TemporaryDirectory()

def tried [T] ( work: Callable[[], T] ) -> T | Fault:

    try: return work()
    except Fault as fault: return fault

def spell ( name: str, way: int, sep: str ) -> str:

    text = name.replace("-", sep)

    return (text, text.lower(), text.upper(), text.swapcase())[way]

def canonical ( part: Part ) -> str:

    return "-".join(piece for piece in part if piece)

def ladder ( tag: str ) -> list[str]:

    return [tag[:at] for at in range(len(tag), 0, -1) if at == len(tag) or tag[at] == "-"]

def match ( offered: set[str], tag: str ) -> str | None:

    for step in ladder(tag):

        if step in offered: return step

    return min((name for name in offered if name.partition("-")[0] == tag.partition("-")[0]), default=None)

def line ( offered: set[str], tag: str, fallback: str ) -> list[str]:

    steps = [*ladder(match(offered, tag) or fallback), *ladder(fallback)]

    return [step for step in dict.fromkeys(steps) if step in offered]

def operands ( text: str ) -> Operands:

    whole, _, part = text.partition(".")
    kept           = part.rstrip("0")

    return {
        "n": Fraction(text), "i": Fraction(int(whole)), "v": Fraction(len(part)), "w": Fraction(len(kept)), "f": Fraction(int(part or 0)),
        "t": Fraction(int(kept or 0)), "e": Fraction(0), "c": Fraction(0),
    }

def within ( value: Fraction, span: str ) -> bool:

    low, _, high = span.partition("..")

    return int(low) <= value <= int(high or low)

def term ( text: str, facts: Operands ) -> bool:

    head, _, spans = text.rpartition(" in ")
    slot, _, base  = head.removesuffix(" not").partition(" mod ")
    value          = facts[slot] % int(base) if base else facts[slot]
    inside         = value.denominator == 1 and any(within(value, span) for span in spans.split(","))

    return inside is not head.endswith(" not")

def home ( tag: str ) -> dict[str, str]:

    language, _, rest = tag.partition("-")
    region            = next((piece for piece in rest.split("-") if len(piece) == 2 or (piece.isdigit() and len(piece) == 3)), "")

    return HOMES.get(f"{language}-{region}") or HOMES.get(language) or {}

def expected ( rules: dict[str, str], text: str ) -> str:

    facts = operands(text)

    for form in FORMS:

        rule = rules.get(form)

        if rule and any(all(term(piece, facts) for piece in side.split(" and ")) for side in rule.split(" or ")): return form

    return OTHER

def shifted ( digits: str, exponent: int ) -> str:

    if exponent >= 0: return digits + "0" * exponent

    padded = digits.rjust(1 - exponent, "0")

    return f"{padded[:exponent]}.{padded[exponent:]}"

def nested ( flat: dict[str, Any] ) -> dict[str, Any]:

    root: dict[str, Any] = {}

    for key, value in flat.items():

        *heads, last = key.split(".")
        spot         = root

        for head in heads: spot = spot.setdefault(head, {})

        spot[last] = value

    return root

def whole ( books: Books, tag: str, key: str ) -> dict[str, str]:

    forms = dict(books[tag][key])

    for step in ladder(tag)[1:]:

        if step in books and isinstance(books[step].get(key), dict): forms = { **whole(books, step, key), **forms }

    return forms

def lookup ( books: Books, chain: list[str], key: str, count: int | None ) -> str | None:

    for tag in chain:

        own = books[tag].get(key)

        if own is None: continue
        if isinstance(own, str): return own

        forms = whole(books, tag, key)
        form  = OTHER if count is None else expected(home(tag), str(abs(count)))

        return forms.get(form) or forms.get(OTHER) or next(forms[name] for name in FORMS if name in forms)

    return None

def plain ( value: object ) -> bool:

    if isinstance(value, bool) or not isinstance(value, int | float): return False

    return isinstance(value, float) or abs(value) < WIDE

def shown ( mark: str, holder: object, name: str ) -> str:

    if not isinstance(holder, dict) or name not in holder: return mark

    try: return str(holder[name])
    except ValueError: return mark

def sound ( catalog: object, depth: int = DEPTH ) -> bool:

    if not isinstance(catalog, dict): return False

    for key, value in catalog.items():

        if not isinstance(key, str) or not key: return False
        if value is None or isinstance(value, str): continue
        if isinstance(value, dict):

            if depth <= 1 or not sound(value, depth - 1): return False

        elif not plain(value): return False

    return True

def held ( translate: Translate ) -> tuple[int, tuple[str, ...], str, dict[str, Any]]:

    return (translate.generation(), translate.locales(), translate.fallback(), { tag: translate.catalog(tag) for tag in translate.locales() })

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(HOME, WHOLE, PART, st.booleans())
def plural_forms_match_the_operands ( spot: tuple[str, str | None, int, str], count: int, part: str, minus: bool ) -> None:

    tag, region, way, sep = spot
    name   = spell(tag if region is None or "-" in tag else f"{tag}-{region}", way, sep)
    rules  = home(tag if region is None or "-" in tag else f"{tag}-{region}")
    sign   = "-" if minus else ""
    forms  = plural.forms(name)

    assert forms == (*(form for form in FORMS if form in rules), OTHER)
    assert plural.form(name, -count if minus else count) == expected(rules, str(count))
    assert plural.form(name, Decimal(f"{sign}{count}.{part}")) == expected(rules, f"{count}.{part}")
    assert plural.form(name, Decimal(f"{sign}00{count}")) == expected(rules, str(count))
    assert plural.form(name, float(count)) == expected(rules, str(int(float(count))))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(HOME, st.integers(0, 10 ** 40), st.integers(-44, 44), st.integers(0, 10 ** 8 - 1), SHORT, st.booleans())
def plural_forms_read_exponents_and_floats ( spot: tuple[str, str | None, int, str], digits: int, exponent: int, base: int, part: str, minus: bool ) -> None:

    tag, _, way, sep = spot
    name  = spell(tag, way, sep)
    rules = home(tag)
    sign  = "-" if minus else ""
    text  = f"{base}.{part}" if part else str(base)
    wide  = len(str(digits)) + abs(exponent) > DIGITS
    found = plural.form(name, Decimal(f"{sign}{digits}E{exponent}"))

    assert found == (OTHER if wide else expected(rules, shifted(str(digits), exponent)))
    assert plural.form(name, float(f"{sign}{text}")) == expected(rules, text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(TEXTS, HOME.map(lambda spot: spell(spot[0], spot[2], spot[3]))), ODD)
def odd_counts_and_locales_stay_plain ( name: str, count: object ) -> None:

    forms = plural.forms(name)
    found = plural.form(name, count)

    assert forms[-1] == OTHER
    assert set(forms) <= set(FORMS)
    assert found in forms
    assert plural.form(name, 7) in forms
    assert len(vars(plural)["_found"]) <= KEPT

    if isinstance(count, bool) or not isinstance(count, int | float | Decimal): assert found == OTHER

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PARTS, SPELL, SEP, TEXTS)
def tags_are_canonical_or_refused ( part: Part, way: int, sep: str, text: str ) -> None:

    assert shared.tag(spell(canonical(part), way, sep)) == canonical(part)

    found = tried(partial(shared.tag, text))

    if isinstance(found, Fault):

        assert found.code is Code.VALIDATION
        assert found.reason == "translate.locale"

        return

    assert shared.tag(found) == found
    assert found.lower() == text.lower().replace("_", "-")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SHELF, st.data())
def a_wanted_locale_resolves_like_the_ladder ( offered: set[str], data: st.DataObject ) -> None:

    fallback  = data.draw(st.sampled_from(sorted(offered)))
    translate = Translate()

    translate.setup({ spell(tag, data.draw(SPELL), data.draw(SEP)): { "k": tag } for tag in sorted(offered) }, spell(fallback, data.draw(SPELL), "_"))

    assert translate.locales() == tuple(sorted(offered))
    assert translate.fallback() == fallback

    for part in data.draw(st.lists(PARTS, min_size=1, max_size=4)):

        wanted = spell(canonical(part), data.draw(SPELL), data.draw(SEP))
        chosen = match(offered, canonical(part)) or fallback

        assert translate.resolve(wanted) == chosen
        assert translate.resolve(wanted) == chosen
        assert translate.find("k", wanted) == chosen

    offers: list[Offer] = []

    for index in range(data.draw(st.integers(0, 6))):

        kind         = data.draw(st.integers(0, 9))
        suffix, rank = data.draw(st.sampled_from(WEIGHTS))
        part         = data.draw(PARTS)
        pad          = " " * (index % 2)

        if kind == 0: offers.append((f"{pad}*{suffix}", None, True, suffix, rank))
        elif kind == 1: offers.append((f"{data.draw(st.sampled_from(JUNK))}{suffix}", None, False, suffix, rank))
        elif kind == 2: offers.append(("", None, False, suffix, 0.0))
        else: offers.append((f"{pad}{spell(canonical(part), data.draw(SPELL), data.draw(SEP))}{pad}{suffix}", canonical(part), False, suffix, rank))

    header = ",".join(offer[0] for offer in offers)
    ranked = sorted((-rank, index) for index, (_, _, _, _, rank) in enumerate(offers) if rank > 0)
    wished = fallback

    for _, index in ranked[:OFFERS]:

        _, tag, star, _, _ = offers[index]
        found              = None if tag is None else match(offered, tag)

        if star or found is not None:

            wished = fallback if star else found or fallback

            break

    assert len(header) <= HEADER
    assert translate.negotiate(header) == wished
    assert translate.negotiate(header) == wished
    assert translate.negotiate(None) == fallback
    assert translate.negotiate("") == fallback

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(HOSTILE, TEXTS)
def a_hostile_header_picks_an_offered_locale ( header: str, wanted: str ) -> None:

    found = shared.negotiate(header)
    fresh = Translate()

    fresh.setup({ tag: { "k": tag } for tag in POOL }, "en")

    assert found in POOL
    assert found == fresh.negotiate(header[:HEADER])
    assert shared.negotiate(header) == found
    assert shared.resolve(wanted) in POOL
    assert shared.text("k", wanted) in POOL
    assert shared.has("k", wanted) is True
    assert len(vars(shared)["_chosen"]) <= KEPT
    assert len(vars(shared)["_seen"]) <= KEPT

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SHELF, st.data())
def layered_catalogs_answer_like_the_model ( offered: set[str], data: st.DataObject ) -> None:

    fallback = data.draw(st.sampled_from(sorted(offered)))
    books: Books = {}

    for tag in sorted(offered):

        book: dict[str, Any] = {}

        for key in KEYS:

            kind = data.draw(st.integers(0, 3))

            if kind == 1: book[key] = f"{tag}:{key}:{{count}}"
            elif kind == 2 and key.endswith("p"):

                book[key] = { form: f"{tag}:{key}:{form}:{{count}}" for form in data.draw(st.sets(st.sampled_from(FORMS), min_size=1)) }

        books[tag] = book

    translate = Translate()
    twin      = Translate()

    translate.setup({ tag: nested(book) for tag, book in data.draw(st.permutations(sorted(books.items()))) }, fallback)
    twin.setup({ tag: translate.catalog(tag) for tag in translate.locales() }, fallback)

    for tag, book in books.items():

        flat = { key: value for key, value in book.items() if isinstance(value, str) }

        for key, value in book.items():

            if isinstance(value, dict): flat.update({ f"{key}.{form}": text for form, text in value.items() })

        assert translate.catalog(tag) == flat

    for part in data.draw(st.lists(PARTS, min_size=1, max_size=3)):

        wanted = canonical(part)
        chain  = line(offered, wanted, fallback)
        count  = data.draw(st.one_of(st.none(), st.integers(-120, 120), st.integers(0, 10 ** 9)))

        for key in (*KEYS, "s", "zz"):

            found = lookup(books, chain, key, count)
            shown = None if found is None or count is None else found.replace("{count}", str(count))
            given = translate.find(key, wanted) if count is None else translate.find(key, wanted, count=count)

            assert given == (found if count is None else shown)
            assert translate.has(key, wanted) is (found is not None)
            assert translate.text(key, wanted) == (lookup(books, chain, key, None) or key)
            assert (twin.find(key, wanted) if count is None else twin.find(key, wanted, count=count)) == given

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SHELVES, LOCALES.filter(lambda name: isinstance(name, str)), st.integers(1, 20), PARAMS)
def a_bad_catalog_is_refused_whole ( shelves: dict[Any, Any], fallback: str, levels: int, params: dict[str, Any] ) -> None:

    translate = Translate()

    translate.setup({ "en": { "k": "held" } })

    before = held(translate)
    tags   = [tried(partial(translate.tag, name)) if isinstance(name, str) else None for name in shelves]
    fine   = all(isinstance(tag, str) for tag in tags) and all(sound(catalog) for catalog in shelves.values())
    home   = tried(partial(translate.tag, fallback))
    found  = tried(partial(translate.setup, shelves, fallback))

    if fine and isinstance(home, str) and home in tags:

        assert found is None
        assert translate.locales() == tuple(sorted({ tag for tag in tags if isinstance(tag, str) }))
        assert translate.fallback() == home

    else:

        assert isinstance(found, Fault)
        assert found.code is Code.INTERNAL
        assert found.reason in REFUSED
        assert held(translate) == before

    deep: dict[str, Any] = { "leaf": "x" }
    twin  = Translate()

    for _ in range(levels - 1): deep = { "a": deep }

    grown = tried(partial(twin.extend, "en", deep))
    count = shown("{count}", params, "count")
    hello = f"Hi {shown('{name}', params, 'name')} {shown('{n}', params, 'n')} {shown('{user.name}', params.get('user'), 'name')} {count}"

    assert (grown is None) is (levels <= DEPTH)
    assert twin.has(".".join([*["a"] * (levels - 1), "leaf"])) is (levels <= DEPTH)
    assert phrase.text("hello", **params) == hello
    assert phrase.text("zz", **params) == "zz"
    assert phrase.text("p", **params) in ((f"{count} one", f"{count} more") if "count" in params else ("{count} more",))

@settings(max_examples=EXAMPLES // 4, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(FILES)
def a_folder_loads_whole_or_not_at_all ( files: dict[str, bytes] ) -> None:

    root      = Path(folder.name)
    translate = Translate()

    translate.setup({ "en": { "k": "held" } })

    for file in root.iterdir(): file.unlink()
    for name, body in files.items(): (root / name).write_bytes(body)

    before = held(translate)
    found  = tried(partial(translate.load, root))

    if isinstance(found, Fault):

        assert found.code is Code.INTERNAL
        assert found.reason in REFUSED
        assert held(translate) == before

        return

    assert found == translate.locales() == tuple(sorted(found))
    assert "en" in found
    assert translate.generation() == before[0] + 1
    assert isinstance(tried(partial(translate.load, root / "absent")), Fault)

shared.setup({ tag: { "k": tag } for tag in POOL }, "en")
phrase.setup({ "en": { "hello": HELLO, "p": { "one": "{count} one", "other": "{count} more" } } })
plural_forms_match_the_operands()
plural_forms_read_exponents_and_floats()
odd_counts_and_locales_stay_plain()
tags_are_canonical_or_refused()
a_wanted_locale_resolves_like_the_ladder()
a_hostile_header_picks_an_offered_locale()
layered_catalogs_answer_like_the_model()
a_bad_catalog_is_refused_whole()
a_folder_loads_whole_or_not_at_all()
folder.cleanup()

print(f"fuzz translate  examples={EXAMPLES * 8 + EXAMPLES // 4}  ok")
