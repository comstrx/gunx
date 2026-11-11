from collections.abc import Callable
from decimal import Decimal
from functools import partial
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network
from typing import Any, cast
from uuid import UUID

from engine.date import DateTime, Day, TimeDelta, UTC, date
from engine.error import Code, Fault
from engine.fake import Fake, fake
from engine.fake.arch import (
    AGENTS, CARDS, COUNTRIES, CURRENCIES, EXTENSIONS, FIRST, HEADS, JOBS, LANDS, LAST, NETS, PRODUCTS, STREETS, TAILS, WORDS,
)
from engine.number import Money
from engine.parse import parse
from engine.rand import Rand
from engine.validate import rules
import pytest, re

PLANS = {
    "EG": r"\+201[0125]\d{8}", "SA": r"\+9665[0345689]\d{7}", "AE": r"\+9715[024568]\d{7}", "QA": r"\+974(33|55|66|77)\d{6}",
    "JO": r"\+9627[789]\d{7}", "OM": r"\+9689[2569]\d{6}", "KW": r"\+965(50|55|60|66|90|99)\d{6}", "BH": r"\+9733[3469]\d{6}",
}
IBANS   = { "EG": 29, "SA": 24, "AE": 23, "QA": 29, "JO": 30, "OM": 23, "KW": 30, "BH": 22 }
MONIES  = { "EGP", "SAR", "AED", "QAR", "JOD", "OMR", "KWD", "BHD", "USD", "EUR" }
HOSTS   = ("example.com", "example.net", "example.org")
LOCALES = ("en", "ar")
PLAIN   = ("seed", "rand", "many", "optional", "pick", "between", "describe")
FROZEN  = DateTime(2028, 2, 29, 12, 30, tzinfo=UTC)
ROUNDS  = 300
REACH   = 0.05
MOST    = 100_000
NAMES   = {
    "EG": "Egypt", "SA": "Saudi Arabia", "AE": "United Arab Emirates", "QA": "Qatar", "JO": "Jordan", "OM": "Oman",
    "KW": "Kuwait", "BH": "Bahrain",
}
SPOTS   = {
    "Cairo": ("القاهرة", 30.04, 31.24), "Alexandria": ("الإسكندرية", 31.20, 29.92), "Giza": ("الجيزة", 30.01, 31.21),
    "Mansoura": ("المنصورة", 31.04, 31.38), "Riyadh": ("الرياض", 24.71, 46.68), "Jeddah": ("جدة", 21.49, 39.19),
    "Dammam": ("الدمام", 26.42, 50.09), "Medina": ("المدينة المنورة", 24.52, 39.57), "Dubai": ("دبي", 25.20, 55.27),
    "Abu Dhabi": ("أبوظبي", 24.45, 54.38), "Sharjah": ("الشارقة", 25.35, 55.42), "Doha": ("الدوحة", 25.29, 51.53),
    "Al Wakrah": ("الوكرة", 25.17, 51.60), "Amman": ("عمّان", 31.95, 35.91), "Irbid": ("إربد", 32.56, 35.85),
    "Aqaba": ("العقبة", 29.53, 35.01), "Muscat": ("مسقط", 23.59, 58.38), "Salalah": ("صلالة", 17.02, 54.09),
    "Kuwait City": ("مدينة الكويت", 29.38, 47.98), "Hawalli": ("حولي", 29.33, 48.03), "Manama": ("المنامة", 26.23, 50.59),
    "Riffa": ("الرفاع", 26.13, 50.55),
}

class Word(str):

    __slots__ = ()

def refused ( work: Callable[[], object], reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL and caught.value.reason == f"fake.{reason}"

    return caught.value

def luhn ( number: str ) -> bool:

    digits = [int(sign) for sign in reversed(number)]

    return (sum(digits[0::2]) + sum(sum(divmod(digit * 2, 10)) for digit in digits[1::2])) % 10 == 0

def checked ( iban: str ) -> bool:

    return int("".join(str(int(sign, 36)) for sign in iban[4:] + iban[:4])) % 97 == 1

def arabic ( text: str ) -> bool:

    return any("؀" <= sign <= "ۿ" for sign in text)

def near ( found: float, spot: float ) -> bool:

    return abs(found - spot) <= REACH + 1e-9 and round(found, 6) == found

def worded ( asked: object ) -> list[str]:

    return [asked if type(asked) is str else type(asked).__name__]

def tidy ( text: str ) -> bool:

    return text != "" and text == " ".join(text.split())

def least ( floor: int, roof: int ) -> int:

    return floor

def most ( floor: int, roof: int ) -> int:

    return roof

def planned ( phone: str ) -> list[str]:

    return [code for code, plan in PLANS.items() if re.fullmatch(plan, phone)]

async def unready () -> int:

    return 1

def test_a_seed_replays_every_draw () -> None:

    verbs = sorted(name for name in dir(Fake) if not name.startswith("_") and name not in PLAIN)

    assert len(verbs) == 45

    date.freeze(FROZEN)

    try:

        one, two, other = Fake("seed"), Fake("seed"), Fake("other")
        first = [getattr(one, verb)() for verb in verbs]

        assert first == [getattr(two, verb)() for verb in verbs] and first != [getattr(other, verb)() for verb in verbs]

        one.seed("seed")

        assert first == [getattr(one, verb)() for verb in verbs]

    finally: date.freeze(None)

    assert Fake(7).uuid() == Fake(7).uuid() != Fake(8).uuid() and Fake().uuid() != Fake().uuid()
    assert Fake(7).describe() == { "seeded": True, "locales": ["en", "ar"], "countries": list(PLANS) }
    assert not Fake().describe()["seeded"] and not Fake(None).describe()["seeded"] and Fake(0).describe()["seeded"]
    assert type(fake) is Fake and type(one.rand()) is Rand and one.rand() is one.rand() and fake.name()

    one.seed(3)

    kept = one.uuid()

    one.seed(3)

    for seed in (1.5, b"x", True, [1], (1,), object()):

        assert refused(partial(one.seed, cast("Any", seed)), "seed").errors == { "seed": [type(seed).__name__] }
        assert refused(partial(Fake, cast("Any", seed)), "seed").errors == { "seed": [type(seed).__name__] }

    assert one.describe()["seeded"] and one.uuid() == kept

    one.seed(None)

    assert not one.describe()["seeded"] and one.uuid() != kept

def test_names_follow_locale_and_gender () -> None:

    made = Fake("names")

    for locale in LOCALES:

        male, female = set(FIRST[locale]["male"]), set(FIRST[locale]["female"])

        assert not male & female and len(male) == len(female) == 12 and len(set(LAST[locale])) == 16

        for gender, names in (("male", male), ("female", female)):

            assert { made.first_name(locale, gender) for _ in range(ROUNDS) } == names

            for _ in range(ROUNDS // 10):

                first, _, last = made.name(locale, gender).partition(" ")

                assert first in names and last in LAST[locale]

        assert { made.first_name(locale) for _ in range(ROUNDS) } == male | female
        assert { made.last_name(locale) for _ in range(ROUNDS) } == set(LAST[locale])
        assert { made.name(locale).partition(" ")[0] for _ in range(ROUNDS) } == male | female
        assert { made.job(locale) for _ in range(ROUNDS) } == set(JOBS[locale])
        assert { made.product(locale) for _ in range(ROUNDS) } == set(PRODUCTS[locale])
        assert { made.company(locale) for _ in range(ROUNDS * 4) } == { f"{head} {tail}" for head in HEADS[locale] for tail in TAILS[locale] }

    assert { made.gender() for _ in range(ROUNDS) } == { "male", "female" }
    assert arabic(made.name("ar")) and not arabic(made.name()) and arabic(made.company("ar")) and arabic(made.job("ar"))
    assert made.first_name() in FIRST["en"]["male"] + FIRST["en"]["female"] and made.last_name() in LAST["en"]

    for locale in ("ar-EG", "ar_SA", "AR", "Ar-eg"): assert arabic(made.name(locale))
    for locale in ("en-US", "en_GB", "EN", "En"): assert made.last_name(locale) in LAST["en"]

    for tongue in ("fr", "", "arabic", "a", "-ar", " ar", "ar ", None, 5, b"ar", ["ar"], Word("ar")):

        assert refused(partial(made.name, cast("Any", tongue)), "locale").errors == { "locale": worded(tongue) }

    assert refused(partial(made.name, "x" * 5000), "locale").errors == { "locale": ["x" * 64] }

    takers = (
        "first_name", "last_name", "name", "person", "job", "company", "country_name", "city", "street", "address", "product",
        "word", "words", "sentence", "paragraph", "title", "text",
    )

    for verb in takers: refused(partial(getattr(made, verb), locale="fr"), "locale")

    for kind in ("Male", "", "x", 5, True, b"male", Word("male")):

        assert refused(partial(made.first_name, "en", cast("Any", kind)), "gender").errors == { "gender": worded(kind) }
        refused(partial(made.name, "ar", cast("Any", kind)), "gender")

def test_handles_are_plain_ascii () -> None:

    made = Fake("handles")

    for _ in range(ROUNDS):

        name = made.name(made.pick(LOCALES))
        username, email = made.username(name), made.email(name)
        local, _, host = email.rpartition("@")

        assert re.fullmatch(r"[a-z]+_[a-z]+[1-9]\d{0,3}", username), username
        assert re.fullmatch(r"[a-z]+\.[a-z]+[1-9]\d{0,2}", local) and host in HOSTS, email
        assert parse.email(email).domain == host and re.fullmatch(r"[a-z]+_[a-z]+[1-9]\d{0,3}", made.username())

        rules.check({ "email": made.email() }, { "email": "required|email" })

    assert { made.email().rpartition("@")[2] for _ in range(ROUNDS) } == set(HOSTS)
    assert max(int(made.username("x")[1:]) for _ in range(ROUNDS * 40)) > 9900
    assert max(int(made.email("x").partition("@")[0][1:]) for _ in range(ROUNDS * 20)) > 990
    assert min(int(made.username("x")[1:]) for _ in range(ROUNDS * 40)) >= 1
    assert all(int(made.username("x")[1:]) <= 9999 and int(made.email("x").partition("@")[0][1:]) <= 999 for _ in range(ROUNDS * 20))
    assert made.username("Omar Hassan").startswith("omar_hassan") and made.email("Omar Hassan").startswith("omar.hassan")
    assert made.username("عمر حسن").startswith("amr_hsn") and made.email("عمر حسن").startswith("amr.hsn")
    assert made.email("Ünïcödé Nàme").startswith("unicode.name") and made.username("Agent 007").startswith("agent_007")
    assert re.fullmatch(r"user\d+", made.username("!!!")) and re.fullmatch(r"user\d+@example\.(com|net|org)", made.email("___"))
    assert re.fullmatch(r"[a-z]+_[a-z]+\d+", made.username("")) and re.fullmatch(r"x{32}\d+", made.username("x" * 5000))
    assert re.fullmatch(r"(ab\.){10}ab\d+", made.email("ab " * 300).partition("@")[0])
    assert re.fullmatch(r"a{32}\d+", made.email("a" * 63 + " b").partition("@")[0])
    assert re.fullmatch(r"user\d+", made.username("!" * 64 + "omar")) and made.email("!" * 63 + "omar").startswith("o")
    assert re.fullmatch(r"(abc_){7}abc\d+", made.username("abc " * 20)) and re.fullmatch(r"omar\d+", made.username("_ _ omar _"))
    assert re.fullmatch(r"omar\d+", made.email(". . omar .").partition("@")[0])

    for asked in (5, b"omar", ["omar"], True, 1.5, Word("omar")):

        assert refused(partial(made.username, cast("Any", asked)), "name").errors == { "name": worded(asked) }
        assert refused(partial(made.email, cast("Any", asked)), "name").errors == { "name": worded(asked) }

    assert len(made.password()) == 16 and len(made.password(8)) == 8 and len(made.password(1000)) == 1000
    assert made.password() != made.password()

    for length in (7, 1001, 0, -1, True, 16.0, "16", None):

        refused(partial(made.password, cast("Any", length)), "length")

def test_phones_follow_each_numbering_plan () -> None:

    made = Fake("phones")

    assert [land.code for land in COUNTRIES] == list(PLANS) == list(LANDS)

    for code, plan in PLANS.items():

        land = LANDS[code]

        for _ in range(ROUNDS):

            phone = made.phone(code)

            assert re.fullmatch(plan, phone), phone
            assert parse.phone(phone) == phone

        assert { made.phone(code)[1 + len(land.dial):][:2] for _ in range(ROUNDS) } == set(land.mobile)
        assert re.fullmatch(plan, made.phone(code.lower())) and made.country_name("en", code.lower()) == land.names["en"]

    assert len(made.phone("EG")) == 13 and len({ made.phone("EG") for _ in range(ROUNDS) }) == ROUNDS
    assert all(len(planned(made.phone())) == 1 for _ in range(ROUNDS))
    assert { made.country() for _ in range(ROUNDS) } == set(PLANS) == { planned(made.phone())[0] for _ in range(ROUNDS) }

    rules.check({ "phone": made.phone() }, { "phone": "required|phone" })

    for country in ("US", "EGY", "", "E", " EG", 5, b"EG", ["EG"], True, Word("EG")):

        assert refused(partial(made.phone, cast("Any", country)), "country").errors == { "country": worded(country) }

    assert refused(partial(made.phone, "x" * 5000), "country").errors == { "country": ["x" * 64] }
    assert refused(partial(made.iban, "\u017fa"), "country").errors == { "country": ["\u017fa"] }
    assert made.iban("sa").startswith("SA") and made.phone("Eg").startswith("+20")

    for verb in ("phone", "person", "country_name", "city", "coordinates", "address", "iban"):

        refused(partial(getattr(made, verb), country="US"), "country")

def test_places_stay_coherent () -> None:

    made = Fake("places")

    banks = (FIRST["en"], FIRST["ar"], LAST, STREETS, PRODUCTS, WORDS, JOBS, HEADS, TAILS)
    spots = { city: (other, round(spot[0], 2), round(spot[1], 2)) for land in COUNTRIES for city, other, spot in zip(land.cities["en"], land.cities["ar"], land.spots, strict=True) }

    assert all(tidy(entry) for bank in banks for entries in bank.values() for entry in entries)
    assert all(len(set(entries)) == len(entries) for bank in banks for entries in bank.values())
    assert all(tidy(entry) for land in COUNTRIES for entries in land.cities.values() for entry in (*entries, *land.names.values()))
    assert { land.code: land.names["en"] for land in COUNTRIES } == NAMES and spots == SPOTS
    assert all(arabic(land.names["ar"]) and not arabic(land.names["en"]) for land in COUNTRIES)

    for land in COUNTRIES:

        assert len(land.cities["en"]) == len(land.cities["ar"]) == len(land.spots) >= 2

        for locale in LOCALES:

            cities = land.cities[locale]

            for _ in range(ROUNDS // 10):

                address = made.address(locale, land.code)
                latitude, longitude = land.spots[cities.index(address["city"])]
                number, _, street = address["street"].partition(" ")

                assert list(address) == ["street", "city", "country", "postcode", "latitude", "longitude"]
                assert address["country"] == land.code and re.fullmatch(r"[0-9]{5}", address["postcode"])
                assert near(address["latitude"], latitude) and near(address["longitude"], longitude)
                assert 1 <= int(number) <= 200 and street in STREETS[locale]

            assert { made.city(locale, land.code) for _ in range(ROUNDS // 3) } == set(cities)
            assert { made.address(locale, land.code)["city"] for _ in range(ROUNDS // 3) } == set(cities)
            assert made.country_name(locale, land.code) == land.names[locale]

            person = made.person(locale, land.code)

            assert list(person) == ["name", "gender", "email", "phone", "city", "country"] and person["country"] == land.code
            assert person["name"].partition(" ")[0] in FIRST[locale][person["gender"]] and person["city"] in cities
            assert re.fullmatch(PLANS[land.code], person["phone"]) and not person["email"].startswith("user")
            assert re.fullmatch(r"[a-z]+\.[a-z]+\d+@example\.(com|net|org)", person["email"])

        for _ in range(ROUNDS // 10):

            found = made.coordinates(land.code)

            assert any(near(found[0], spot[0]) and near(found[1], spot[1]) for spot in land.spots)
            assert parse.coordinates(f"{found[0]},{found[1]}") == found

    english = made.person()

    assert english["email"].startswith(english["name"].lower().replace(" ", ".")) and english["country"] in PLANS
    assert { made.person()["country"] for _ in range(ROUNDS) } == set(PLANS) == { made.address()["country"] for _ in range(ROUNDS) }
    assert { made.country_name() for _ in range(ROUNDS) } == { land.names["en"] for land in COUNTRIES }
    assert { made.city("ar") for _ in range(ROUNDS * 4) } == { city for land in COUNTRIES for city in land.cities["ar"] }
    assert { made.street().partition(" ")[2] for _ in range(ROUNDS) } == set(STREETS["en"])
    assert { int(made.street("ar").partition(" ")[0]) for _ in range(ROUNDS * 20) } == set(range(1, 201))
    assert len({ made.postcode() for _ in range(ROUNDS) }) > ROUNDS - 5 and arabic(made.street("ar"))
    assert set("".join(made.postcode() for _ in range(ROUNDS))) == set("0123456789")
    assert len({ made.coordinates("EG") for _ in range(ROUNDS) }) == ROUNDS
    assert { round(made.coordinates("OM")[0]) for _ in range(ROUNDS) } == { 24, 17 }
    assert len({ made.address("en", "OM")["latitude"] for _ in range(ROUNDS) }) > ROUNDS // 2
    assert len({ made.address("en", "OM")["longitude"] for _ in range(ROUNDS) }) > ROUNDS // 2

    for axis in (0, 1):

        drawn  = [made.coordinates("OM")[axis] for _ in range(ROUNDS * 4)]
        close  = [found - LANDS["OM"].spots[0][axis] for found in drawn if abs(found - LANDS["OM"].spots[0][axis]) <= REACH + 1e-9]

        assert min(close) < -REACH * 0.9 and max(close) > REACH * 0.9 and len(close) > ROUNDS
        assert any(round(found, 5) != found for found in drawn)

def test_money_cards_and_ibans_check_out () -> None:

    made = Fake("money")

    assert { made.card() for _ in range(ROUNDS) } == set(CARDS) and len(set(CARDS)) == 15
    assert all(luhn(card) and re.fullmatch(r"[0-9]{14,16}", card) for card in CARDS) and not luhn("4242424242424241")
    assert checked("GB82WEST12345698765432") and not checked("GB83WEST12345698765432")

    for code, size in IBANS.items():

        letters = LANDS[code].bank[0]

        for _ in range(ROUNDS // 5):

            iban = made.iban(code)

            assert len(iban) == size and iban.startswith(code) and checked(iban), iban
            assert re.fullmatch(rf"[A-Z]{{2}}[0-9]{{2}}[A-Z]{{{letters}}}[0-9]+", iban), iban

        assert len({ made.iban(code) for _ in range(ROUNDS // 5) }) == ROUNDS // 5

    assert { made.iban()[:2] for _ in range(ROUNDS) } == set(IBANS)
    assert { sign for _ in range(ROUNDS) for sign in made.iban("QA")[4:8] } == set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    assert { sign for _ in range(ROUNDS // 10) for sign in made.iban("SA")[4:] } == set("0123456789")
    assert { made.iban("EG")[2:4] for _ in range(ROUNDS * 10) } >= { f"{check:02d}" for check in range(2, 99) }
    assert set(CURRENCIES) == MONIES == { made.currency() for _ in range(ROUNDS) } == { made.money().currency for _ in range(ROUNDS) }

    for _ in range(ROUNDS):

        money = made.money(100, 200, "SAR")

        assert type(money) is Money and 100 <= money.minor <= 200 and money.currency == "SAR"
        assert 100 <= made.money().minor <= 100_000

    assert { made.money(1, 3).minor for _ in range(ROUNDS) } == { 1, 2, 3 }
    assert made.money(5, 5, "USD") == Money(5, "USD") and made.money(-9, -9, "JOD") == Money(-9, "JOD")
    assert max(made.money().minor for _ in range(ROUNDS)) > 90_000

    for low, high in ((2, 1), ("1", 2), (1, 2.0), (True, 2), (None, 5)):

        assert refused(partial(made.money, cast("Any", low), cast("Any", high)), "range").errors is None

    for currency in (5, b"USD", ["USD"], True, Word("USD")):

        assert refused(partial(made.money, 1, 2, cast("Any", currency)), "currency").errors == { "currency": [type(currency).__name__] }

    for stray in ("usd", "", "US"):

        with pytest.raises(Fault) as caught: made.money(1, 2, stray)

        assert caught.value.reason == "number.currency"

def test_words_come_from_one_bank () -> None:

    made = Fake("words")

    for locale in LOCALES:

        bank = set(WORDS[locale])

        assert len(bank) == 32 and not any(" " in word or "." in word for word in bank)
        assert { made.word(locale) for _ in range(ROUNDS * 2) } == bank

        for count in (1, 2, 7, 1000):

            words = made.words(count, locale).split(" ")

            assert len(words) == count and set(words) <= bank
            assert len(made.sentence(count, locale).split(" ")) == count == len(made.title(count, locale).split(" "))

        sentence = made.sentence(6, locale)

        assert sentence.endswith(".") and sentence.count(".") == 1 and { word.lower() for word in sentence[:-1].split(" ") } <= bank
        assert len(made.sentence(locale=locale).split(" ")) == 8 and len(made.words(locale=locale).split(" ")) == 3

        for count in (1, 4, 30):

            sentences = made.paragraph(count, locale).split(". ")

            assert len(sentences) == count and sentences[-1].endswith(".") and arabic(sentences[0]) is (locale == "ar")
            assert { word.rstrip(".").lower() for piece in sentences for word in piece.split(" ") } <= bank
            assert all(5 <= len(piece.split(" ")) <= 12 for piece in sentences)

        sizes = { len(piece.split(" ")) for piece in made.paragraph(1000, locale).split(". ") }

        assert sizes == set(range(5, 13)) and len(made.paragraph(locale=locale).split(". ")) == 3

        assert arabic(made.word(locale)) is (locale == "ar") and arabic(made.title(2, locale)) is (locale == "ar")

    sentence = made.sentence(5)

    assert sentence == sentence.capitalize() and sentence[0].isupper()
    assert made.title(4).istitle() and made.title() != made.title().lower() and len(made.title().split(" ")) == 3
    assert all(piece == piece.capitalize() for piece in made.paragraph(5).split(". "))

    for size in (1, 2, 5):

        slug = made.slug(size)

        assert parse.slug(slug) == slug and len(slug.split("-")) == size and set(slug.split("-")) <= set(WORDS["en"])

    assert len(made.slug().split("-")) == 2

    for amount in (0, 1001, -1, True, 1.0, "3", None):

        for verb in (made.words, made.sentence, made.paragraph, made.title, made.slug):

            assert refused(partial(verb, cast("Any", amount)), "count").errors == { "count": worded(amount) }

def test_text_fills_its_limit_with_whole_words ( monkeypatch: pytest.MonkeyPatch ) -> None:

    made = Fake("text")

    for locale in LOCALES:

        bank    = set(WORDS[locale])
        longest = max(len(word) for word in bank)

        for limit in (1, 2, 3, longest, longest + 1, 20, 200, 4000, 65_536):

            for _ in range(20):

                text = made.text(limit, locale)
                whole = { word.rstrip(".").lower() for word in text.split(" ") } <= bank

                assert 0 < len(text) <= limit and text == text.strip() and "  " not in text
                assert limit < longest or (whole and len(text) >= limit - longest - 2), text

        assert len(made.text(locale=locale)) <= 200 and arabic(made.text(50, locale)) is (locale == "ar")

    assert made.text(4000).count(". ") > 30 and made.text(4000)[0].isupper() and len(made.text(1)) == 1

    for room in (0, 65_537, -5, True, 2.5, "200", None):

        assert refused(partial(made.text, cast("Any", room)), "limit").errors == { "limit": worded(room) }

    calls = list[int]()

    def fixed ( words: int = 8, locale: str = "en" ) -> str:

        calls.append(words)

        return "aaaa."

    monkeypatch.setattr(made, "sentence", fixed)

    cuts = { 4: ("aaaa", 1), 5: ("aaaa.", 2), 6: ("aaaa.", 2), 10: ("aaaa.", 2), 11: ("aaaa. aaaa.", 3), 12: ("aaaa. aaaa.", 3) }

    for limit, (cut, drawn) in cuts.items():

        calls.clear()

        assert made.text(limit) == cut and len(calls) == drawn and all(5 <= words <= 12 for words in calls)

def test_network_values_stay_in_reserved_space () -> None:

    made = Fake("network")
    nets = [IPv4Network("192.0.2.0/24"), IPv4Network("198.51.100.0/24"), IPv4Network("203.0.113.0/24")]
    last = set[int]()

    for _ in range(ROUNDS * 10):

        ip = parse.ip(made.ip())

        assert isinstance(ip, IPv4Address) and any(ip in net for net in nets)

        last.add(int(ip) & 0xFF)

    assert last == set(range(1, 255)) and { made.ip().rpartition(".")[0] for _ in range(ROUNDS) } == set(NETS)

    firsts = set[int]()

    for _ in range(ROUNDS):

        drawn = made.ipv6()
        six   = parse.ip(drawn)
        mac   = made.mac()

        assert isinstance(six, IPv6Address) and six in IPv6Network("2001:db8::/32") and six.compressed == drawn
        assert re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", mac) and parse.mac(mac) == mac and int(mac[:2], 16) & 0x03 == 0x02

        firsts.add(int(mac[:2], 16))

        domain = made.domain()
        url    = parse.url(made.url())
        color  = made.color()
        name, _, kind = made.file().rpartition(".")

        assert parse.hostname(domain) == domain and domain.partition(".")[0] in WORDS["en"] and domain.partition(".")[2] in HOSTS
        assert url.scheme == "https" and url.host.partition(".")[2] in HOSTS and parse.slug(url.path[1:]) == url.path[1:]
        assert url.port is None and url.query == "" and url.user is None and url.path.count("-") == 1
        assert re.fullmatch(r"#[0-9a-f]{6}", color) and parse.color(color)[3] == 255
        assert kind in EXTENSIONS and parse.slug(name) == name and name.count("-") == 1
        assert made.agent() in AGENTS

    assert len(firsts) == 64 and len({ made.ipv6() for _ in range(ROUNDS) }) == ROUNDS == len({ made.mac() for _ in range(ROUNDS) })
    assert len({ int(IPv6Address(made.ipv6())) >> 64 & 0xFFFFFFFF for _ in range(ROUNDS) }) == ROUNDS
    assert len({ int(IPv6Address(made.ipv6())) & 0xFFFFFFFF for _ in range(ROUNDS) }) == ROUNDS
    assert len({ int(IPv6Address(made.ipv6())) >> 88 & 0xFF for _ in range(ROUNDS) }) > 100
    assert { made.agent() for _ in range(ROUNDS) } == set(AGENTS) and all(agent.startswith("Mozilla/5.0 (") for agent in AGENTS)
    assert { made.file().rpartition(".")[2] for _ in range(ROUNDS) } == set(EXTENSIONS) and len(AGENTS) == 5
    assert { made.domain().partition(".")[2] for _ in range(ROUNDS) } == set(HOSTS)
    assert len({ made.color() for _ in range(ROUNDS) }) == ROUNDS
    assert made.file("PDF").endswith(".pdf") and made.file("7z").endswith(".7z") and made.file("a" * 8).endswith("." + "a" * 8)

    for extension in ("p.d", "", "a" * 9, "é", "a b", "tar/gz", "٣", 5, b"pdf", True, Word("pdf")):

        assert refused(partial(made.file, cast("Any", extension)), "extension").errors == { "extension": worded(extension) }

def test_scalars_respect_their_bounds () -> None:

    made = Fake("scalars")

    assert not any(made.boolean(0) for _ in range(ROUNDS)) and all(made.boolean(1) for _ in range(ROUNDS))
    assert not any(made.boolean(0.0) for _ in range(ROUNDS)) and all(made.boolean(1.0) for _ in range(ROUNDS))
    assert { made.boolean() for _ in range(ROUNDS) } == { True, False }
    assert 0.25 < sum(made.boolean(0.3) for _ in range(4000)) / 4000 < 0.35
    assert 0.45 < sum(made.boolean() for _ in range(4000)) / 4000 < 0.55

    for truth in (-0.1, 1.1, float("nan"), float("inf"), True, "0.5", None, Decimal("0.5")):

        assert refused(partial(made.boolean, cast("Any", truth)), "chance").errors == { "chance": worded(truth) }

    assert { made.integer(1, 3) for _ in range(ROUNDS) } == { 1, 2, 3 } and made.integer(5, 5) == 5 and made.integer(-3, -3) == -3
    assert { made.integer() for _ in range(ROUNDS * 20) } == set(range(101))
    assert 10 ** 40 <= made.integer(10 ** 40, 10 ** 40 + 1) <= 10 ** 40 + 1

    for low, high in ((2, 1), (1.0, 2), (1, "2"), (True, 2), (1, True), (None, 1), (1, None)):

        assert refused(partial(made.integer, cast("Any", low), cast("Any", high)), "range").errors is None

    for places in (0, 2, 12):

        for _ in range(ROUNDS):

            drawn = made.decimal(-5, 5, places)

            assert type(drawn) is Decimal and -5 <= drawn <= 5 and drawn.as_tuple().exponent == -places

    assert made.decimal(7, 7, 3) == Decimal("7.000") and str(made.decimal(7, 7, 3)) == "7.000" and str(made.decimal(7, 7, 0)) == "7"
    assert { made.decimal(0, 1, 1) for _ in range(ROUNDS) } == { Decimal(tenth) / 10 for tenth in range(11) }
    assert { made.decimal(-1, 0, 1) for _ in range(ROUNDS) } == { -Decimal(tenth) / 10 for tenth in range(11) }
    assert made.decimal(10 ** 15, 10 ** 15, 12) == 10 ** 15 and made.decimal(-10 ** 15, -10 ** 15) == -10 ** 15
    assert all(0 <= made.decimal() <= 100 and made.decimal().as_tuple().exponent == -2 for _ in range(ROUNDS))
    assert max(made.decimal() for _ in range(ROUNDS)) > 95

    for floor, roof in ((2, 1), (0, 10 ** 15 + 1), (-10 ** 15 - 1, 0), (0.5, 1), (0, 1.5), (True, 1), (0, True), ("0", 1), (0, None)):

        assert refused(partial(made.decimal, cast("Any", floor), cast("Any", roof)), "range").errors is None

    for scale in (-1, 13, True, 2.0, "2", None):

        assert refused(partial(made.decimal, 0, 1, cast("Any", scale)), "places").errors == { "places": worded(scale) }

    assert { made.pick([1, 2, 3]) for _ in range(ROUNDS) } == { 1, 2, 3 } and made.pick("x") == "x" and made.pick((7,)) == 7
    assert { made.pick(range(3)) for _ in range(ROUNDS) } == { 0, 1, 2 } and made.pick(b"a") == 97

    strays: tuple[object, ...] = ([], (), "", b"", range(0), { 1 }, { "a": 1 }, 5, None, iter([1]), frozenset({ 1 }))

    for stray in strays: refused(partial(made.pick, cast("Any", stray)), "items")

    assert refused(partial(made.pick, cast("Any", { 1 })), "items").errors == { "items": ["set"] }

    uuids = [made.uuid() for _ in range(ROUNDS)]

    assert len(set(uuids)) == ROUNDS and all(parse.uuid(found) == found and UUID(found).version == 4 for found in uuids)

def test_dates_stay_inside_their_windows ( monkeypatch: pytest.MonkeyPatch ) -> None:

    made = Fake("dates")

    date.freeze(FROZEN)

    try:

        for days in (1, 30, 36_500):

            for _ in range(ROUNDS):

                assert FROZEN - TimeDelta(days=days) <= made.past(days) < FROZEN
                assert FROZEN < made.future(days) <= FROZEN + TimeDelta(days=days)

        pasts   = [made.past(1) for _ in range(ROUNDS * 10)]
        futures = [made.future(1) for _ in range(ROUNDS * 10)]

        assert min(pasts) < FROZEN - TimeDelta(hours=23, minutes=50) and max(pasts) > FROZEN - TimeDelta(minutes=10)
        assert max(futures) > FROZEN + TimeDelta(hours=23, minutes=50) and min(futures) < FROZEN + TimeDelta(minutes=10)
        assert made.past().tzinfo is UTC and made.future().tzinfo is UTC and all(found.microsecond == 0 for found in pasts)
        assert FROZEN - TimeDelta(days=365) <= made.past() and made.future() <= FROZEN + TimeDelta(days=365)
        assert max(FROZEN - made.past() for _ in range(ROUNDS)) > TimeDelta(days=330)
        assert max(made.future() - FROZEN for _ in range(ROUNDS)) > TimeDelta(days=330)

        edge = Fake("edges")

        monkeypatch.setattr(edge.rand(), "integer", least)

        assert edge.past(2) == FROZEN - TimeDelta(seconds=1) and edge.future(2) == FROZEN + TimeDelta(seconds=1)
        assert edge.email("x").startswith("x1@") and edge.username("x") == "x1" and edge.street().startswith("1 ")
        assert edge.ip().endswith(".1") and len(edge.paragraph(1).split(" ")) == 5 == len(edge.text(4000).split(". ")[0].split(" "))

        monkeypatch.setattr(edge.rand(), "integer", most)

        assert edge.past(2) == FROZEN - TimeDelta(days=2) and edge.future(2) == FROZEN + TimeDelta(days=2)
        assert edge.past(36_500) == FROZEN - TimeDelta(days=36_500) and edge.future(1) == FROZEN + TimeDelta(hours=24)
        assert edge.email("x").startswith("x999@") and edge.username("x") == "x9999" and edge.street().startswith("200 ")
        assert edge.ip().endswith(".254") and len(edge.paragraph(1).split(" ")) == 12 == len(edge.text(4000).split(". ")[0].split(" "))

        for span in (0, -1, 36_501, True, 1.5, "1", None):

            refused(partial(made.past, cast("Any", span)), "days")
            refused(partial(made.future, cast("Any", span)), "days")

        start, end = FROZEN, FROZEN + TimeDelta(microseconds=3)
        naive = DateTime(2020, 1, 1)
        cairo = FROZEN.astimezone(date.zone("Africa/Cairo"))

        assert { made.between(start, end) for _ in range(ROUNDS) } == { start + TimeDelta(microseconds=step) for step in range(4) }
        assert made.between(start, start) == start and made.between(naive, naive) == naive
        assert all(naive <= made.between(naive, naive + TimeDelta(days=1)) <= naive + TimeDelta(days=1) for _ in range(ROUNDS))
        assert made.between(naive, naive + TimeDelta(days=1)).tzinfo is None
        assert all(cairo <= made.between(cairo, FROZEN + TimeDelta(hours=1)) <= FROZEN + TimeDelta(hours=1) for _ in range(ROUNDS))
        assert made.between(cairo, FROZEN + TimeDelta(hours=1)).utcoffset() == cairo.utcoffset()

        berlin = date.zone("Europe/Berlin")
        summer = DateTime(2026, 10, 25, 2, 30, tzinfo=berlin)
        winter = DateTime(2026, 10, 25, 1, 30, tzinfo=UTC)
        folded = [made.between(summer, winter) for _ in range(ROUNDS)]

        assert summer.utcoffset() == TimeDelta(hours=2) and winter - summer == TimeDelta(hours=1)
        assert all(found.tzinfo is berlin and summer.astimezone(UTC) <= found.astimezone(UTC) <= winter for found in folded)
        assert { found.utcoffset() for found in folded } == { TimeDelta(hours=1), TimeDelta(hours=2) }

        dusk, dawn = DateTime(2026, 10, 25, tzinfo=berlin), DateTime(2026, 10, 25, 6, tzinfo=berlin)
        night      = [made.between(dusk, dawn).astimezone(UTC) for _ in range(ROUNDS)]

        assert max(night) - min(night) > TimeDelta(hours=6, minutes=30)
        assert all(DateTime(2026, 10, 24, 22, tzinfo=UTC) <= found <= DateTime(2026, 10, 25, 5, tzinfo=UTC) for found in night)

        refused(partial(made.between, DateTime.min.replace(tzinfo=date.zone("Asia/Tokyo")), FROZEN), "range")
        refused(partial(made.between, FROZEN, DateTime.max.replace(tzinfo=date.zone("America/Lima"))), "range")

        wide = [made.between(naive, naive + TimeDelta(days=1000)) for _ in range(ROUNDS)]

        assert min(wide) < naive + TimeDelta(days=20) and max(wide) > naive + TimeDelta(days=980)

        for first, second in ((end, start), (naive, FROZEN), (FROZEN, naive), (FROZEN.date(), FROZEN), (FROZEN, FROZEN.date()), ("2020", FROZEN), (None, FROZEN), (FROZEN, None), (0, 1)):

            assert refused(partial(made.between, cast("Any", first), cast("Any", second)), "range").errors is None

        for low, high in ((18, 80), (0, 0), (30, 30), (0, 120), (120, 120), (5, 6)):

            ages = [date.age(made.birthday(low, high)) for _ in range(ROUNDS * 4)]

            assert min(ages) == low and max(ages) == high

        born = { made.birthday(30, 30) for _ in range(6000) }

        assert min(born) == Day(1997, 3, 1) and max(born) == Day(1998, 2, 28) and len(born) == 365
        assert type(made.birthday()) is Day and 18 <= date.age(made.birthday()) <= 80

        date.freeze(DateTime(2027, 3, 1, tzinfo=UTC))

        born = { made.birthday(30, 30) for _ in range(6000) }

        assert min(born) == Day(1996, 3, 2) and max(born) == Day(1997, 3, 1) and len(born) == 365
        assert { made.birthday(0, 0) for _ in range(6000) } == { Day(2026, 3, 2) + TimeDelta(days=step) for step in range(365) }

        for young, old in ((-1, 5), (5, 2), (0, 121), (True, 5), (1.0, 5), (18, None), (None, 80), (18, "80"), (0, True)):

            assert refused(partial(made.birthday, cast("Any", young), cast("Any", old)), "age").errors is None

    finally: date.freeze(None)

    assert made.past(1) < date.now() < made.future(1) and 18 <= date.age(made.birthday()) <= 80

def test_many_and_optional_wrap_any_maker () -> None:

    made = Fake("many")

    assert made.many(0, made.uuid) == [] and made.many(0, made.uuid, unique=True) == [] and len(made.many(50, made.uuid)) == 50
    assert sorted(made.many(15, made.card, unique=True)) == sorted(CARDS)
    assert made.many(3, partial(made.pick, [7])) == [7, 7, 7] and made.many(2, list) == [[], []]
    assert made.many(1, partial(made.pick, [7]), unique=True) == [7] and len(made.many(MOST, made.gender)) == MOST

    drawn = made.many(45, partial(made.integer, 1, 50), unique=True)

    assert len(drawn) == 45 == len(set(drawn)) and set(drawn) <= set(range(1, 51)) and drawn != sorted(drawn)

    made.seed("order")

    plain = made.many(200, partial(made.integer, 1, 50))

    made.seed("order")

    assert made.many(45, partial(made.integer, 1, 50), unique=True) == list(dict.fromkeys(plain))[:45]

    calls = list[int]()

    assert refused(partial(made.many, 2, partial(calls.append, 1), unique=True), "unique").errors is None and len(calls) == 64
    assert refused(partial(made.many, 16, made.card, unique=True), "unique").errors is None
    assert refused(partial(made.many, 1, list, unique=True), "unique").errors == { "unique": ["list"] }

    for count in (-1, MOST + 1, True, 1.0, "3", None):

        assert refused(partial(made.many, cast("Any", count), made.uuid), "count").errors == { "count": worded(count) }

    for make in (None, 5, "uuid", unready, partial(unready)):

        assert refused(partial(made.many, 1, cast("Any", make)), "make").errors == { "make": worded(make) }
        refused(partial(made.optional, cast("Any", make)), "make")
        refused(partial(made.optional, cast("Any", make), 0), "make")

    def broken () -> int:

        raise TypeError("maker")

    with pytest.raises(TypeError, match="maker"): made.many(1, broken)
    with pytest.raises(TypeError, match="maker"): made.many(1, broken, unique=True)
    with pytest.raises(TypeError, match="maker"): made.optional(broken, 1)

    calls.clear()

    assert made.optional(partial(calls.append, 1), 0) is None and calls == [] and made.optional(broken, 0) is None
    assert made.optional(partial(made.pick, [7]), 1) == 7 and made.optional(made.uuid, 0) is None
    assert { made.optional(partial(made.pick, [7])) for _ in range(ROUNDS) } == { None, 7 }
    assert 0.15 < sum(made.optional(partial(made.pick, [1]), 0.2) or 0 for _ in range(4000)) / 4000 < 0.25

    for chance in (2, -1, float("nan"), True, "1", None): refused(partial(made.optional, made.uuid, cast("Any", chance)), "chance")
