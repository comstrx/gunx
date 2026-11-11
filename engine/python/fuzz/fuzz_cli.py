from engine.cli import Argument, Cli, Command
from engine.error import Code, Fault
from engine.log import log
from engine.parse import parse
from collections.abc import Callable
from decimal import Decimal
from enum import Enum, StrEnum
from hypothesis import HealthCheck, given, settings, strategies as st
from itertools import takewhile
from pathlib import Path
from typing import Any, Literal, cast
import asyncio, inspect, re

type Pair = tuple[str, Any]
type Sort = tuple[Any, str, bool, tuple[Any, ...]]
type Spec = tuple[str, str, str, Any]
type Told = tuple[int, int, int]
type Hit  = tuple[str, list[str], Any]
type Form = tuple[list[Spec], str | None]

class Level ( StrEnum ):

    LOW  = "low"
    HIGH = "high"

class Shade ( Enum ):

    DARK  = 1
    LIGHT = 2

class Empty ( Enum ):

    pass

EXAMPLES = 1000
WORD     = 64
LINE     = 200
BYTE     = 255
TOLD     = (0, 1, 0)
DENIED   = (2, 0, 2)
EMPTY    = inspect.Parameter.empty
PLAIN    = inspect.Parameter.POSITIONAL_OR_KEYWORD
REST     = inspect.Parameter.VAR_POSITIONAL
NAMED    = inspect.Parameter.KEYWORD_ONLY
NAME     = re.compile(r"[a-z][a-z0-9]*(?:[:._-][a-z0-9]+)*")
NUMERIC  = re.compile(r"-\.?[0-9]")
HELP     = ("-h", "--help")
VERSION  = ("version", "--version", "-V")
ON       = ("1", "true", "yes", "y", "on", "YES", " On ")
OFF      = ("0", "false", "no", "n", "off", "", "No")
LETTERS  = "abcdefgijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
POOL     = ("a", "b", "key", "dry_run", "in_", "x1", "name", "count", "level", "path", "tag", "no_cache", "max_size_")
MESSAGES = {
    "cli.value": "Invalid value", "cli.flag": "Unknown option", "cli.repeated": "Repeated option",
    "cli.missing": "Missing argument", "cli.argument": "Unexpected argument",
}
WRONGS   = frozenset({ "cli.name", "cli.action", "cli.summary", "cli.group", "cli.kind", "cli.default" })
CALLS: list[tuple[tuple[object, ...], dict[str, object]]] = []
SORTS: dict[str, Sort] = {
    "str"    : (str, "str", False, (EMPTY, "d", None, "")),
    "int"    : (int, "int", False, (EMPTY, 7, None)),
    "float"  : (float, "float", False, (EMPTY, 1.5)),
    "bool"   : (bool, "bool", False, (EMPTY, True, False)),
    "level"  : (Level, "level", False, (EMPTY, Level.LOW)),
    "shade"  : (Shade, "shade", False, (EMPTY, Shade.DARK)),
    "mode"   : (Literal["fast", "full"], "mode", False, (EMPTY, "fast")),
    "maybe"  : (int | None, "int", False, (EMPTY, None, 3)),
    "any"    : (Any, "str", False, (EMPTY, None)),
    "bare"   : (EMPTY, "str", False, (EMPTY, None, "x")),
    "count"  : (EMPTY, "int", False, (5,)),
    "ratio"  : (EMPTY, "float", False, (2.5,)),
    "switch" : (EMPTY, "bool", False, (True, False)),
    "ints"   : (list[int], "int", True, (EMPTY, None, [1, 2])),
    "strs"   : (list[str], "str", True, (EMPTY, None, [])),
    "bools"  : (list[bool], "bool", True, (EMPTY, None)),
}
SLOTS    = ("head", "body", "named")
SPREADS  = ("str", "int", "float", "bool", "level", "shade", "mode", "maybe", "any", "bare")
CHARS    = st.one_of(st.characters(), st.sampled_from(["\ud800", "\udfff", "\x00", "\x1b", "\n", "=", "-", " ", "_"]))
TEXTS    = st.text(CHARS, max_size=6)
PAIRS: dict[str, st.SearchStrategy[Pair]] = {
    "str"   : TEXTS.map(lambda text: (text, text)),
    "int"   : st.integers(-10 ** 12, 10 ** 12).map(lambda value: (str(value), value)),
    "float" : st.floats(allow_nan=False, allow_infinity=False).map(lambda value: (repr(value), value)),
    "bool"  : st.sampled_from([*[(word, True) for word in ON], *[(word, False) for word in OFF]]),
    "level" : st.sampled_from([(member.value, member) for member in Level]),
    "shade" : st.sampled_from([(str(member.value), member) for member in Shade]),
    "mode"  : st.sampled_from([("fast", "fast"), ("full", "full")]),
}
WORDS    = st.sampled_from([
    "seed", "serve", "cache:put", "nums", "many", "paint", "echo", "help", "version", "--version", "-V", "-h", "--help",
    "--", "demo", "--tag", "--tag=x", "-w", "-w5m", "-w=90s", "--wait", "--mode", "--mode=full", "full", "fast", "slow",
    "--debug", "--no-debug", "--debug=yes", "--debug=maybe", "-d", "-dc", "-n", "-n4", "--workers=2", "--level=high",
    "--no-color", "--color", "--token", "--token=t", "--dry-run", "--dry_run", "--ttl=1.5", "--ttl=nan", "--ids=1",
    "--ids", "--flags=yes", "--flags", "1", "2", "-1", "-.5", "7", "300", "x", "", "-", "--no-", "--=", "-=", "5m", "k",
])
HINTS    = st.sampled_from([
    list, dict, tuple, set, frozenset, bytes, bytearray, object, type(None), None, 5, "int", "nope", "1 +", "1 / 0",
    "list[int]", list[list[int]], list[int] | None, int | str, dict[str, int], tuple[int, ...], Literal[1], Literal["a", 1],
    Literal["a"], Empty, Level, Shade, Decimal, Path, parse.duration, parse.integer, str.upper, len, complex, range,
    bytes.fromhex, float.fromhex, int, float, bool, str, Any, EMPTY, list[bool], list[Level], Level | None, bool | None,
    list[Any], int | None, list[Empty], list[bytes], abs,
])
STORED: st.SearchStrategy[Any] = st.sampled_from([EMPTY, EMPTY, None, 0, 1, True, False, 1.5, "x", [], [1], (), {}, Level.LOW, b"x", "\x1b"])
STYLES   = st.sampled_from([PLAIN, PLAIN, REST, NAMED, inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.VAR_KEYWORD])
TITLES   = st.one_of(
    st.text(st.sampled_from("abz09:._- A_é"), max_size=8), st.sampled_from(["help", "version", "a" * 64, "a" * 65, "cache:put"]),
    st.sampled_from([None, 5, b"seed", ("seed",)]), TEXTS,
)
LABELS   = st.one_of(
    st.sampled_from(["engine", "", "1.0", "The engine", "a" * 64, "a" * 65, "a" * 200, "a" * 201, "seed", "é", "\x1b[31m", "a\nb"]),
    st.sampled_from([None, 5, b"x"]), TEXTS,
)
LAZY     = st.sampled_from([
    "int", "1 / 0", "nope", "1 +", "list[int]", "undefined.attr", "int.nope", "(yield)", "[][0]", "{}['a']", "", " ",
    "int | None", "\x00", "lambda: 0", "Level", "list[Level] | None", "Literal['a']", "bool", "float", "str", "Empty",
])
VALUES   = st.one_of(
    st.none(), st.booleans(), st.integers(), st.floats(), TEXTS, st.text(CHARS, max_size=300), st.binary(max_size=8),
    st.sampled_from([Level.LOW, Shade.DARK, Decimal("1.5"), EMPTY, 2 ** 70, -2 ** 70]), st.lists(TEXTS, max_size=3),
)
ASCII    = st.text(st.characters(min_codepoint=32, max_codepoint=126), max_size=10)
ENDS     = st.one_of(st.integers(-3, 300), st.sampled_from([-1, 0, 1, 2, 254, 255, 256]), VALUES)
EDGES    = st.builds("{}{}".format, st.sampled_from(["--", "-", "--no-"]), st.text(CHARS, max_size=4))
TOKENS   = st.lists(st.one_of(WORDS, WORDS, WORDS, TEXTS, EDGES), max_size=8)

def seed ( name: str, *files: str, mode: Literal["fast", "full"] = "fast", tag: list[str] | None = None, wait: float = 1.0 ) -> None: ...

def serve ( port: int = 8000, debug: bool = False, *, workers: int = 1, level: Level = Level.LOW, color: bool = True ) -> None: ...

def put ( key: str, value: Any = None, /, ttl: float | None = None, *, token: str, dry_run: bool ) -> None: ...

def nums ( *values: int ) -> int:

    return sum(values)

def many ( ids: list[int], flags: list[bool] | None = None ) -> None: ...

def paint ( shade: Shade = Shade.DARK, *tones: Shade ) -> None: ...

async def echo ( *words: str ) -> int:

    await asyncio.sleep(0)

    return len(words)

def commands () -> dict[str, Command]:

    made = (
        Command("seed", seed, "Seed data", "database"), Command("serve", serve, "Serve the api"), Command("cache:put", put),
        Command("nums", nums), Command("many", many), Command("paint", paint), Command("echo", echo),
    )

    made[0].argument("wait", "seconds to wait", parse.duration, "w").argument("name", "which seeder").example("engine seed demo a b")
    made[1].argument("debug", "verbose", short="d").argument("color", short="c").argument("workers", "count", short="n")

    return { command.name: command for command in made }

def shaped ( *parameters: inspect.Parameter ) -> Callable[..., None]:

    def action ( *values: object, **more: object ) -> None:

        CALLS.append((values, more))

    cast("Any", action).__signature__ = inspect.Signature(parameters)

    return action

def clean ( text: object, limit: int = LINE ) -> bool:

    return type(text) is str and len(text) <= limit and all(letter.isprintable() or letter == "\n" for letter in text)

def sound ( fault: Fault ) -> None:

    assert fault.code is Code.BAD_REQUEST
    assert fault.reason in MESSAGES
    assert fault.message == MESSAGES[fault.reason]
    assert fault.errors

    for field, messages in fault.errors.items():

        assert clean(field, WORD)
        assert messages
        assert all(clean(message, WORD) for message in messages)

def tag ( name: str ) -> str:

    return name.strip("_").replace("_", "-")

def switch ( sort: str ) -> bool:

    return SORTS[sort][1] == "bool" and not SORTS[sort][2]

def plain ( spec: Spec ) -> bool:

    return spec[2] != "named" and not SORTS[spec[1]][2] and not switch(spec[1])

def needed ( spec: Spec ) -> bool:

    return spec[3] is EMPTY and not switch(spec[1])

def rested ( default: Any ) -> Any:

    return None if default is EMPTY else list(default) if type(default) is list else default

def safe ( text: str ) -> bool:

    return not text.startswith("-") or text == "-" or NUMERIC.match(text) is not None

def attempt [T] ( work: Callable[[], T] ) -> T | Fault:

    try: return work()
    except Fault as fault: return fault

def refusal ( command: Command, tokens: list[str], reason: str ) -> dict[str, list[str]]:

    fault = attempt(lambda: command.parse(tokens))

    assert isinstance(fault, Fault)
    assert fault.reason == reason

    sound(fault)

    return fault.errors or {}

def wrong ( fault: object, reason: str, *name: object ) -> None:

    assert isinstance(fault, Fault)
    assert fault.code is Code.INTERNAL
    assert fault.reason == reason
    assert fault.message == Code.INTERNAL.message()
    assert fault.errors == ({ "command": [Argument.shown(name[0])] } if name else None)

def nothing () -> None: ...

def lazy ( hint: str, default: object ) -> Callable[..., None]:

    def action ( a: int = 1 ) -> None: ...

    action.__annotations__["a"] = hint
    action.__defaults__ = (default,)

    return action

def code ( made: object ) -> int:

    if isinstance(made, bool): return 0 if made else 1
    if isinstance(made, int): return made if 0 <= made <= BYTE else 1

    return 0

def ended ( how: str, value: object ) -> tuple[int, int]:

    if how == "return": return code(value), 0
    if how != "exit": return 1, 1
    if value is None or isinstance(value, int): return code(int(value or 0)), 0

    return 1, 1

def word ( value: object ) -> bool:

    return type(value) is str and 0 < len(value) <= WORD and value.isprintable()

@st.composite
def shapes ( draw: st.DrawFn ) -> Form:

    specs: list[Spec] = []

    for name in draw(st.lists(st.sampled_from(POOL), max_size=6, unique=True)):

        sort    = draw(st.sampled_from(sorted(SORTS)))
        choices = SORTS[sort][3]
        given   = [item for item in choices if item is not EMPTY]
        slot    = draw(st.sampled_from(SLOTS if EMPTY in choices else SLOTS[1:]))
        default = EMPTY if slot == "head" else draw(st.sampled_from(given if slot == "body" else list(choices)))

        specs.append((name, sort, slot, default))

    specs.sort(key=lambda spec: SLOTS.index(spec[2]))

    return specs, draw(st.none() | st.sampled_from(SPREADS))

def parameters ( specs: list[Spec], rest: str | None ) -> list[inspect.Parameter]:

    made = [
        inspect.Parameter(name, NAMED if slot == "named" else PLAIN, default=default, annotation=SORTS[sort][0])
        for name, sort, slot, default in specs
    ]
    at   = sum(slot != "named" for _, _, slot, _ in specs)

    if rest is not None: made.insert(at, inspect.Parameter("rest", REST, annotation=SORTS[rest][0]))

    return made

def flagged ( data: st.DataObject, label: str, letter: str ) -> tuple[list[str], bool] | None:

    text, value = data.draw(PAIRS["bool"])
    forms: list[tuple[list[str], bool] | None] = [
        None, ([f"--{label}"], True), ([f"--no-{label}"], False), ([f"--{label}={text}"], value),
    ]

    if letter: forms += [([f"-{letter}"], True), ([f"-{letter}={text}"], value)]

    return data.draw(st.sampled_from(forms))

def worded ( data: st.DataObject, label: str, letter: str, text: str ) -> list[str]:

    forms = [[f"--{label}={text}"], [f"--{label}", text]]

    if letter: forms += [[f"-{letter}", text], [f"-{letter}={text}"]]
    if letter and text and not text.startswith("="): forms.append([f"-{letter}{text}"])

    return data.draw(st.sampled_from(forms))

def named ( data: st.DataObject, specs: list[Spec], shorts: dict[str, str] ) -> tuple[list[Hit], list[Spec]]:

    hits: list[Hit] = []
    free: list[Spec] = []

    for spec in specs:

        name, sort, _, _ = spec
        pairs, many = SORTS[sort][1], SORTS[sort][2]
        label  = tag(name).replace("-", "_") if data.draw(st.booleans()) else tag(name)
        letter = shorts.get(name, "")

        if switch(sort):

            found = flagged(data, label, letter)

            if found is not None: hits.append((name, *found))

            continue

        if plain(spec) and data.draw(st.booleans()):

            free.append(spec)

            continue

        low  = 1 if needed(spec) or plain(spec) else 0
        size = data.draw(st.integers(low, 3 if many else 1))

        for text, value in data.draw(st.lists(PAIRS[pairs], min_size=size, max_size=size)):

            hits.append((name, worded(data, label, letter, text), value))

    return hits, free

def placed ( data: st.DataObject, free: list[Spec], rest: str | None ) -> tuple[list[str], dict[str, Any]]:

    need  = sum(needed(spec) for spec in free)
    count = data.draw(st.integers(need, len(free)))
    size  = data.draw(st.integers(0, 3)) if rest is not None and count == len(free) else 0
    texts: list[str] = []
    made: dict[str, Any] = { spec[0]: rested(spec[3]) for spec in free[count:] }

    for name, sort, _, _ in free[:count]:

        text, made[name] = data.draw(PAIRS[SORTS[sort][1]])

        texts.append(text)

    spread = data.draw(st.lists(PAIRS[SORTS[rest][1]], min_size=size, max_size=size)) if rest is not None else []

    if rest is not None: made["rest"] = tuple(value for _, value in spread)

    return [*texts, *[text for text, _ in spread]], made

BOOK     = commands()
loop     = asyncio.new_event_loop()

log.setup("info", "json", Path("/dev/null"))

def chosen ( default: str | None, tokens: list[str] ) -> tuple[Command, list[str]] | None:

    first = tokens[0] if tokens else None

    if first in BOOK: return BOOK[first], tokens[1:]
    if default is not None and (first is None or first.startswith("-")): return BOOK[default], tokens

    return None

def ran ( command: Command, rest: list[str] ) -> Told:

    try: values = command.parse(rest)
    except Fault: return DENIED

    made = len(values["words"]) if command.name == "echo" else sum(values["values"]) if command.name == "nums" else 0

    return (made if 0 <= made <= BYTE else 1), 0, 0

def answer ( default: str | None, tokens: list[str] ) -> Told:

    first = tokens[0] if tokens else None
    rest  = tokens[1:]
    known = not rest or rest[0] in ("help", "version") or rest[0] in BOOK
    found = chosen(default, tokens)

    if first in HELP or first == "help": return TOLD if known and len(rest) < 2 else DENIED
    if first in VERSION or (first is None and default is None): return TOLD
    if found is None: return DENIED
    if any(word in HELP for word in takewhile(lambda word: word != "--", found[1])): return TOLD

    return ran(*found)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(sorted(BOOK)), TOKENS)
def parsed ( name: str, tokens: list[str] ) -> None:

    command = BOOK[name]

    try: made = command.parse(tokens)
    except Fault as fault:

        sound(fault)

        return

    assert list(made) == [argument.name for argument in command.args]
    assert repr(command.parse(tuple(tokens))) == repr(made)

    for argument in command.args:

        value = made[argument.name]

        if argument.flag: assert type(value) is bool
        if argument.rest: assert type(value) is tuple
        if argument.many: assert value is None or (type(value) is list and value)
        if argument.required: assert value is not None

    left = command.invoke(made)

    if inspect.iscoroutine(left): left.close()

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from([None, *sorted(BOOK)]), TOKENS)
def routed ( default: str | None, tokens: list[str] ) -> None:

    out: list[str] = []
    err: list[str] = []
    cli = Cli("engine", "The engine", "1.0", default).setup(out.append, err.append).register(*BOOK.values())
    wanted = answer(default, tokens)

    assert (cli.run(tokens), len(out), len(err)) == wanted
    assert all(clean(line, 100000) for line in (*out, *err))
    assert not err or err[0].startswith("error: ")

    first = (list(out), list(err))

    out.clear()
    err.clear()

    assert (loop.run_until_complete(cli.call(tuple(tokens))), len(out), len(err)) == wanted
    assert (out, err) == first

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(shapes(), st.data())
def signed ( form: Form, data: st.DataObject ) -> None:

    specs, rest = form
    wanted  = parameters(specs, rest)
    command = Command("run", shaped(*wanted))
    letters = data.draw(st.lists(st.sampled_from(LETTERS), min_size=len(specs), max_size=len(specs), unique=True))
    shorts  = { spec[0]: letter for spec, letter in zip(specs, letters, strict=True) if data.draw(st.booleans()) }
    lists   = { spec[0] for spec in specs if SORTS[spec[1]][2] }
    values: dict[str, Any] = { name: (default is True) if switch(sort) else rested(default) for name, sort, _, default in specs }

    for name, letter in shorts.items(): command.argument(name, short=letter)

    drawn, free  = named(data, specs, shorts)
    spots, given = placed(data, free, rest)
    hits   = list(data.draw(st.permutations(drawn)))
    dashed = data.draw(st.booleans()) or not all(safe(text) for text in spots)
    cut    = data.draw(st.integers(0, len(hits)))
    loose  = { spec[0] for spec in specs if plain(spec) }

    if dashed or any(name in loose for name, _, _ in hits[cut:]): cut = len(hits)

    values |= given

    for name, _, value in hits: values[name] = [item for other, _, item in hits if other == name] if name in lists else value

    front   = [word for _, words, _ in hits[:cut] for word in words]
    back    = [word for _, words, _ in hits[cut:] for word in words]
    tokens  = [*front, *(["--"] if dashed else []), *spots, *back]
    ordered = { parameter.name: values[parameter.name] for parameter in wanted }
    made    = command.parse(tokens)

    assert repr(made) == repr(ordered)

    CALLS.clear()
    command.invoke(made)

    bound = inspect.Signature(wanted).bind(*CALLS[0][0], **CALLS[0][1])

    bound.apply_defaults()

    assert repr(dict(bound.arguments)) == repr(ordered)
    assert clean(command.usage(), 100000)
    assert clean(command.manual("engine"), 100000)
    assert command.describe()["usage"] == command.usage()

    absent = { tag(spec[0]): ["required"] for spec in specs if needed(spec) }
    twice  = next((hit for hit in hits if hit[0] not in lists), None)
    flag   = next((tag(spec[0]) for spec in specs if switch(spec[1])), None)

    if absent: assert refusal(command, [], "cli.missing") == absent
    else: assert list(command.parse([])) == list(ordered)

    assert refusal(command, ["--zz-top", *tokens], "cli.flag")["flag"] == ["--zz-top"]

    if twice is not None: assert refusal(command, [*twice[1], *twice[1]], "cli.repeated") == { tag(twice[0]): ["repeated"] }
    if flag is not None: assert refusal(command, [f"--no-{flag}=yes"], "cli.value") == { flag: ["negated"] }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(HINTS, STORED, STYLES, TOKENS)
def built ( hint: object, default: object, style: Any, tokens: list[str] ) -> None:

    stored  = EMPTY if style in (REST, inspect.Parameter.VAR_KEYWORD) else default
    action  = shaped(inspect.Parameter("a", style, default=stored, annotation=hint))
    command = attempt(lambda: Command("run", action))

    if isinstance(command, Fault):

        assert command.reason in WRONGS

        wrong(command, command.reason or "", "run")

        return

    assert clean(command.usage(), 100000)
    assert clean(command.manual("engine"), 100000)
    assert command.describe()["name"] == "run"

    made = attempt(lambda: command.parse(tokens))

    if isinstance(made, Fault): sound(made)
    else: assert list(made) == ["a"]

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(TITLES, LABELS, LABELS, LABELS, st.one_of(st.none(), LABELS))
def titled ( name: object, program: object, summary: object, version: object, default: object ) -> None:

    valid   = type(name) is str and len(name) <= WORD and NAME.fullmatch(name) is not None
    command = attempt(lambda: Command(cast("Any", name), nothing))
    faults  = {
        "cli.program" : not word(program) or " " in cast("str", program),
        "cli.summary" : not (type(summary) is str and len(summary) <= LINE and summary.isprintable()),
        "cli.version" : not word(version),
        "cli.default" : default is not None and type(default) is not str,
    }
    reason  = next((key for key, failed in faults.items() if failed), None)
    cli     = attempt(lambda: Cli(cast("Any", program), cast("Any", summary), cast("Any", version), cast("Any", default)))

    assert isinstance(command, Command) is valid
    assert isinstance(cli, Cli) is (reason is None)

    if isinstance(command, Fault): wrong(command, "cli.name", name)
    if isinstance(cli, Fault): wrong(cli, reason or "")
    if isinstance(command, Fault) or isinstance(cli, Fault): return

    kept = attempt(lambda: cli.register(command))

    again = attempt(lambda: cli.register(command))

    if command.name in ("help", "version"): wrong(kept, "cli.name")
    else: wrong(again, "cli.duplicate", command.name)

    assert cli.has(command.name) is (kept is cli)
    assert cli.names() == ((command.name,) if kept is cli else ())
    assert kept is not cli or cli.get(command.name) is command

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(LAZY, st.sampled_from([1, None, True, [1], "x", 1.5]))
def lazed ( hint: str, default: object ) -> None:

    command = attempt(lambda: Command("run", lazy(hint, default)))

    if isinstance(command, Command): return

    assert command.reason in WRONGS

    wrong(command, command.reason or "", "run")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(VALUES, st.integers(0, 300))
def shown ( value: object, limit: int ) -> None:

    base = str(value.value if isinstance(value, Enum) else value)[:limit]
    made = Argument.shown(value, limit)

    assert made.isprintable()
    assert len(made) == len(base)
    assert all(new == old or (new == "?" and not old.isprintable()) for old, new in zip(base, made, strict=True))
    assert Argument.shown(made, limit) == made

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(VALUES, max_size=4), st.lists(st.lists(VALUES, max_size=4), max_size=4), st.lists(st.lists(ASCII, max_size=4), min_size=1, max_size=5))
def tabled ( head: list[object], rows: list[list[object]], grid: list[list[str]] ) -> None:

    out: list[str] = []
    cli = Cli("engine", "", "1.0").setup(out.append, out.append)

    assert cli.table(head, rows) == 0
    assert len(out) == len(rows) + 1
    assert all(clean(line, 100000) and "\n" not in line and not line.endswith(" ") for line in out)

    out.clear()

    widths = [max(len(row[at]) for row in grid if at < len(row)) for at in range(max(map(len, grid)))]

    assert cli.table(grid[0], grid[1:]) == 0
    assert out == ["  ".join(cell.ljust(widths[at]) for at, cell in enumerate(row)).rstrip() for row in grid]

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(["return", "exit", "raise", "fault"]), ENDS, st.booleans())
def left ( how: str, value: object, slow: bool ) -> None:

    out: list[str] = []
    err: list[str] = []

    def act () -> object:

        if how == "return": return value
        if how == "exit": raise SystemExit(value)
        if how == "fault": raise Fault(Code.UNAVAILABLE if slow else Code.CONFLICT, str(value), "job.failed\t", { "field\n": [str(value)] })

        raise ValueError(value)

    async def later () -> object:

        await asyncio.sleep(0)

        return act()

    cli    = Cli("engine", "", "1.0").setup(out.append, err.append).register(Command("go", cast("Any", later if slow else act)))
    wanted = ended(how, value)

    assert (cli.run(["go"]), len(err)) == wanted
    assert (loop.run_until_complete(cli.call(["go"])), len(err)) == (wanted[0], wanted[1] * 2)
    assert not out
    assert all(clean(line, 100000) for line in err)

parsed()
routed()
signed()
built()
titled()
lazed()
shown()
tabled()
left()

loop.close()
log.close()

print(f"fuzz cli  examples={EXAMPLES * 9}  ok")
