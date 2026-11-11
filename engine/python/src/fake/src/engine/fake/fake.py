from collections.abc import Callable, Sequence
from decimal import Decimal
from ipaddress import IPv6Address
from typing import Any, cast

from engine.date import DateTime, Day, TimeDelta, UTC, date
from engine.error import Code, Fault
from engine.number import Money
from engine.rand import Rand
from engine.string import string
from .arch import (
    AGE, AGENTS, CARDS, COUNT, COUNTRIES, CURRENCIES, Country, DAY, DAYS, DIGITS, DOMAINS, DRIFT, EXTENSION, EXTENSIONS,
    FIRST, GENDERS, HANDLE, HEADS, JOBS, LANDS, LAST, LOCALES, MANY, NETS, PLACES, PREFIX, PRODUCTS, SPAN, STREETS,
    TAILS, TEXT, TRIES, UPPER, WORD, WORDS,
)
import inspect

class Fake:

    def __init__ ( self, seed: int | str | None = None ) -> None:

        self._rand   = Rand()
        self._seeded = False

        self.seed(seed)

    def seed ( self, value: int | str | None ) -> None:

        if value is not None and type(value) not in (int, str): raise self._refused_("seed", value)

        self._rand.seed(value)

        self._seeded = value is not None

    def rand ( self ) -> Rand:

        return self._rand

    def gender ( self ) -> str:

        return self._rand.choice(GENDERS)

    def first_name ( self, locale: str = "en", gender: str | None = None ) -> str:

        return self._rand.choice(FIRST[self._locale_(locale)][self._gender_(gender)])

    def last_name ( self, locale: str = "en" ) -> str:

        return self._rand.choice(LAST[self._locale_(locale)])

    def name ( self, locale: str = "en", gender: str | None = None ) -> str:

        return f"{self.first_name(locale, gender)} {self.last_name(locale)}"

    def username ( self, name: str | None = None ) -> str:

        return f"{self._handle_(name, '_')}{self._rand.integer(1, 9999)}"

    def email ( self, name: str | None = None ) -> str:

        return f"{self._handle_(name, '.')}{self._rand.integer(1, 999)}@{self._rand.choice(DOMAINS)}"

    def password ( self, length: int = 16 ) -> str:

        return self._rand.password(self._whole_(length, 8, COUNT, "length"))

    def phone ( self, country: str | None = None ) -> str:

        land = self._country_(country)

        return f"+{land.dial}{self._rand.choice(land.mobile)}{self._rand.string(land.digits, DIGITS)}"

    def person ( self, locale: str = "en", country: str | None = None ) -> dict[str, Any]:

        tongue, land = self._locale_(locale), self._country_(country)
        gender = self.gender()
        name   = self.name(tongue, gender)

        return {
            "name"    : name,
            "gender"  : gender,
            "email"   : self.email(name),
            "phone"   : self.phone(land.code),
            "city"    : self.city(tongue, land.code),
            "country" : land.code,
        }

    def job ( self, locale: str = "en" ) -> str:

        return self._rand.choice(JOBS[self._locale_(locale)])

    def company ( self, locale: str = "en" ) -> str:

        tongue = self._locale_(locale)

        return f"{self._rand.choice(HEADS[tongue])} {self._rand.choice(TAILS[tongue])}"

    def country ( self ) -> str:

        return self._rand.choice(COUNTRIES).code

    def country_name ( self, locale: str = "en", country: str | None = None ) -> str:

        tongue = self._locale_(locale)

        return self._country_(country).names[tongue]

    def city ( self, locale: str = "en", country: str | None = None ) -> str:

        tongue = self._locale_(locale)

        return self._rand.choice(self._country_(country).cities[tongue])

    def street ( self, locale: str = "en" ) -> str:

        tongue = self._locale_(locale)

        return f"{self._rand.integer(1, 200)} {self._rand.choice(STREETS[tongue])}"

    def postcode ( self ) -> str:

        return self._rand.string(5, DIGITS)

    def coordinates ( self, country: str | None = None ) -> tuple[float, float]:

        return self._near_(self._rand.choice(self._country_(country).spots))

    def address ( self, locale: str = "en", country: str | None = None ) -> dict[str, Any]:

        tongue, land = self._locale_(locale), self._country_(country)
        index  = self._rand.integer(0, len(land.spots) - 1)
        latitude, longitude = self._near_(land.spots[index])

        return {
            "street"    : self.street(tongue),
            "city"      : land.cities[tongue][index],
            "country"   : land.code,
            "postcode"  : self.postcode(),
            "latitude"  : latitude,
            "longitude" : longitude,
        }

    def product ( self, locale: str = "en" ) -> str:

        return self._rand.choice(PRODUCTS[self._locale_(locale)])

    def currency ( self ) -> str:

        return self._rand.choice(CURRENCIES)

    def money ( self, low: int = 100, high: int = 100_000, currency: str | None = None ) -> Money:

        if currency is not None and type(currency) is not str: raise self._refused_("currency", currency)

        return Money(self.integer(low, high), currency if currency is not None else self.currency())

    def card ( self ) -> str:

        return self._rand.choice(CARDS)

    def iban ( self, country: str | None = None ) -> str:

        land = self._country_(country)
        letters, digits = land.bank
        account = "".join(self._rand.choice(UPPER) for _ in range(letters)) + self._rand.string(digits, DIGITS)
        check   = 98 - int("".join(str(int(sign, 36)) for sign in f"{account}{land.code}00")) % 97

        return f"{land.code}{check:02d}{account}"

    def word ( self, locale: str = "en" ) -> str:

        return self._rand.choice(WORDS[self._locale_(locale)])

    def words ( self, count: int = 3, locale: str = "en" ) -> str:

        bank = WORDS[self._locale_(locale)]

        return " ".join(self._rand.choice(bank) for _ in range(self._whole_(count, 1, COUNT, "count")))

    def sentence ( self, words: int = 8, locale: str = "en" ) -> str:

        return f"{string.ucfirst(self.words(words, locale))}."

    def paragraph ( self, sentences: int = 3, locale: str = "en" ) -> str:

        tongue, size = self._locale_(locale), self._whole_(sentences, 1, COUNT, "count")

        return " ".join(self.sentence(self._rand.integer(5, 12), tongue) for _ in range(size))

    def title ( self, words: int = 3, locale: str = "en" ) -> str:

        return string.title(self.words(words, locale))

    def text ( self, limit: int = 200, locale: str = "en" ) -> str:

        tongue, room = self._locale_(locale), self._whole_(limit, 1, TEXT, "limit")
        parts, size  = list[str](), -1

        while size <= room:

            parts.append(self.sentence(self._rand.integer(5, 12), tongue))

            size += len(parts[-1]) + 1

        found = " ".join(parts)
        cut   = found[:room]

        return cut if found[room] == " " else cut.rpartition(" ")[0] or cut

    def slug ( self, words: int = 2 ) -> str:

        return string.slug(self.words(words))

    def domain ( self ) -> str:

        return f"{self.word()}.{self._rand.choice(DOMAINS)}"

    def url ( self ) -> str:

        return f"https://{self.domain()}/{self.slug()}"

    def ip ( self ) -> str:

        return f"{self._rand.choice(NETS)}.{self._rand.integer(1, 254)}"

    def ipv6 ( self ) -> str:

        return str(IPv6Address(PREFIX | int.from_bytes(self._rand.bytes(12))))

    def mac ( self ) -> str:

        raw = bytearray(self._rand.bytes(6))

        raw[0] = raw[0] & 0xFC | 0x02

        return raw.hex(":")

    def agent ( self ) -> str:

        return self._rand.choice(AGENTS)

    def color ( self ) -> str:

        return f"#{self._rand.hex(3)}"

    def file ( self, extension: str | None = None ) -> str:

        kind = self._rand.choice(EXTENSIONS) if extension is None else extension

        if type(kind) is not str or len(kind) > EXTENSION or not kind.isascii() or not kind.isalnum():

            raise self._refused_("extension", kind)

        return f"{self.slug()}.{kind.lower()}"

    def boolean ( self, truth: float = 0.5 ) -> bool:

        if type(truth) not in (int, float) or not 0 <= truth <= 1: raise self._refused_("chance", truth)

        return self._rand.chance(truth)

    def integer ( self, low: int = 0, high: int = 100 ) -> int:

        if type(low) is not int or type(high) is not int or low > high: raise self._refused_("range")

        return self._rand.integer(low, high)

    def decimal ( self, low: int = 0, high: int = 100, places: int = 2 ) -> Decimal:

        scale = 10 ** self._whole_(places, 0, PLACES, "places")
        whole = type(low) is int and type(high) is int

        if not whole or not -SPAN <= low <= high <= SPAN: raise self._refused_("range")

        return Decimal(f"{self._rand.integer(low * scale, high * scale)}E-{places}")

    def pick [T] ( self, items: Sequence[T] ) -> T:

        if not isinstance(cast("object", items), Sequence) or not items: raise self._refused_("items", items)

        return self._rand.choice(items)

    def uuid ( self ) -> str:

        return str(self._rand.uuid())

    def past ( self, days: int = 365 ) -> DateTime:

        return date.now() - TimeDelta(seconds=self._rand.integer(1, self._whole_(days, 1, DAYS, "days") * DAY))

    def future ( self, days: int = 365 ) -> DateTime:

        return date.now() + TimeDelta(seconds=self._rand.integer(1, self._whole_(days, 1, DAYS, "days") * DAY))

    def between ( self, start: DateTime, end: DateTime ) -> DateTime:

        sound = isinstance(cast("object", start), DateTime) and isinstance(cast("object", end), DateTime)

        if not sound or (start.utcoffset() is None) is not (end.utcoffset() is None): raise self._refused_("range")

        try: return self._within_(start, end, start.utcoffset() is not None)
        except OverflowError: raise self._refused_("range") from None

    def birthday ( self, low: int = 18, high: int = 80 ) -> Day:

        if type(low) is not int or type(high) is not int or not 0 <= low <= high <= AGE: raise self._refused_("age")

        now   = date.now()
        first = date.sub(now, years=high + 1).date() + TimeDelta(days=1)
        last  = date.sub(now, years=low).date()

        return first + TimeDelta(days=self._rand.integer(0, (last - first).days))

    def many [T] ( self, count: int, make: Callable[[], T], unique: bool = False ) -> list[T]:

        size, work = self._whole_(count, 0, MANY, "count"), self._maker_(make)

        if not unique: return [work() for _ in range(size)]

        found: dict[T, None] = {}
        tries = size * TRIES

        while len(found) < size:

            if tries == 0: raise self._refused_("unique")

            tries -= 1
            made   = work()

            try: found[made] = None
            except TypeError: raise self._refused_("unique", made) from None

        return list(found)

    def optional [T] ( self, make: Callable[[], T], chance: float = 0.5 ) -> T | None:

        work = self._maker_(make)

        return work() if self.boolean(chance) else None

    def describe ( self ) -> dict[str, Any]:

        return { "seeded": self._seeded, "locales": list(LOCALES), "countries": [land.code for land in COUNTRIES] }

    def _locale_ ( self, locale: str ) -> str:

        found = locale.replace("_", "-").partition("-")[0].lower() if type(locale) is str else ""

        if found not in LOCALES: raise self._refused_("locale", locale)

        return found

    def _gender_ ( self, gender: str | None ) -> str:

        if gender is None: return self._rand.choice(GENDERS)
        if type(gender) is not str or gender not in GENDERS: raise self._refused_("gender", gender)

        return gender

    def _country_ ( self, country: str | None ) -> Country:

        if country is None: return self._rand.choice(COUNTRIES)

        found = LANDS.get(country.upper()) if type(country) is str and country.isascii() else None

        if found is None: raise self._refused_("country", country)

        return found

    def _whole_ ( self, value: int, low: int, high: int, reason: str ) -> int:

        if type(value) is not int or not low <= value <= high: raise self._refused_(reason, value)

        return value

    def _maker_ [T] ( self, make: Callable[[], T] ) -> Callable[[], T]:

        if not callable(cast("object", make)) or inspect.iscoroutinefunction(make): raise self._refused_("make", make)

        return make

    def _handle_ ( self, name: str | None, separator: str ) -> str:

        if name is not None and type(name) is not str: raise self._refused_("name", name)

        return string.slug(string.ascii((name or self.name())[:WORD]), separator, HANDLE) or "user"

    def _within_ ( self, start: DateTime, end: DateTime, aware: bool ) -> DateTime:

        low, high = (start.astimezone(UTC), end.astimezone(UTC)) if aware else (start, end)

        if low > high: raise self._refused_("range")

        found = low + TimeDelta(microseconds=self._rand.integer(0, (high - low) // TimeDelta(microseconds=1)))

        return found.astimezone(start.tzinfo) if aware else found

    def _near_ ( self, spot: tuple[float, float] ) -> tuple[float, float]:

        latitude, longitude = spot

        return round(latitude + self._drift_(), 6), round(longitude + self._drift_(), 6)

    def _drift_ ( self ) -> float:

        return (self._rand.number() * 2 - 1) * DRIFT

    def _refused_ ( self, reason: str, *asked: object ) -> Fault:

        words = [item[:WORD] if type(item) is str else type(item).__name__ for item in asked]

        return Fault(Code.INTERNAL, reason=f"fake.{reason}", errors={ reason: words } if words else None)
