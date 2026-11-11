from decimal import Decimal
from engine.context import context
from engine.error import Code, Fault
from engine.translate import Plural, plural, Translate, translate
from engine.translate.arch import PLURALS
from pathlib import Path
from typing import Any
import pytest

CATALOGS = {
    "en": {
        "hello"   : "Hello {name}",
        "items"   : { "one": "{count} item", "other": "{count} items" },
        "reasons" : { "auth": { "missing": "Sign in first" } },
        "only"    : "English only",
    },
    "ar": {
        "hello"   : "أهلاً {name}",
        "items"   : { "zero": "لا عناصر", "one": "عنصر واحد", "two": "عنصران", "few": "{count} عناصر", "many": "{count} عنصراً", "other": "{count} عنصر" },
        "reasons" : { "auth": { "missing": "سجّل الدخول أولاً" } },
    },
}
VECTORS: tuple[tuple[str, str, tuple[object, ...]], ...] = (
    ("en", "one", (1, -1, 1.0)),
    ("en", "other", (0, 2, 11, 100, 1.5, Decimal("1.0"), Decimal("1.00"), Decimal("0.0"))),
    ("en-US", "one", (1,)),
    ("EN_us", "one", (1,)),
    ("ar", "zero", (0, Decimal("0.0"))),
    ("ar", "one", (1, Decimal("1.00"))),
    ("ar", "two", (2, -2)),
    ("ar", "few", (3, 10, 103, 110, 1003)),
    ("ar", "many", (11, 26, 99, 111, 1011)),
    ("ar", "other", (100, 101, 102, 200, 1000, Decimal("0.1"), 1.5, Decimal("10.1"))),
    ("ars", "few", (3,)),
    ("ar-EG", "many", (11,)),
    ("ru", "one", (1, 21, 31, 101, 1001)),
    ("ru", "few", (2, 3, 4, 22, 24, 1002)),
    ("ru", "many", (0, 5, 11, 12, 14, 20, 100, 1000, 10 ** 40)),
    ("ru", "other", (1.5, Decimal("1.0"), Decimal("10.0"), Decimal("0.5"))),
    ("pl", "one", (1,)),
    ("pl", "few", (2, 4, 22, 24, 102)),
    ("pl", "many", (0, 5, 12, 13, 14, 21, 25, 100, 112)),
    ("pl", "other", (1.5, Decimal("1.0"))),
    ("fr", "one", (0, 1, 1.5, Decimal("0.0"), Decimal("1.99"))),
    ("fr", "many", (1000000, 2000000, 10 ** 9)),
    ("fr", "other", (2, 17, 100, 1000, 1000001, Decimal("2.0"), 3.5, Decimal("1000000.0"))),
    ("es", "one", (1,)),
    ("es", "many", (1000000,)),
    ("es", "other", (0, 2, 1.5, 1000001)),
    ("pt", "one", (0, 1, 1.5, Decimal("0.0"))),
    ("pt", "other", (2, 100, Decimal("2.0"))),
    ("pt-BR", "one", (0,)),
    ("pt-PT", "one", (1,)),
    ("pt-PT", "other", (0, 2, 1.5, Decimal("1.0"))),
    ("pt-AO", "other", (0,)),
    ("pt_pt", "other", (0,)),
    ("PT-pt", "one", (1,)),
    ("he", "one", (1, Decimal("0.5"), Decimal("0.0"))),
    ("he", "two", (2,)),
    ("he", "other", (0, 3, 17, 100, Decimal("1.0"), 2.5)),
    ("iw", "two", (2,)),
    ("lt", "one", (1, 21, 31, Decimal("1.0"), Decimal("21.0"))),
    ("lt", "few", (2, 9, 22, 29, Decimal("2.0"))),
    ("lt", "many", (Decimal("0.1"), 1.5, Decimal("10.1"))),
    ("lt", "other", (0, 10, 11, 19, 20, 30, Decimal("10.0"))),
    ("lv", "zero", (0, 10, 11, 19, 20, 30, Decimal("0.0"), Decimal("10.0"))),
    ("lv", "one", (1, 21, 31, Decimal("0.1"), Decimal("1.0"), Decimal("1.1"), 2.1)),
    ("lv", "other", (2, 9, 22, 29, Decimal("0.2"), 1.5, 1.5e-7)),
    ("cs", "one", (1,)),
    ("cs", "few", (2, 3, 4)),
    ("cs", "many", (1.5, Decimal("0.0"), Decimal("1.0"))),
    ("cs", "other", (0, 5, 19, 100)),
    ("sl", "one", (1, 101, 201)),
    ("sl", "two", (2, 102)),
    ("sl", "few", (3, 4, 103, 1.5, Decimal("0.0"))),
    ("sl", "other", (0, 5, 19, 100)),
    ("ga", "one", (1,)),
    ("ga", "two", (2,)),
    ("ga", "few", (3, 6)),
    ("ga", "many", (7, 10)),
    ("ga", "other", (0, 11, 25, 100, 1.5)),
    ("cy", "zero", (0,)),
    ("cy", "one", (1,)),
    ("cy", "two", (2,)),
    ("cy", "few", (3,)),
    ("cy", "many", (6,)),
    ("cy", "other", (4, 5, 7, 20, 100)),
    ("mt", "one", (1,)),
    ("mt", "two", (2,)),
    ("mt", "few", (0, 3, 10, 103, 109)),
    ("mt", "many", (11, 19, 111)),
    ("mt", "other", (20, 35, 100, 101, 102)),
    ("ro", "one", (1,)),
    ("ro", "few", (0, 2, 16, 19, 101, 119, 1.5, Decimal("1.0"))),
    ("ro", "other", (20, 35, 100, 120)),
    ("mo", "few", (0,)),
    ("hi", "one", (0, 1, Decimal("0.5"), Decimal("1.0"))),
    ("hi", "other", (2, 10, 1.5, Decimal("2.0"))),
    ("da", "one", (1, Decimal("1.0"), Decimal("0.1"), 1.5, Decimal("0.10"))),
    ("da", "other", (0, 2, 16, Decimal("0.0"), Decimal("2.5"))),
    ("is", "one", (1, 21, 31, Decimal("0.1"), Decimal("1.0"), Decimal("1.1"), Decimal("1.10"), Decimal("5.100"))),
    ("is", "other", (0, 2, 11, 16, Decimal("0.0"), Decimal("0.2"), Decimal("0.11"))),
    ("gd", "one", (1, 11)),
    ("gd", "two", (2, 12)),
    ("gd", "few", (3, 10, 13, 19)),
    ("gd", "other", (0, 20, 34, 100)),
    ("si", "one", (0, 1, Decimal("0.0"), Decimal("0.1"), Decimal("1.0"), Decimal("0.01"))),
    ("si", "other", (2, 10, Decimal("0.2"), Decimal("1.1"), Decimal("0.10"))),
    ("sr-Cyrl-RS", "few", (2,)),
    ("sh", "few", (2,)),
    ("tl", "one", (1,)),
    ("ji", "one", (1,)),
    ("ja", "other", (0, 1, 2, 1.5)),
    ("zh-Hant-TW", "other", (1,)),
    ("xx", "other", (1,)),
    ("", "other", (1,)),
    ("not a tag", "other", (1,)),
)
ODD: tuple[object, ...] = (
    True, False, None, "1", b"1", [1], float("nan"), float("inf"), float("-inf"), Decimal("NaN"), Decimal("sNaN"),
    Decimal("Infinity"), Decimal("1E+100"), Decimal("1E-100"), Decimal(1) / Decimal(3) * Decimal("1E-40"), object(), 1j,
)
PROBES: tuple[object, ...] = (*range(200), 1000000, Decimal("0.0"), Decimal("0.1"), Decimal("0.5"), Decimal("1.0"), Decimal("1.5"))
REFUSED = ("", "a", "abcd", "ar-", "-ar", "ar--EG", "ar EG", "ar-EG-", "عربي", "ar-abcdefghi", "en-a-b-c-d-e-f", "e" * 200, "en\n", "en-US\x00")
WANTED  = {
    None: "en", "": "en", "ar": "ar", "AR-eg, en;q=0.5": "ar", "en-US,en;q=0.9,ar;q=0.8": "en", "ar;q=0.1, en;q=0.2": "en",
    "fr-FR, en;q=0.9": "fr-CA", "fr": "fr-CA", "de, ja;q=0.9": "en", "de, *;q=0.5": "en", "*": "en", "ar;q=0, en": "en",
    "ar;q=0": "en", "ar;q=nan": "en", "ar;q=inf, pt": "pt-BR", "ar;q=abc, pt;q=0.1": "pt-BR", "ar;Q=0.5, pt;q=0.9": "pt-BR",
    " ar ; q=0.5 ": "ar", ",,,": "en", "en;q=0.1, ar": "ar", "pt, ar": "pt-BR", "ar, pt": "ar", "x" * 5000: "en",
    "ar" + "," * 5000: "ar", "de," * 400 + "ar": "en", "pt_br": "pt-BR", "zz-ZZ, pt-PT;q=0.3": "pt-BR", "\x00\ud800": "en",
    "de, *;q=0.5, ar;q=0.1": "en", "de, ar;q=0.5, *;q=0.1": "ar",
}

def deep ( levels: int ) -> dict[str, Any]:

    held: dict[str, Any] = { "k": "leaf" }

    for _ in range(levels - 1): held = { "k": held }

    return held

def sizes ( owner: object ) -> list[int]:

    return [len(held) for held in vars(owner).values() if isinstance(held, dict)]

def kept ( owner: object, key: str ) -> bool:

    return any(key in held for held in vars(owner).values() if isinstance(held, dict))

def widest ( owner: object ) -> int:

    return max(len(key) for held in vars(owner).values() if isinstance(held, dict) for key in held if isinstance(key, str))

def test_messages_fall_back_and_pluralize () -> None:

    t = Translate()

    t.setup(CATALOGS, "en")

    assert t.locales() == ("ar", "en") and t.fallback() == "en" and t.has("hello") and not t.has("nope")
    assert t.text("hello", "en", name="Ann") == "Hello Ann" and t.text("hello", "ar", name="آن") == "أهلاً آن"
    assert t.text("only", "ar") == "English only" and t.text("nope") == "nope" and t.text("hello", "fr", name="x") == "Hello x"
    assert t.choice("items", 1, "en") == "1 item" and t.choice("items", 3, "en") == "3 items"
    assert [t.choice("items", n, "ar") for n in (0, 1, 2, 3, 11, 100)] == ["لا عناصر", "عنصر واحد", "عنصران", "3 عناصر", "11 عنصراً", "100 عنصر"]
    assert t.reason("auth.missing", "ar") == "سجّل الدخول أولاً"
    assert t.missing("ar") == ["only"] and t.describe() == { "locales": ["ar", "en"], "fallback": "en", "keys": 4 }

    with context.scope(locale="ar"): assert t.text("hello", name="x") == "أهلاً x" and t.current() == "ar"

    t.extend("fr", { "hello": "Bonjour {name}" })

    assert t.text("hello", "fr", name="x") == "Bonjour x" and "fr" in t.locales() and t.catalog("fr") == { "hello": "Bonjour {name}" }
    assert type(translate) is Translate and type(plural) is Plural and t.current() == "en"

    with pytest.raises(Fault): Translate().setup({ "ar": {} }, "en")

def test_folders_load_merged_and_flat_reasons_are_found ( tmp_path: Path ) -> None:

    shared, own = tmp_path / "shared", tmp_path / "own"

    shared.mkdir()
    own.mkdir()
    (shared / "en.json").write_text('{"reasons": {"auth.missing": "Sign in first", "kept": "Kept"}}')
    (shared / "ar.json").write_text('{"reasons": {"auth.missing": "سجّل الدخول أولاً"}}')
    (own / "en.json").write_text('{"reasons": {"auth.missing": "Log in"}, "hello": {"world": "hello world"}}')

    t = Translate()

    assert t.load(shared, own) == ("ar", "en")
    assert t.reason("auth.missing", "en") == "Log in" and t.reason("kept", "ar") == "Kept" and t.reason("nope") is None
    assert t.find("world", "en", "hello") == "hello world" and t.find("hello.world", "ar") == "hello world"
    assert t.find("nope") is None and t.text("nope") == "nope"

    (shared / "en.json").write_text('{"bye": "bye"}')

    assert t.load(shared) == ("ar", "en") and t.text("bye") == "bye" and t.reason("auth.missing", "en") == "Log in"

    (own / "fr.json").write_text("[1]")

    with pytest.raises(Fault) as wrong: t.load(own)

    assert wrong.value.reason == "translate.catalog"

    with pytest.raises(Fault) as missing: t.load(tmp_path / "none")

    assert missing.value.reason == "translate.folder"

def test_plural_forms_follow_the_cldr_rules () -> None:

    for locale, form, counts in VECTORS:

        for count in counts: assert plural.form(locale, count) == form, (locale, count)

    for locale in ("en", "ar", "ru", "fr", "lv", "ja", "xx"):

        for count in ODD: assert plural.form(locale, count) == "other", (locale, count)

    assert plural.forms("ar") == ("zero", "one", "two", "few", "many", "other") and plural.forms("en") == ("one", "other")
    assert plural.forms("fr") == ("one", "many", "other") and plural.forms("ru") == ("one", "few", "many", "other")
    assert plural.forms("ja") == plural.forms("xx") == plural.forms("") == ("other",) and plural.forms("pt-PT") == plural.forms("it")
    assert plural.form("ru", 10 ** 400 + 1) == "one" and plural.form("ar", Decimal("1" + "0" * 59 + "3")) == "few"
    assert plural.form("en", Decimal("1." + "0" * 80)) == "other" and plural.form("ar", Decimal("1E+2")) == "other"

def test_every_plural_family_compiles_and_reaches_its_forms () -> None:

    fresh = Plural()
    tags  = [tag for tags in PLURALS for tag in tags.split()]

    assert len(tags) == len(set(tags)) == 195 and len(PLURALS) == 38

    for tag in tags:

        forms = fresh.forms(tag)
        seen  = { fresh.form(tag, count) for count in PROBES }

        assert forms[-1] == "other" and len(forms) > 1 and seen == set(forms), (tag, forms, seen)
        assert all(fresh.form(tag, count) == fresh.form(tag, -count) for count in (1, 2, 5, 11, Decimal("1.5"))), tag

    for count in range(5000): assert fresh.form(f"xx-x{count}", 1) == "other" and fresh.form("ar", 2) == "two"

    assert fresh.form("ar-" + "x" * 100000, 2) == fresh.form("x" * 100000, 1) == "other" and fresh.forms("x" * 100000) == ("other",)
    assert max(sizes(fresh)) <= 512 and widest(fresh) <= 128 and fresh.form("xx-late", 1) == "other" and kept(fresh, "xx-late")

def test_tags_are_canonical_or_refused () -> None:

    t     = Translate()
    wild  = ("AR", "ar_eg", "zh-hant-tw", "ES-419", "ca-es-VALENCIA", "sr_latn_rs", "en-US-u-ca-gregory", "fil", "de-1996")
    clean = ["ar", "ar-EG", "zh-Hant-TW", "es-419", "ca-ES-valencia", "sr-Latn-RS", "en-US-u-ca-gregory", "fil", "de-1996"]

    assert [t.tag(text) for text in wild] == clean and [t.tag(text) for text in clean] == clean

    for text in REFUSED:

        with pytest.raises(Fault) as refused: t.tag(text)

        assert refused.value.code is Code.VALIDATION and refused.value.reason == "translate.locale"
        assert refused.value.errors == { "locale": ["is not a language tag"] }

def test_a_locale_reads_its_region_then_its_language_then_the_fallback () -> None:

    t = Translate()

    t.setup({
        "en-US"      : { "c": "C-US" },
        "ar_eg"      : { "a": "مصري", "items": { "one": "حاجة واحدة" } },
        "en"         : { "a": "A", "b": "B", "c": "C", "items": { "one": "one", "other": "{count} many" } },
        "ar"         : { "a": "ع", "b": "ب", "items": CATALOGS["ar"]["items"] },
        "pt-BR"      : { "a": "oi" },
        "zh-hant-tw" : { "a": "繁" },
    }, "en-us")

    wanted = ("ar-EG", "ar_eg", "AR-EG", "ar-SA", "ar", "pt", "pt-PT", "zh-Hant-TW", "zh-Hant", "zh", "zh-Hans-CN", "en-GB", "fr", "", "?!", "x" * 500)
    chosen = ["ar-EG", "ar-EG", "ar-EG", "ar", "ar", "pt-BR", "pt-BR", "zh-Hant-TW", "zh-Hant-TW", "zh-Hant-TW", "zh-Hant-TW", "en", "en-US", "en-US", "en-US", "en-US"]

    assert t.locales() == ("ar", "ar-EG", "en", "en-US", "pt-BR", "zh-Hant-TW") and t.fallback() == "en-US"
    assert [t.resolve(text) for text in wanted] == chosen and t.resolve() == t.current() == "en-US"
    assert [t.text(key, "ar-EG") for key in "abc"] == ["مصري", "ب", "C-US"] and [t.text(key, "ar-SA") for key in "abc"] == ["ع", "ب", "C-US"]
    assert [t.text(key, "pt-PT") for key in "abc"] == ["oi", "B", "C-US"] and [t.text(key, "en-GB") for key in "abc"] == ["A", "B", "C"]
    assert [t.text(key, "fr") for key in "abc"] == ["A", "B", "C-US"] and t.text("a", "zh") == "繁"
    assert [t.choice("items", count, "ar-EG") for count in (1, 2, 5, 11)] == ["حاجة واحدة", "عنصران", "5 عناصر", "11 عنصراً"]
    assert t.find("items.one", "ar-EG") == "حاجة واحدة" and t.find("items.few", "ar-EG") == "{count} عناصر" and t.find("items.few", "en") is None
    assert [t.choice("items", count, "pt") for count in (1, 0, 2)] == ["one", "0 many", "2 many"]
    assert t.catalog("AR_eg") == { "a": "مصري", "items.one": "حاجة واحدة" } and t.catalog("fr") == {} and t.catalog("?") == {}
    assert t.catalog("ar") is not t.catalog("ar")

    with context.scope(locale="ar-EG"): assert t.current() == "ar-EG" and t.text("b") == "ب" and t.resolve("pt") == "pt-BR"
    with context.scope(locale="de-AT"): assert t.current() == "en-US" and t.text("a") == "A"

    assert t.resolve("de-AT") == "en-US" and t.negotiate("de-AT") == "en-US"

    t.extend("de", { "a": "eins" })

    assert t.resolve("de-AT") == "de" and t.negotiate("de-AT") == "de" and t.text("a", "de-AT") == "eins" and t.text("b", "de-AT") == "B"

    t.setup({ "es-MX": {}, "en": {}, "es-AR": {}, "es-ES": {} })

    assert t.resolve("es") == t.resolve("es-CL") == t.negotiate("es-419, en") == "es-AR" and t.resolve("es-MX") == "es-MX"

def test_the_accept_language_header_picks_an_offered_locale () -> None:

    t = Translate()

    t.setup({ "en": {}, "ar": {}, "fr-CA": {}, "pt-BR": {} })

    for header, found in WANTED.items(): assert t.negotiate(header) == found, header
    for header, found in WANTED.items(): assert t.negotiate(header) == found, header
    for count in range(5000): assert t.negotiate(f"q{count}, ar;q=0.5") == "ar" and t.resolve(f"ar-x{count}") == "ar"

    crowd = [f"x{letter}" for letter in "abcdefghijklmnopq"]

    assert max(sizes(t)) <= 512 and t.negotiate("fr, ar") == "fr-CA" and t.negotiate("ar, " + "x" * 200) == "ar"
    assert kept(t, "fr, ar") and t.resolve("ar-late") == "ar" and kept(t, "ar-late") and not kept(t, "ar, " + "x" * 200)
    assert t.resolve("ar-" + "x" * 200) == t.resolve("x" * 100000) == "en" and widest(t) <= 128
    assert t.negotiate(", ".join([*crowd[:15], "ar"])) == "ar" and t.negotiate(", ".join([*crowd, "ar"])) == "en"
    assert t.negotiate("xa;q=0.9, " * 20 + "ar") == "ar" and t.negotiate("xa;q=0.9, " * 30 + "ar") == "en"

    t.setup({ "ar": {}, "en": {} }, "ar")

    assert t.negotiate("fr, *") == "ar" and t.negotiate("fr, en") == "en" and t.negotiate(None) == "ar" and t.negotiate("fr") == "ar"

def test_a_bad_catalog_is_refused_and_the_held_one_stays () -> None:

    t = Translate()

    t.setup(CATALOGS)

    bad: tuple[tuple[Any, str, str], ...] = (
        ({ "en": { "a": True } }, "translate.catalog", "en"),
        ({ "en": { "a": { "b": ["x"] } } }, "translate.catalog", "en"),
        ({ "en": { "a": { 1: "x" } } }, "translate.catalog", "en"),
        ({ "en": { "": "x" } }, "translate.catalog", "en"),
        ({ "en": { "a": b"x" } }, "translate.catalog", "en"),
        ({ "en": deep(17) }, "translate.catalog", "en"),
        ({ "en": ["x"] }, "translate.catalog", "en"),
        ({ "en": "x" }, "translate.catalog", "en"),
        ({ "en": {}, "not a tag": {} }, "translate.locale", "not a tag"),
        ({ "en": {}, "t" * 500: {} }, "translate.locale", "t" * 128),
        ({ "ar": {} }, "translate.fallback", "locale"),
        ({}, "translate.fallback", "locale"),
    )

    for catalogs, reason, label in bad:

        with pytest.raises(Fault) as refused: t.setup(catalogs)

        assert refused.value.code is Code.INTERNAL and refused.value.reason == reason and list(refused.value.errors or {}) == [label]

    with pytest.raises(Fault) as refused: t.setup(CATALOGS, "e n")

    assert refused.value.reason == "translate.fallback"

    with pytest.raises(Fault) as refused: t.extend("en", { "secret": { "value": object() } })

    assert refused.value.errors == { "en": ["secret.value is not a text"] }

    with pytest.raises(Fault) as refused: t.extend("?", {})

    assert refused.value.reason == "translate.locale" and t.generation() == 1 and t.locales() == ("ar", "en")
    assert t.text("hello", "ar", name="x") == "أهلاً x" and t.choice("items", 2, "ar") == "عنصران"

    t.setup({ "en": deep(16) | { "n": 5, "f": 1.5, "none": None, "big": 10 ** 30 } })

    assert t.find(".".join("k" * 16)) == "leaf" and t.find("n") == "5" and t.find("f") == "1.5" and t.find("big") == str(10 ** 30)
    assert t.find("none") is None and not t.has("none") and t.generation() == 2

def test_catalogs_merge_by_key_and_a_mapping_replaces_a_text () -> None:

    t = Translate()

    t.extend("ar", { "a": "ع" })

    assert t.locales() == ("ar", "en") and t.text("a", "ar") == "ع" and t.text("a") == "a" and t.generation() == 1

    t.setup({ "en": { "items": "Items", "a": { "b": "x" }, "reasons": { "auth": "Sign in" } } })
    t.extend("en", { "items": { "one": "1", "other": "n" }, "a": { "c": "y" }, "reasons": { "auth.missing": "Missing" } })

    assert t.choice("items", 1) == "1" and t.choice("items", 2) == "n" and t.find("a.b") == "x" and t.find("a.c") == "y"
    assert t.reason("auth") == "Sign in" and t.reason("auth.missing") == "Missing" and t.generation() == 3

    t.extend("en", { "a.b": "z", "items": { "two": "2" } })

    assert t.find("a.b") == "z" and [t.choice("items", count) for count in (1, 2)] == ["1", "n"] and t.find("items.two") == "2"

    t.extend("en", { "items": "All" })

    assert t.find("items") == t.choice("items", 1) == "All" and t.find("items.one") == "1"
    assert t.catalog("en") == {
        "items": "All", "items.one": "1", "items.other": "n", "items.two": "2", "a.b": "z", "a.c": "y", "reasons.auth": "Sign in",
        "reasons.auth.missing": "Missing",
    }

def test_plural_leaves_and_parameters_are_read_as_written () -> None:

    t = Translate()

    t.setup({
        "en": {
            "items"   : { "one": "{count} item", "other": "{count} items" },
            "loose"   : { "one": "single", "many": "lots" },
            "mixed"   : { "one": "1", "title": "T" },
            "nested"  : { "one": { "x": "X" }, "other": "O" },
            "count"   : { "zero": "none", "one": "single", "two": "pair" },
            "hello"   : "Hello {name}, {user.name} {missing} {",
            "empty"   : "",
            "reasons" : { "rate.many": "Too many", "auth.missing": "Sign in" },
        },
    })

    assert t.choice("items", Decimal("1.0")) == "1.0 items" and t.choice("items", 1.0) == "1.0 item" and t.find("items") == "{count} items"
    assert t.choice("items", "few") == "few items" and t.choice("items", None) == "None items" and t.choice("items", count=True) == "True items"
    assert t.choice("loose", 1) == "single" and t.choice("loose", 5) == "single" and t.find("loose.many") == "lots"
    assert t.find("mixed") is None and t.find("mixed.one") == "1" and t.find("nested") is None and t.find("nested.other") == "O"
    assert t.choice("count", 0) == "none" and t.choice("count", 1) == "single" and t.find("count.two") == "pair"
    assert t.text("hello", name="Ann", user={ "name": "A" }) == "Hello Ann, A {missing} {" and t.text("hello") == "Hello {name}, {user.name} {missing} {"
    assert t.reason("rate.many") == "Too many" and t.reason("rate") == "Too many" and t.reason("auth") is None
    assert t.find("empty") == t.text("empty") == t.text("empty", name="x") == "" and t.has("empty")
    assert t.has("auth.missing", section="reasons") and t.has("reasons.auth.missing") and not t.has("auth.missing") and t.has("items")
    assert t.has("items.one") and not t.has("mixed") and t.has("one", None, "mixed") and t.find("one", None, "mixed") == "1"

def test_missing_names_the_absent_keys_and_the_absent_forms () -> None:

    t = Translate()

    t.setup({
        "en"    : { "a": "A", "items": { "one": "1", "other": "n" }, "deep": { "x": "X" }, "reasons": { "rate": "Slow", "rate.many": "Too many" } },
        "ar"    : { "a": "ع", "items": { "one": "1", "other": "n" }, "extra": "x", "reasons": { "rate": "تمهل" } },
        "ar-EG" : { "deep": { "x": "س" }, "items": { "two": "2" } },
        "ja"    : { "items": { "other": "n" } },
    })

    whole = ["a", "deep.x", "items", "reasons.rate", "reasons.rate.many"]

    assert t.missing("ar") == ["deep.x", "reasons.rate.many"] and t.missing("ar-EG") == ["reasons.rate.many"] and t.missing("en") == []
    assert t.missing("ar", forms=True) == ["deep.x", "items.few", "items.many", "items.two", "items.zero", "reasons.rate.many"]
    assert t.missing("AR_eg", forms=True) == ["items.few", "items.many", "items.zero", "reasons.rate.many"]
    assert [t.choice("items", count, "ar-EG") for count in (1, 2, 3)] == ["1", "2", "n"]
    assert t.missing("ja", forms=True) == ["a", "deep.x", "reasons.rate", "reasons.rate.many"] and t.missing("en", forms=True) == []
    assert t.missing("fr") == t.missing("?") == whole and t.reason("rate", "ar") == "تمهل" and t.reason("rate.many", "ar") == "Too many"
    assert [t.choice("items", count, "ar") for count in (1, 2, 11)] == ["1", "n", "n"] and t.choice("items", 5, "ja") == "n"
    assert t.describe() == { "locales": ["ar", "ar-EG", "en", "ja"], "fallback": "en", "keys": 5 }

def test_a_folder_names_its_broken_file_and_keeps_the_held_catalogs ( tmp_path: Path ) -> None:

    good, bad = tmp_path / "good", tmp_path / "bad"

    good.mkdir()
    bad.mkdir()
    (good / "en.json").write_text('{"a": "A", "items": {"one": "1", "other": "n"}}')
    (good / "ar-EG.json").write_text('{"a": "first", "b": "kept"}')
    (good / "ar_EG.json").write_text('{"a": "second"}')
    (good / "notes.txt").write_text("ignored")

    t = Translate()

    assert t.load(good) == ("ar-EG", "en") and t.text("a", "ar-EG") == "second" and t.text("b", "ar-EG") == "kept" and t.generation() == 1

    broken: tuple[tuple[str, str | None, str, str], ...] = (
        ("en.json", "{", "translate.catalog", "is not valid JSON"),
        ("en.json", "[1]", "translate.catalog", "is not an object"),
        ("en.json", '"x"', "translate.catalog", "is not an object"),
        ("en.json", '{"a": [1]}', "translate.catalog", "a is not a text"),
        ("en.json", '{"a": {"b": true}}', "translate.catalog", "a.b is not a text"),
        ("en.json", None, "translate.catalog", "is not readable"),
        ("english language.json", "{}", "translate.locale", "is not a language tag"),
    )

    for name, body, reason, why in broken:

        file = bad / name

        if body is None: file.mkdir()
        else: file.write_text(body)

        with pytest.raises(Fault) as refused: t.load(good, bad)

        assert refused.value.code is Code.INTERNAL and refused.value.reason == reason and refused.value.errors == { name: [why] }
        assert t.generation() == 1 and t.text("a", "ar-EG") == "second" and t.locales() == ("ar-EG", "en")

        if body is None: file.rmdir()
        else: file.unlink()

    with pytest.raises(Fault) as refused: t.load(good, tmp_path / "none")

    assert refused.value.reason == "translate.folder" and refused.value.errors == { "folder": ["none"] }

    fresh = tmp_path / "fresh"

    fresh.mkdir()
    (fresh / "en.json").write_text('{"a": "changed", "items": "All"}')
    (bad / "ar.json").write_text('{"a": 1, "b": []}')

    with pytest.raises(Fault) as refused: t.load(fresh, bad)

    assert refused.value.errors == { "ar.json": ["b is not a text"] } and t.text("a", "en") == "A" and t.choice("items", 1, "en") == "1"
    assert t.catalog("en") == { "a": "A", "items.one": "1", "items.other": "n" } and t.generation() == 1

    (bad / "ar.json").unlink()

    assert t.load(fresh, bad) == ("ar-EG", "en") and t.text("a", "en") == "changed" and t.choice("items", 1, "en") == "All"

    with pytest.raises(Fault) as refused: Translate().load()

    assert refused.value.reason == "translate.fallback" and t.load(good, fallback="ar_eg") == ("ar-EG", "en") and t.fallback() == "ar-EG"
