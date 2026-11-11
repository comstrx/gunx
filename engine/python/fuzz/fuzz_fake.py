from engine.date import DateTime, Day, TimeDelta, UTC, date
from engine.error import Code, Fault
from engine.fake import Fake
from engine.fake.arch import (
    AGE, COUNT, CURRENCIES, DAYS, DOMAINS, DRIFT, EXTENSIONS, GENDERS, LANDS, LOCALES, NETS, PLACES, SPAN, TEXT, WORD, WORDS,
)
from engine.number import Money
from engine.parse import parse
from collections.abc import Callable
from decimal import Decimal
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from ipaddress import IPv4Network, IPv6Network
from operator import methodcaller
import re

EXAMPLES = 1000
FROZEN   = DateTime(2028, 2, 29, 12, 30, tzinfo=UTC)
START    = DateTime(2001, 1, 1, tzinfo=UTC)
END      = DateTime(2031, 1, 1, tzinfo=UTC)
DOCS     = IPv6Network("2001:db8::/32")
TESTS    = tuple(IPv4Network(f"{net}.0/24") for net in NETS)
PLAIN    = frozenset("abcdefghijklmnopqrstuvwxyz0123456789")
TONGUE   = re.compile(r"(?is)(en|ar)([-_].*)?")
WILD     = st.text(st.characters(exclude_categories=()), max_size=80)
SEEDS    = st.one_of(st.integers(), WILD)
WHOLE    = st.one_of(st.integers(-3, 40), st.integers(COUNT - 4, COUNT + 4), st.integers())
SPANS    = st.one_of(st.integers(-50, 50), st.integers(-SPAN - 2, SPAN + 2), st.integers())
MOMENTS  = st.datetimes(timezones=st.one_of(st.none(), st.timezones()))
NOWS     = st.datetimes(min_value=DateTime(1900, 1, 1), max_value=DateTime(2400, 1, 1), timezones=st.just(UTC))
TONGUES  = st.sampled_from(LOCALES)
CODES    = st.sampled_from(tuple(LANDS))
STRAY    = st.one_of(
    st.none(), st.booleans(), st.integers(), st.floats(), WILD, st.binary(max_size=8), st.lists(st.integers(), max_size=3),
    st.dictionaries(st.text(max_size=2), st.integers(), max_size=2), st.sampled_from(["en", "ar", "EG", "sa", "male", "USD", "pdf"]),
    MOMENTS,
)
ARGUED   = (
    ("first_name", 2), ("last_name", 1), ("name", 2), ("username", 1), ("email", 1), ("password", 1), ("phone", 1),
    ("person", 2), ("job", 1), ("company", 1), ("country_name", 2), ("city", 2), ("street", 1), ("coordinates", 1),
    ("address", 2), ("product", 1), ("money", 3), ("iban", 1), ("word", 1), ("words", 2), ("sentence", 2), ("paragraph", 2),
    ("title", 2), ("text", 2), ("slug", 1), ("file", 1), ("boolean", 1), ("integer", 2), ("decimal", 3), ("pick", 1),
    ("past", 1), ("future", 1), ("between", 2), ("birthday", 2), ("many", 3), ("optional", 2), ("seed", 1),
)

def crowd ( made: Fake ) -> object:

    return made.many(6, made.uuid, unique=True)

def maybe ( made: Fake ) -> object:

    return made.optional(made.word, 0.5)

def window ( made: Fake ) -> object:

    return made.between(START, END)

DRAWS: tuple[Callable[[Fake], object], ...] = (
    methodcaller("gender"), methodcaller("first_name", "ar", "female"), methodcaller("last_name"), methodcaller("name", "ar"),
    methodcaller("username"), methodcaller("email"), methodcaller("password", 12), methodcaller("phone"), methodcaller("person"),
    methodcaller("job", "ar"), methodcaller("company"), methodcaller("country"), methodcaller("country_name", "ar"),
    methodcaller("city"), methodcaller("street", "ar"), methodcaller("postcode"), methodcaller("coordinates"),
    methodcaller("address", "ar"), methodcaller("product"), methodcaller("currency"), methodcaller("money"), methodcaller("card"),
    methodcaller("iban"), methodcaller("word"), methodcaller("words", 4, "ar"), methodcaller("sentence"), methodcaller("paragraph"),
    methodcaller("title"), methodcaller("text", 90), methodcaller("slug"), methodcaller("domain"), methodcaller("url"),
    methodcaller("ip"), methodcaller("ipv6"), methodcaller("mac"), methodcaller("agent"), methodcaller("color"),
    methodcaller("file"), methodcaller("boolean"), methodcaller("integer", -9, 9), methodcaller("decimal", 0, 9, 3),
    methodcaller("pick", "abcdef"), methodcaller("uuid"), methodcaller("past"), methodcaller("future"), methodcaller("birthday"),
    crowd, maybe, window,
)

def sound ( fault: Fault ) -> Fault:

    words = [word for held in (fault.errors or {}).values() for word in held]

    assert fault.reason is not None
    assert fault.reason.startswith(("fake.", "number.", "rand."))
    assert fault.code is (Code.BAD_REQUEST if fault.reason.startswith("number.") else Code.INTERNAL)
    assert all(len(word) <= WORD for word in words)

    return fault

def tried ( work: Callable[[], object] ) -> object:

    try: return work()
    except Fault as fault: return sound(fault)

def luhn ( number: str ) -> bool:

    digits = [int(sign) for sign in reversed(number)]

    return (sum(digits[0::2]) + sum(sum(divmod(digit * 2, 10)) for digit in digits[1::2])) % 10 == 0

def age ( born: Day, today: Day ) -> int:

    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

def refused ( found: object ) -> bool:

    return type(found) is Fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, STRAY, STRAY, STRAY)
def stray_arguments_are_refused ( seed: int | str, first: object, second: object, third: object ) -> None:

    made = Fake(seed)

    for verb, arity in ARGUED: tried(partial(getattr(made, verb), *(first, second, third)[:arity]))

    made.seed(seed)

    assert made.word() in WORDS["en"]
    assert made.describe() == { "seeded": True, "locales": list(LOCALES), "countries": list(LANDS) }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, st.lists(st.integers(0, len(DRAWS) - 1), max_size=40))
def seeded_draws_replay ( seed: int | str, picks: list[int] ) -> None:

    one, two = Fake(seed), Fake()

    two.seed(seed)
    date.freeze(FROZEN)

    try:

        first = [DRAWS[pick](one) for pick in picks]

        assert first == [DRAWS[pick](two) for pick in picks]

        one.seed(seed)

        assert first == [DRAWS[pick](one) for pick in picks]

    finally: date.freeze(None)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, TONGUES, CODES)
def values_are_well_formed ( seed: int | str, tongue: str, code: str ) -> None:

    made, land = Fake(seed), LANDS[code]
    host       = parse.ip(made.ip())

    assert parse.email(made.email()).domain in DOMAINS
    assert parse.hostname(made.domain()).partition(".")[2] in DOMAINS
    assert parse.url(made.url()).scheme == "https"
    assert any(host in net for net in TESTS)
    assert parse.ip(made.ipv6()) in DOCS
    assert len(parse.color(made.color())) == 4
    assert luhn(made.card())
    assert made.currency() in CURRENCIES
    assert made.gender() in GENDERS
    assert made.file().rpartition(".")[2] in EXTENSIONS

    mac, uuid, slug = made.mac(), made.uuid(), made.slug(3)

    assert parse.mac(mac) == mac
    assert int(mac[:2], 16) & 3 == 2
    assert parse.uuid(uuid) == uuid
    assert parse.slug(slug) == slug
    assert slug.count("-") == 2

    phone, iban = made.phone(code.lower()), made.iban(code)

    assert parse.phone(phone) == phone
    assert phone.startswith(f"+{land.dial}")
    assert len(phone) - 1 - len(land.dial) - land.digits in { len(prefix) for prefix in land.mobile }
    assert iban.startswith(code)
    assert len(iban) == 4 + sum(land.bank)
    assert int("".join(str(int(sign, 36)) for sign in iban[4:] + iban[:4])) % 97 == 1

    address = made.address(tongue, code)
    spot    = land.spots[land.cities[tongue].index(address["city"])]
    held    = parse.coordinates(f"{address['latitude']},{address['longitude']}")

    assert held == (address["latitude"], address["longitude"])
    assert abs(held[0] - spot[0]) <= DRIFT + 1e-9
    assert abs(held[1] - spot[1]) <= DRIFT + 1e-9
    assert made.city(tongue, code) in land.cities[tongue]
    assert made.country_name(tongue, code) == land.names[tongue]

    person = made.person(tongue, code)

    assert person["country"] == code
    assert person["gender"] in GENDERS
    assert parse.email(person["email"]).domain in DOMAINS
    assert parse.phone(person["phone"]).startswith(f"+{land.dial}")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, WILD, WILD)
def words_resolve_or_are_refused ( seed: int | str, name: str, word: str ) -> None:

    made = Fake(seed)
    user = made.username(name)
    mail = parse.email(made.email(name))

    assert set(user) <= PLAIN | { "_" }
    assert user[0] != "_"
    assert user[-1].isdigit()
    assert len(user) <= 36
    assert set(mail.local) <= PLAIN | { "." }
    assert mail.local[0] != "."
    assert ".." not in mail.local
    assert mail.domain in DOMAINS

    spoken = tried(partial(made.word, word))

    if TONGUE.fullmatch(word): assert spoken in WORDS[word[:2].lower()]
    else:

        assert type(spoken) is Fault
        assert spoken.reason == "fake.locale"
        assert spoken.errors == { "locale": [word[:WORD]] }

    landed = tried(partial(made.country_name, "en", word))

    if word.isascii() and word.upper() in LANDS: assert landed == LANDS[word.upper()].names["en"]
    else:

        assert type(landed) is Fault
        assert landed.reason == "fake.country"
        assert landed.errors == { "country": [word[:WORD]] }

    for tongue in LOCALES:

        for form in (tongue, tongue.upper(), f"{tongue}-{word}", f"{tongue.title()}_{word}"):

            assert made.word(form) in WORDS[tongue]

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, SPANS, SPANS, st.integers(-2, PLACES + 2))
def numbers_stay_in_range ( seed: int | str, low: int, high: int, places: int ) -> None:

    made  = Fake(seed)
    whole = tried(partial(made.integer, low, high))

    assert refused(whole) is (low > high)

    if type(whole) is int: assert low <= whole <= high

    money = tried(partial(made.money, low, high, "KWD"))

    assert refused(money) is (low > high)

    if type(money) is Money:

        assert low <= money.minor <= high
        assert money.currency == "KWD"

    exact = tried(partial(made.decimal, low, high, places))

    assert refused(exact) is not (0 <= places <= PLACES and -SPAN <= low <= high <= SPAN)

    if type(exact) is Decimal:

        assert low <= exact <= high
        assert exact.as_tuple().exponent == -places

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, WHOLE, TONGUES)
def texts_keep_their_size ( seed: int | str, count: int, tongue: str ) -> None:

    made, bank = Fake(seed), WORDS[tongue]
    sized      = 1 <= count <= COUNT
    words      = tried(partial(made.words, count, tongue))

    assert refused(words) is not sized

    if type(words) is str:

        assert len(words.split(" ")) == count
        assert set(words.split(" ")) <= set(bank)

    sentence = tried(partial(made.sentence, count, tongue))

    assert refused(sentence) is not sized

    if type(sentence) is str:

        assert sentence.endswith(".")
        assert sentence.count(" ") == count - 1

    title = tried(partial(made.title, count, tongue))

    if type(title) is str: assert len(title.split(" ")) == count

    paragraph = tried(partial(made.paragraph, min(count, 40), tongue))

    if type(paragraph) is str: assert paragraph.count(".") == min(count, 40)

    password = tried(partial(made.password, count))

    assert refused(password) is not (8 <= count <= COUNT)

    if type(password) is str: assert len(password) == count

    text = tried(partial(made.text, count * 7, tongue))

    assert refused(text) is not (1 <= count * 7 <= TEXT)

    if type(text) is str:

        assert 1 <= len(text) <= count * 7
        assert text == text.strip()
        assert count == 1 or all(word.rstrip(".").lower() in bank for word in text.split(" "))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, st.integers(-2, 60), st.integers(0, 40), st.one_of(st.floats(), st.floats(0, 1), st.integers(-1, 2)))
def crowds_keep_their_count ( seed: int | str, count: int, span: int, chance: float ) -> None:

    made  = Fake(seed)
    plain = tried(partial(made.many, count, made.word))

    assert refused(plain) is (count < 0)

    if type(plain) is list: assert len(plain) == count

    apart = tried(partial(made.many, count, partial(made.integer, 0, span), unique=True))

    assert refused(apart) is (count < 0 or count > span + 1)

    if type(apart) is list:

        assert len(apart) == len(set(apart)) == count
        assert all(0 <= item <= span for item in apart)

    if type(apart) is Fault and count >= 0: assert apart.reason == "fake.unique"

    truth = tried(partial(made.boolean, chance))
    found = tried(partial(made.optional, made.uuid, chance))

    assert refused(truth) is refused(found) is not (0 <= chance <= 1)

    if chance in (0, 1): assert truth is bool(chance)
    if chance == 1: assert type(found) is str
    if chance == 0: assert found is None

    assert refused(tried(partial(made.many, 2, list, unique=True)))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SEEDS, NOWS, st.integers(-2, 40_000), st.integers(-2, AGE + 2), st.integers(-2, AGE + 2), MOMENTS, MOMENTS)
def dates_stay_in_their_windows (
    seed: int | str, now: DateTime, days: int, low: int, high: int, start: DateTime, end: DateTime,
) -> None:

    made = Fake(seed)

    date.freeze(now)

    try:

        past, future, born = tried(partial(made.past, days)), tried(partial(made.future, days)), tried(partial(made.birthday, low, high))

    finally: date.freeze(None)

    assert refused(past) is refused(future) is not (1 <= days <= DAYS)

    if type(past) is DateTime:

        assert now - TimeDelta(days=days) <= past < now
        assert past.microsecond == now.microsecond

    if type(future) is DateTime:

        assert now < future <= now + TimeDelta(days=days)
        assert future.microsecond == now.microsecond

    assert refused(born) is not (0 <= low <= high <= AGE)

    if type(born) is Day: assert low <= age(born, now.date()) <= high

    aware = start.utcoffset() is not None
    edged = { start.year, end.year } & { 1, 9999 }
    found = tried(partial(made.between, start, end))

    if type(found) is Fault:

        assert found.reason == "fake.range"
        assert aware is not (end.utcoffset() is not None) or edged or (start.astimezone(UTC) > end.astimezone(UTC) if aware else start > end)

    if type(found) is DateTime and aware:

        assert found.tzinfo is start.tzinfo
        assert start.astimezone(UTC) <= found.astimezone(UTC) <= end.astimezone(UTC)

    if type(found) is DateTime and not aware:

        assert found.tzinfo is None
        assert start <= found <= end

stray_arguments_are_refused()
seeded_draws_replay()
values_are_well_formed()
words_resolve_or_are_refused()
numbers_stay_in_range()
texts_keep_their_size()
crowds_keep_their_count()
dates_stay_in_their_windows()

print(f"fuzz fake  examples={EXAMPLES * 8}  ok")
