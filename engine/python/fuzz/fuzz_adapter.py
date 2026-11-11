from engine.adapter import Adapter, Manager, Receipt
from engine.error import Code, Fault
from engine.log import log
from collections.abc import Awaitable, Callable, Sequence
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any, ClassVar, cast, override
import asyncio, math

type Mark = tuple[str, str]
type Note = tuple[str, str, bool]
type Step = tuple[str, int, bool]
type Verdict = tuple[str, dict[str, list[str]]]

EXAMPLES = 800
WORD     = 64
ROOT     = 32
LOWER    = "abcdefghijklmnopqrstuvwxyz"
DIGITS   = "0123456789"
HEAD     = frozenset(LOWER + LOWER.upper() + DIGITS)
BODY     = HEAD | frozenset("_.:-")
STEM     = frozenset(LOWER + DIGITS + "_")
GAPS     = " \t\n\r\v\f\x1c\x1d\x1e\x1f"
FOLD     = str.maketrans(LOWER.upper(), LOWER)
ACCEPTED = ("accepted", "sent", "queued", "delivered", "ok")
POOL     = ("owl", "hawk", "SES", "gpt-4o")
ABLE     = ("send", "track", "bulk")
MODES    = ("ok", "ok", "late", "raises", "odd", "blunt", "drops", "stopped")
FAILED   = { "raises": "OSError", "odd": "Strange", "blunt": "TypeError" }
EMPTY    = (bytes, bytearray, list, tuple, set, frozenset, dict)

class Strange ( Exception ):

    pass

class Odd:

    @override
    def __eq__ ( self, other: object ) -> bool: raise ValueError("ambiguous")

    @override
    def __hash__ ( self ) -> int: return 1

class Word ( str ):

    __slots__ = ()

class Closer ( Adapter ):

    family = "mail"
    mode   : ClassVar[str] = "ok"
    told   : ClassVar[list[str]] = []
    mail   : ClassVar[Manager[Adapter] | None] = None

    @override
    async def close ( self ) -> None:

        self.told.append(self.name)

        if self.mode == "late": await asyncio.sleep(0)
        if self.mode == "drops": self.drop()
        if self.mode in RAISED: raise RAISED[self.mode]

    def drop ( self ) -> None:

        mail = self.mail

        if mail is None: return

        for name in mail.names():

            if name not in (self.name, "extra"): mail.forget(name)

        mail.use(EXTRA)

class Shelf:

    def __init__ ( self ) -> None:

        self.order: list[str] = []
        self.held: dict[str, Adapter] = {}
        self.default: str | None = None

    def use ( self, adapter: Adapter, first: bool ) -> bool:

        name     = adapter.name
        replaced = name in self.held and self.held[name] is not adapter

        if name not in self.held: self.order.append(name)

        self.held[name] = adapter

        if first or self.default is None: self.default = name

        return replaced

    def forget ( self, name: object ) -> bool:

        if type(name) is not str or name not in self.order: return False

        self.order.remove(name)
        del self.held[name]

        if self.default == name: self.default = self.order[0] if self.order else None

        return True

    def drop ( self, keep: str ) -> None:

        for name in sorted(self.order):

            if name not in (keep, "extra"): self.forget(name)

        self.use(EXTRA, first=False)

    def find ( self, asked: object ) -> Adapter | str:

        chosen: object = None

        if asked is None or (type(asked) is str and not asked): chosen = self.default
        elif type(asked) is str: chosen = asked

        if isinstance(chosen, str) and chosen in self.held: return self.held[chosen]

        return ("No mail adapter " + ("" if asked is None else worded(asked))).strip()

    def clear ( self ) -> None:

        self.order   = []
        self.held    = {}
        self.default = None

def blunt ( self: Closer ) -> None:

    self.told.append(self.name)

def made ( family: object, name: object, able: object, mode: str = "ok" ) -> Adapter:

    declared = { "family": family, "name": name, "capabilities": able, "mode": mode }

    if mode == "blunt": declared["close"] = blunt

    return cast("Adapter", type("Made", (Closer,), declared)())

RAISED: dict[str, type[BaseException]] = { "raises": OSError, "odd": Strange, "stopped": asyncio.CancelledError }
EXTRA    = made("mail", "extra", frozenset({ "send" }))
STOCK    = tuple(made("mail", name, frozenset(able)) for name in POOL for able in (ABLE[:1], ABLE[1:]))
ASKS: tuple[object, ...] = (*POOL, "falcon", "", None, 5, Word("owl"))
TEXTS    = st.one_of(
    st.sampled_from(["", " ", "mail", "Mail", "owl", "hawk", "falcon", "send", "track", "SES", "gpt-4o", "eu.west:1", "mail_2"]),
    st.sampled_from(["-x", "a b", "owl\n", "9", "n" * WORD, "n" * (WORD + 1), "m" * ROOT, "m" * (ROOT + 1), "x" * 5000, "\u00e9"]),
    st.text(alphabet="azAZ09_.:- \n/\u00e9", max_size=5),
)
JUNK: st.SearchStrategy[Any] = st.one_of(
    st.none(), st.booleans(), st.integers(-2, 2), st.sampled_from([0.0, 1.5, math.nan, math.inf, 10 ** 5000]),
    st.binary(max_size=3), st.binary(max_size=2).map(bytearray), st.lists(TEXTS, max_size=2), st.lists(TEXTS, max_size=2).map(tuple),
    st.sets(TEXTS, max_size=2), st.frozensets(TEXTS, max_size=2), st.dictionaries(TEXTS, st.integers(0, 1), max_size=2),
    st.builds(Odd), TEXTS.map(Word), st.sampled_from([object(), Adapter, int, blunt]),
)
WILD: st.SearchStrategy[Any] = st.one_of(TEXTS, JUNK)
FAMILIES = st.one_of(st.just("mail"), st.just("mail"), WILD)
TITLES   = st.one_of(st.sampled_from(POOL), st.text(alphabet=sorted(BODY), min_size=1, max_size=WORD + 2), WILD)
ABLES    = st.one_of(
    st.frozensets(st.sampled_from(ABLE)), st.frozensets(st.one_of(TEXTS, TEXTS.map(Word), st.integers(0, 2)), max_size=3), WILD,
)
STEPS    = st.lists(st.tuples(
    st.sampled_from(["use", "use", "use", "forget", "get", "clear", "close"]), st.integers(0, len(STOCK) - 1), st.booleans(),
), max_size=14)
WANTED   = st.dictionaries(st.text(alphabet="ab_", min_size=1, max_size=3), WILD, max_size=6)
PADS     = st.sampled_from(["", "", " ", "\n", "\t ", "\x1f", "\u00a0", "\u2003"])
WORDS    = st.sampled_from([*ACCEPTED, "failed", "sen", "sentt", "", "o k", "\u017fent", "o\u212a", "rejected"])
CASES    = st.sampled_from([str.lower, str.upper, str.title, str.swapcase])
RAW      = st.dictionaries(st.text(max_size=3), st.integers(0, 3), max_size=3)
loop     = asyncio.new_event_loop()

log.setup("debug", "json", Path("/dev/null"))

def tried ( work: Callable[[], Any] ) -> Any:

    try: return work()
    except Fault as fault: return fault

def run ( work: Awaitable[int] ) -> int | None:

    try: return loop.run_until_complete(work)
    except asyncio.CancelledError: return None

def refused ( found: object, reason: str, errors: object = None ) -> bool:

    return isinstance(found, Fault) and found.code is Code.INTERNAL and found.reason == reason and found.errors == errors

def worded ( value: object ) -> str:

    return value[:WORD] if type(value) is str else type(value).__name__

def rooted ( family: object ) -> bool:

    if type(family) is not str or not 0 < len(family) <= ROOT: return False

    return family[0] in LOWER and all(letter in STEM for letter in family)

def titled ( name: object ) -> bool:

    if type(name) is not str or not 0 < len(name) <= WORD: return False

    return name[0] in HEAD and all(letter in BODY for letter in name)

def listed ( able: object ) -> bool:

    if not isinstance(able, frozenset): return False

    return all(type(word) is str and 0 < len(word) <= WORD for word in able)

def blank ( value: object ) -> bool:

    if value is None: return True
    if isinstance(value, str): return all(letter.isspace() for letter in value)

    return isinstance(value, EMPTY) and len(value) == 0

def settled ( status: object ) -> bool:

    if not isinstance(status, str) or any(ord(letter) > 127 for letter in status): return False

    return status.strip(GAPS).translate(FOLD) in ACCEPTED

def able ( adapter: Adapter, value: object ) -> bool:

    return isinstance(value, str) and any(value == word for word in adapter.capabilities)

def judged ( family: object, name: object, able: object ) -> Verdict | None:

    if type(family) is not str or family != "mail": return "mail.family", { "family": [worded(family)] }
    if not titled(name): return "mail.name", { "name": [worded(name)] }
    if not listed(able): return "mail.capabilities", { "name": [cast("str", name)] }

    return None

def same ( mail: Manager[Adapter], shelf: Shelf ) -> None:

    names  = sorted(shelf.order)
    matrix = { name: sorted(shelf.held[name].capabilities) for name in names }

    assert mail.names() == tuple(names)
    assert list(mail.matrix()) == names
    assert mail.matrix() == matrix
    assert mail.default() == shelf.default
    assert mail.ready() is bool(names)
    assert mail.describe() == { "family": "mail", "default": shelf.default, "adapters": matrix }

    for word in ABLE:

        wanted = [id(shelf.held[name]) for name in shelf.order if word in shelf.held[name].capabilities]

        assert [id(adapter) for adapter in mail.supporting(word)] == wanted

def got ( mail: Manager[Adapter], shelf: Shelf, asked: Any ) -> bool:

    found, wanted = tried(partial(mail.get, asked)), shelf.find(asked)

    if isinstance(wanted, str): return refused(found, "mail.adapter") and found.message == wanted

    return found is wanted

def vouched ( adapter: Adapter, value: Any ) -> bool:

    can, found = able(adapter, value), tried(partial(adapter.ensure, value))

    if adapter.can(value) is not can: return False
    if can: return found is None

    asked = worded(value)

    return refused(found, "mail.capability", { "capability": [asked] }) and found.message == f"{adapter.name} cannot {asked}"

def stepped ( mail: Manager[Adapter], shelf: Shelf, notes: list[Note], step: Step ) -> None:

    verb, index, first = step
    asked: Any = ASKS[index % len(ASKS)]

    if verb == "use":

        assert mail.use(STOCK[index], first) is STOCK[index]

        notes.append(("mail", STOCK[index].name, shelf.use(STOCK[index], first)))

    elif verb == "forget": assert mail.forget(asked) is shelf.forget(asked)
    elif verb == "get": assert got(mail, shelf, asked)
    elif verb == "close": assert run(mail.close()) == len(shelf.order)
    else:

        mail.clear()
        shelf.clear()

def swept ( modes: Sequence[str], shelf: Shelf ) -> tuple[list[str], int | None, list[Mark]]:

    reached: list[str] = []
    warned: list[Mark] = []
    count  = 0

    for index, mode in enumerate(modes):

        name = f"c{index}"

        reached.append(name)

        if mode == "stopped": return reached, None, warned
        if mode == "drops": shelf.drop(name)

        if mode in FAILED: warned.append((name, FAILED[mode]))
        else: count += 1

    return reached, count, warned

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(FAMILIES, TITLES, ABLES, st.booleans())
def declared ( family: Any, name: Any, able: Any, first: bool ) -> None:

    mail: Manager[Adapter] = Manager("mail")
    shelf   = Shelf()
    adapter = made(family, name, able)
    verdict = judged(adapter.family, adapter.name, adapter.capabilities)

    mail.use(STOCK[0])
    shelf.use(STOCK[0], first=False)

    found = tried(partial(mail.use, adapter, first))

    if verdict is None:

        assert found is adapter
        assert adapter.describe() == { "family": "mail", "name": name, "capabilities": sorted(able) }

        shelf.use(adapter, first)

    else: assert refused(found, *verdict)

    same(mail, shelf)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(STEPS)
def scripted ( steps: list[Step] ) -> None:

    mail: Manager[Adapter] = Manager("mail")
    shelf = Shelf()
    notes: list[Note] = []

    Closer.told.clear()

    with log.capture() as events:

        for step in steps:

            stepped(mail, shelf, notes, step)
            same(mail, shelf)

    told = [(event["family"], event["name"], event["replaced"]) for event in events if event["event"] == "adapter.registered"]

    assert told == notes
    assert all(event["level"] == "debug" for event in events)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD)
def looked ( value: Any ) -> None:

    mail: Manager[Adapter] = Manager("mail")
    shelf = Shelf()

    for adapter in (STOCK[0], STOCK[3]):

        mail.use(adapter)
        shelf.use(adapter, first=False)

    assert mail.has(value) is (type(value) is str and value in shelf.order)
    assert got(mail, shelf, value)
    assert [adapter.name for adapter in mail.supporting(value)] == [name for name in shelf.order if able(shelf.held[name], value)]
    assert vouched(STOCK[0], value)
    assert vouched(STOCK[3], value)
    assert refused(tried(partial(mail.use, value)), "mail.family", { "family": [type(value).__name__] })

    found = tried(partial(Manager, value))

    if rooted(value): assert found.family == value
    else: assert refused(found, "adapter.family")

    assert mail.forget(value) is shelf.forget(value)

    same(mail, shelf)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WANTED)
def needed ( wanted: dict[str, Any] ) -> None:

    missing = [name for name, value in wanted.items() if blank(value)]
    found   = tried(partial(STOCK[0].need, **wanted))

    if not missing:

        assert found is None

        return

    assert refused(found, "mail.settings", { "missing": missing })
    assert found.message == "owl needs " + ", ".join(missing)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PADS, WORDS, CASES, PADS, WILD, RAW)
def receipted ( front: str, word: str, cased: Callable[[str], str], back: str, wild: Any, raw: dict[str, Any] ) -> None:

    status  = front + cased(word) + back
    receipt = Receipt("r1", status, raw)

    assert receipt.accepted() is settled(status)
    assert Receipt("r1", wild).accepted() is settled(wild)
    assert Receipt("r1", Word(status)).accepted() is settled(status)
    assert hash(receipt) == hash(Receipt("r1", status))
    assert receipt == Receipt("r1", status, dict(raw))
    assert Receipt("r1", status).raw == {}

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.sampled_from(MODES), max_size=6))
def closed ( modes: list[str] ) -> None:

    mail: Manager[Adapter] = Manager("mail")
    shelf = Shelf()

    Closer.mail = mail
    Closer.told.clear()

    for index, mode in enumerate(modes):

        adapter = made("mail", f"c{index}", frozenset({ "send" }), mode)

        mail.use(adapter)
        shelf.use(adapter, first=False)

    reached, count, warned = swept(modes, shelf)

    with log.capture() as events:

        assert run(mail.close()) == count

    told = [event for event in events if event["event"] == "adapter.close"]

    assert Closer.told == reached
    assert [(event["level"], event["family"], event["name"], event["kind"]) for event in told] == [
        ("warning", "mail", name, kind) for name, kind in warned
    ]

    same(mail, shelf)

declared()
scripted()
looked()
needed()
receipted()
closed()

loop.close()
log.close()


@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.none(), st.text(max_size=6), st.integers(), st.lists(st.integers(), max_size=2), st.dictionaries(st.sampled_from(["id", "status", "extra"]), st.one_of(st.none(), st.text(max_size=12), st.integers(), st.just("x" * 300), st.just("a\nb")), max_size=3)), st.sampled_from(["sent", "queued", "failed", "ok"]))
def receipted_loosely ( body: Any, fallback: str ) -> None:

    owl  = made("mail", "owl", ("send",))
    held = body if isinstance(body, dict) else None
    made_ = tried(lambda: owl.receipt(body, fallback))

    if isinstance(made_, Fault):

        assert made_.code is Code.UNAVAILABLE
        assert made_.reason == "mail.reply"
        assert made_.unknown

        key, word = (held or {}).get("id"), (held or {}).get("status", fallback)
        sound_key = key is None or (type(key) is str and 0 < len(key) <= 256 and key.isprintable())
        sound_word = type(word) is str and word.isascii() and 0 < len(word) <= 64

        assert not isinstance(body, dict | type(None)) or not sound_key or not sound_word

        return

    assert isinstance(made_, Receipt)
    assert made_.raw == (held or {})
    assert made_.status == str((held or {}).get("status", fallback)).strip().lower()
    assert made_.id == (held or {}).get("id") if (held or {}).get("id") is not None else len(made_.id) == 12

receipted_loosely()

print(f"fuzz adapter  examples={EXAMPLES * 7}  ok")
