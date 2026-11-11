from asyncio.subprocess import PIPE
from collections.abc import Awaitable, Callable
from decimal import Decimal
from enum import Enum, StrEnum
from pathlib import Path
from typing import Any, Literal, cast

from engine.cli import Argument, Cli, Command
from engine.error import Code, Fault
from engine.log import log
from engine.parse import parse
import asyncio, inspect, io, os, pytest, sys

type Told   = tuple[int, list[str], list[str]]
type Line   = tuple[str, tuple[str, ...], dict[str, object]]
type Denial = tuple[str, tuple[str, ...], str, dict[str, list[str]]]

class Level ( StrEnum ):

    LOW  = "low"
    HIGH = "high"

class Shade ( Enum ):

    DARK  = 1
    LIGHT = 2

class Empty ( Enum ):

    pass

class Jammed:

    def __init__ ( self, flushed: Exception | None = None, written: Exception | None = None ) -> None:

        self.flushed = flushed
        self.written = written
        self.told: list[str] = []

    def write ( self, text: str ) -> int:

        if self.written is not None: raise self.written

        self.told.append(text)

        return len(text)

    def flush ( self ) -> None:

        if self.flushed is not None: raise self.flushed

    def fileno ( self ) -> int:

        raise io.UnsupportedOperation("fileno")

def lined ( *lines: str ) -> str:

    return "\n".join(lines)

EMPTY    = inspect.Parameter.empty
PLAIN    = inspect.Parameter.POSITIONAL_OR_KEYWORD
REST     = inspect.Parameter.VAR_POSITIONAL
NAMED    = inspect.Parameter.KEYWORD_ONLY
SPREAD   = inspect.Parameter.VAR_KEYWORD
WRONG    = Code.INTERNAL.message()
LOOSE: tuple[tuple[str, object], ...] = (("port", 8000), ("debug", False), ("rate", 1.5), ("name", "x"), ("none", None))
HINT     = "Run 'engine help' for the manual."
CALLS: list[tuple[object, ...]] = []
MESSAGES = {
    "cli.value": "Invalid value", "cli.flag": "Unknown option", "cli.repeated": "Repeated option",
    "cli.missing": "Missing argument", "cli.argument": "Unexpected argument",
}
BASES: dict[str, dict[str, object]] = {
    "seed"      : { "name": "demo", "files": (), "mode": "fast", "tag": None, "wait": 1.0 },
    "serve"     : { "port": 8000, "debug": False, "workers": 1, "level": Level.LOW, "color": True },
    "cache:put" : { "key": "k", "value": None, "ttl": None, "token": "t", "dry_run": False },
    "nums"      : { "values": () },
    "many"      : { "ids": [1], "flags": None },
    "paint"     : { "shade": Shade.DARK, "tones": () },
}
USAGES   = {
    "seed"      : "seed <name> [files...] [--mode=fast] [--tag=<tag>]... [--wait=1.0]",
    "serve"     : "serve [port=8000] [--debug] [--workers=1] [--level=low] [--no-color]",
    "cache:put" : "cache:put <key> [value] [ttl] --token=<token> [--dry-run]",
    "nums"      : "nums [values...]",
    "many"      : "many --ids=<ids>... [--flags=<flags>]...",
    "paint"     : "paint [shade=1] [tones...]",
}
SEEDING  = lined(
    "Usage: engine seed <name> [files...] [--mode=fast] [--tag=<tag>]... [--wait=1.0]", "", "Seed data", "",
    "Arguments", "  name   which seeder", "  files", "",
    "Options", "  --mode      [one of fast, full; default fast]", "  --tag       [repeatable]",
    "  --wait, -w  seconds to wait [default 1.0]", "",
    "Examples", "  $ engine seed demo a b",
)
SERVING  = lined(
    "Usage: engine serve [port=8000] [--debug] [--workers=1] [--level=low] [--no-color]", "", "Serve the api", "",
    "Arguments", "  port  [default 8000]", "",
    "Options", "  --debug, -d       verbose", "  --workers, -n     count [default 1]",
    "  --level           [one of low, high; default low]", "  --[no-]color, -c",
)
PUTTING  = lined(
    "Usage: engine cache:put <key> [value] [ttl] --token=<token> [--dry-run]", "",
    "Arguments", "  key", "  value", "  ttl", "",
    "Options", "  --token    [required]", "  --dry-run",
)
MANUAL   = lined(
    "engine 1.0", "The engine", "", "Usage: engine <command> [arguments] [--options]", "",
    "database", "  seed       Seed data", "",
    "general", "  cache:put", "  many", "  nums", "  paint", "  serve      Serve the api", "",
    "Run 'engine help <command>' for one command.",
)
ACCEPTED: tuple[Line, ...] = (
    ("seed", ("demo",), {}),
    ("seed", ("demo", "a", "b"), { "files": ("a", "b") }),
    ("seed", ("demo", "--tag", "x", "--tag=y", "-w", "5m", "--mode", "full"), { "tag": ["x", "y"], "wait": 300.0, "mode": "full" }),
    ("seed", ("demo", "--", "--raw", "-x", "--"), { "files": ("--raw", "-x", "--") }),
    ("seed", ("--", "demo"), {}),
    ("seed", ("demo", "-w5m"), { "wait": 300.0 }),
    ("seed", ("demo", "-w=90s"), { "wait": 90.0 }),
    ("seed", ("--name=", "-5"), { "name": "", "files": ("-5",) }),
    ("seed", ("--name", "x", "y"), { "name": "x", "files": ("y",) }),
    ("seed", ("demo", "-"), { "files": ("-",) }),
    ("seed", ("demo", "--tag="), { "tag": [""] }),
    ("seed", ("demo", "--tag", "--", "x"), { "tag": ["--"], "files": ("x",) }),
    ("seed", ("demo", "--tag=a=b"), { "tag": ["a=b"] }),
    ("seed", ("\udc80", "é"), { "name": "\udc80", "files": ("é",) }),
    ("serve", (), {}),
    ("serve", ("9000",), { "port": 9000 }),
    ("serve", ("-5",), { "port": -5 }),
    ("serve", ("--port=-5",), { "port": -5 }),
    ("serve", ("--port", "-5"), { "port": -5 }),
    ("serve", ("--debug",), { "debug": True }),
    ("serve", ("--no-debug",), {}),
    ("serve", ("--debug=yes",), { "debug": True }),
    ("serve", ("--debug=no",), {}),
    ("serve", ("-d",), { "debug": True }),
    ("serve", ("-dc",), { "debug": True }),
    ("serve", ("-dcn", "4"), { "debug": True, "workers": 4 }),
    ("serve", ("-dn4",), { "debug": True, "workers": 4 }),
    ("serve", ("-n=4",), { "workers": 4 }),
    ("serve", ("-d=0",), {}),
    ("serve", ("-c=no",), { "color": False }),
    ("serve", ("--no-color",), { "color": False }),
    ("serve", ("--color",), {}),
    ("serve", ("--level", "high"), { "level": Level.HIGH }),
    ("serve", ("--port=١٢",), { "port": 12 }),
    ("serve", ("--port=1_0",), { "port": 10 }),
    ("serve", ("--port= 5",), { "port": 5 }),
    ("serve", ("--port=99999999999999999999999999",), { "port": 99999999999999999999999999 }),
    ("serve", ("--workers=2", "7000"), { "workers": 2, "port": 7000 }),
    ("serve", ("--port=1", "--"), { "port": 1 }),
    ("cache:put", ("k", "--token=t"), {}),
    ("cache:put", ("k", "v", "3", "--token", "t", "--dry-run"), { "value": "v", "ttl": 3.0, "dry_run": True }),
    ("cache:put", ("k", "--dry_run", "--token=t", "--ttl=1.5"), { "ttl": 1.5, "dry_run": True }),
    ("cache:put", ("--value=v", "k", "2", "--token=t"), { "value": "v", "ttl": 2.0 }),
    ("nums", ("1", "-2", "3"), { "values": (1, -2, 3) }),
    ("nums", (), {}),
    ("many", ("--ids=1", "--ids", "2"), { "ids": [1, 2] }),
    ("many", ("--ids=1", "--flags=yes", "--flags=no"), { "flags": [True, False] }),
    ("paint", (), {}),
    ("paint", ("2", "1", "2"), { "shade": Shade.LIGHT, "tones": (Shade.DARK, Shade.LIGHT) }),
)
REFUSED: tuple[Denial, ...] = (
    ("seed", ("demo", "-w"), "cli.value", { "wait": ["missing"] }),
    ("seed", ("demo", "--wait", "soon"), "cli.value", { "wait": ["parse.duration"] }),
    ("seed", ("demo", "--mode", "slow"), "cli.value", { "mode": ["choice"], "choices": ["fast", "full"] }),
    ("seed", ("demo", "--mode"), "cli.value", { "mode": ["missing"] }),
    ("seed", ("demo", "--force"), "cli.flag", { "flag": ["--force"], "nearest": ["--mode"] }),
    ("seed", ("demo", "--wai", "3"), "cli.flag", { "flag": ["--wai"], "nearest": ["--wait", "--tag"] }),
    ("seed", ("demo", "--tags", "3"), "cli.flag", { "flag": ["--tags"], "nearest": ["--tag"] }),
    ("seed", ("demo", "-x"), "cli.flag", { "flag": ["-x"] }),
    ("seed", ("demo", "--=x"), "cli.flag", { "flag": ["--"] }),
    ("seed", ("demo", "--wait=1", "--wait=2"), "cli.repeated", { "wait": ["repeated"] }),
    ("seed", ("demo", "--name=x"), "cli.repeated", { "name": ["repeated"] }),
    ("seed", (), "cli.missing", { "name": ["required"] }),
    ("seed", ("demo", "--tag"), "cli.value", { "tag": ["missing"] }),
    ("seed", ("demo", "--no-tag"), "cli.flag", { "flag": ["--no-tag"], "nearest": ["--tag"] }),
    ("seed", ("demo", "--files", "x"), "cli.flag", { "flag": ["--files"] }),
    ("seed", ("demo", "--" + "x" * 100), "cli.flag", { "flag": ["--" + "x" * 62] }),
    ("seed", ("demo", "--\x1b[31m"), "cli.flag", { "flag": ["--?[31m"] }),
    ("serve", ("-.5",), "cli.value", { "port": ["parse.integer"] }),
    ("serve", ("x",), "cli.value", { "port": ["parse.integer"] }),
    ("serve", ("1.5",), "cli.value", { "port": ["parse.integer"] }),
    ("serve", ("--port=0x10",), "cli.value", { "port": ["parse.integer"] }),
    ("serve", ("--debug=maybe",), "cli.value", { "debug": ["parse.boolean"] }),
    ("serve", ("--no-debug=1",), "cli.value", { "debug": ["negated"] }),
    ("serve", ("--debug", "--debug"), "cli.repeated", { "debug": ["repeated"] }),
    ("serve", ("--debug", "--no-debug"), "cli.repeated", { "debug": ["repeated"] }),
    ("serve", ("-dd",), "cli.repeated", { "debug": ["repeated"] }),
    ("serve", ("-dx",), "cli.flag", { "flag": ["-x"] }),
    ("serve", ("--level=HIGH",), "cli.value", { "level": ["choice"], "choices": ["low", "high"] }),
    ("serve", ("--workers",), "cli.value", { "workers": ["missing"] }),
    ("serve", ("-n",), "cli.value", { "workers": ["missing"] }),
    ("serve", ("--workers=x",), "cli.value", { "workers": ["parse.integer"] }),
    ("serve", ("1", "2"), "cli.argument", { "extra": ["2"] }),
    ("serve", ("--port=1", "2"), "cli.argument", { "extra": ["2"] }),
    ("serve", ("--no-workers",), "cli.flag", { "flag": ["--no-workers"], "nearest": ["--workers"] }),
    ("serve", ("1", "\x1b\x00\n" + "x" * 100), "cli.argument", { "extra": ["???" + "x" * 61] }),
    ("cache:put", ("k",), "cli.missing", { "token": ["required"] }),
    ("cache:put", ("--token=t",), "cli.missing", { "key": ["required"] }),
    ("cache:put", (), "cli.missing", { "key": ["required"], "token": ["required"] }),
    ("cache:put", ("k", "v", "1", "2", "--token=t"), "cli.argument", { "extra": ["2"] }),
    ("cache:put", ("k", "--ttl=nan", "--token=t"), "cli.value", { "ttl": ["parse.number"] }),
    ("cache:put", ("k", "--ttl=inf", "--token=t"), "cli.value", { "ttl": ["parse.number"] }),
    ("nums", ("1", "x"), "cli.value", { "values": ["parse.integer"] }),
    ("many", (), "cli.missing", { "ids": ["required"] }),
    ("many", ("1",), "cli.argument", { "extra": ["1"] }),
    ("many", ("--ids=x",), "cli.value", { "ids": ["parse.integer"] }),
    ("paint", ("3",), "cli.value", { "shade": ["choice"], "choices": ["1", "2"] }),
    ("paint", ("1", "DARK"), "cli.value", { "tones": ["choice"], "choices": ["1", "2"] }),
)
RETURNS: dict[str, tuple[object, int]] = {
    "none": (None, 0), "zero": (0, 0), "seven": (7, 7), "top": (255, 255), "over": (256, 1), "under": (-1, 1),
    "yes": (True, 0), "no": (False, 1), "text": ("text", 0), "real": (2.5, 0),
}
EXITS: dict[str, tuple[object, int, list[str]]] = {
    "bare": (None, 0, []), "zero": (0, 0, []), "seven": (7, 7, []), "over": (300, 1, []), "under": (-1, 1, []),
    "yes": (True, 1, []), "no": (False, 0, []), "text": ("bye\x1b[0m", 1, ["bye?[0m"]), "real": (2.5, 1, ["2.5"]),
    "long": ("x" * 300, 1, ["x" * 200]),
}
CHILD    = lined(
    "from engine.cli import Cli", "import sys", "cli = Cli('engine', 'The engine', '1.0')", "sys.stdin.read()",
    "raise SystemExit(cli.run(['version']))",
)

def seed ( name: str, *files: str, mode: Literal["fast", "full"] = "fast", tag: list[str] | None = None, wait: float = 1.0 ) -> None:

    CALLS.append(("seed", name, files, mode, tag, wait))

def serve ( port: int = 8000, debug: bool = False, *, workers: int = 1, level: Level = Level.LOW, color: bool = True ) -> int:

    CALLS.append(("serve", port, debug, workers, level, color))

    return 0

def put ( key: str, value: Any = None, /, ttl: float | None = None, *, token: str, dry_run: bool ) -> None:

    CALLS.append(("put", key, value, ttl, token, dry_run))

def nums ( *values: int ) -> int:

    return sum(values)

def many ( ids: list[int], flags: list[bool] | None = None ) -> None:

    CALLS.append(("many", ids, flags))

def paint ( shade: Shade = Shade.DARK, *tones: Shade ) -> None:

    CALLS.append(("paint", shade, tones))

def answer ( kind: str ) -> int | None:

    return cast("int | None", RETURNS[kind][0])

async def reply ( kind: str ) -> int | None:

    await asyncio.sleep(0)

    return answer(kind)

def later ( kind: str ) -> Awaitable[int | None]:

    return asyncio.sleep(0, answer(kind))

def leave ( kind: str ) -> None:

    raise SystemExit(cast("int", EXITS[kind][0]))

async def depart ( kind: str ) -> None:

    await asyncio.sleep(0)

    leave(kind)

def crash ( kind: str ) -> None:

    if kind == "client": raise Fault(Code.NOT_FOUND, "No such order", "order.missing", { "id": ["unknown", "gone"] })
    if kind == "server": raise Fault(Code.UNAVAILABLE, reason="thread.broken")
    if kind == "bare": raise Fault(Code.CONFLICT)
    if kind == "loud": raise Fault(Code.BAD_REQUEST, "m\x1b" + "x" * 300, "r\n" + "y" * 100, { "f\t" + "z" * 100: ["v\x00" + "w" * 300] })
    if kind == "stop": raise KeyboardInterrupt
    if kind == "cancel": raise asyncio.CancelledError
    if kind == "group": raise ExceptionGroup("many", [ValueError("secret-group")])

    raise ValueError("secret-" + kind)

async def wreck ( kind: str ) -> None:

    await asyncio.sleep(0)

    crash(kind)

async def hang () -> None:

    await asyncio.Event().wait()

def deaf ( text: str ) -> None:

    raise OSError("deaf")

def nothing () -> None: ...

def commands () -> tuple[Command, ...]:

    made = (
        Command("seed", seed, "Seed data", "database"), Command("serve", serve, "Serve the api"), Command("cache:put", put),
        Command("nums", nums), Command("many", many), Command("paint", paint),
    )

    made[0].argument("wait", "seconds to wait", parse.duration, "w").argument("name", "which seeder").example("engine seed demo a b")
    made[1].argument("debug", "verbose", short="d").argument("color", short="c").argument("workers", "count", short="n")

    return made

def named () -> dict[str, Command]:

    return { command.name: command for command in commands() }

def shaped ( *parameters: inspect.Parameter ) -> Callable[..., None]:

    def action ( *values: object, **more: object ) -> None: ...

    cast("Any", action).__signature__ = inspect.Signature(parameters)

    return action

def hinted ( hint: object, default: object = EMPTY, name: str = "a", kind: Any = PLAIN ) -> Callable[..., None]:

    return shaped(inspect.Parameter(name, kind, default=default, annotation=hint))

def lazy ( hint: str ) -> Callable[..., None]:

    def action ( a: int = 1 ) -> None: ...

    action.__annotations__ = { "a": hint, "return": None }

    return action

def refused ( reason: str, work: Callable[..., object], errors: object = None, code: Code = Code.INTERNAL ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is code and caught.value.reason == reason and caught.value.errors == errors

    return caught.value

def last () -> tuple[object, ...]:

    return CALLS[-1]

def marks ( events: list[Any] ) -> list[tuple[object, ...]]:

    return [(event["event"], event["level"], event.get("command"), event.get("reason")) for event in events]

class Desk:

    def __init__ ( self, default: str | None = None ) -> None:

        self.out: list[str] = []
        self.err: list[str] = []
        self.cli = Cli("engine", "The engine", "1.0", default).setup(self.out.append, self.err.append)

        self.cli.register(*commands())

    def run ( self, *argv: str ) -> Told:

        self.out.clear()
        self.err.clear()

        code = self.cli.run(list(argv))

        return code, list(self.out), list(self.err)

    async def call ( self, *argv: str ) -> Told:

        self.out.clear()
        self.err.clear()

        code = await self.cli.call(list(argv))

        return code, list(self.out), list(self.err)

def test_signatures_become_arguments_usage_and_manual () -> None:

    held = named()
    seen = Command("x", shaped(*(inspect.Parameter(name, PLAIN, default=default) for name, default in LOOSE)))

    assert { name: command.usage() for name, command in held.items() } == USAGES
    assert held["seed"].manual("engine") == SEEDING and held["serve"].manual("engine") == SERVING
    assert held["cache:put"].manual("engine") == PUTTING and held["nums"].manual("run") == "Usage: run nums [values...]\n\nArguments\n  values"
    assert Command("bare", nothing).manual("engine") == "Usage: engine bare" and Command("bare", nothing).usage() == "bare"
    assert held["seed"].describe() == {
        "name": "seed", "group": "database", "usage": USAGES["seed"], "summary": "Seed data",
        "arguments": [
            { "name": "name", "kind": "str", "required": True, "summary": "which seeder" },
            { "name": "files", "kind": "str", "required": False, "summary": "" },
            { "name": "mode", "kind": "str", "required": False, "summary": "" },
            { "name": "tag", "kind": "str", "required": False, "summary": "" },
            { "name": "wait", "kind": "duration", "required": False, "summary": "seconds to wait" },
        ],
    }
    assert [item["kind"] for item in held["serve"].describe()["arguments"]] == ["int", "bool", "int", "Level", "bool"]
    assert [item["name"] for item in held["cache:put"].describe()["arguments"]] == ["key", "value", "ttl", "token", "dry-run"]
    assert held["seed"].name == "seed" and held["seed"].group == "database" and held["serve"].group == "general"
    assert held["seed"].examples == ["engine seed demo a b"] and held["seed"].action is seed
    assert seen.usage() == "x [port=8000] [--debug] [rate=1.5] [name=x] [none]"
    assert seen.parse(["9000", "--debug", "2", "y", "z"]) == { "port": 9000, "debug": True, "rate": 2.0, "name": "y", "none": "z" }
    assert Command("x", hinted(Decimal)).parse(["1.50"]) == { "a": Decimal("1.50") }
    assert Command("x", hinted(Path, Path("x"))).parse(["/srv/y"]) == { "a": Path("/srv/y") }
    assert Command("x", lazy("int")).usage() == "x [a=1]" and Command("x", lazy("int")).parse(["7"]) == { "a": 7 }
    assert Command("x", hinted(int | None, None)).usage() == "x [a]"
    assert Command("x", hinted(list[int] | None, None)).usage() == "x [--a=<a>]..."
    assert Command("x", hinted(list[int], [1, 2])).usage() == "x [--a=<a>]..."
    assert Command("x", hinted(list[int], kind=NAMED)).usage() == "x --a=<a>..."
    assert Command("x", hinted(Any, 3)).usage() == "x [a=3]" and Command("x", hinted(bool)).usage() == "x [--a]"
    assert Command("x", hinted(bool, default=True)).usage() == "x [--no-a]" and Command("x", hinted(Level, Level.HIGH)).usage() == "x [a=high]"
    assert Command("x", hinted(Literal["a", "b"], "a")).usage() == "x [a=a]"
    assert Command("x", hinted(str, name="class_"), "", "g" * 64).usage() == "x <class>"
    assert Command("n" * 64, nothing, "s" * 200).name == "n" * 64 and Command("a.b:c-d_e", nothing).name == "a.b:c-d_e"

    kept = [1, 2]
    held["many"] = Command("many", hinted(list[int], kept))

    assert held["many"].parse([]) == { "a": [1, 2] } and held["many"].parse([])["a"] is not kept
    assert held["many"].parse(["--a=5"]) == { "a": [5] } and kept == [1, 2]

    assert Argument("dry_run", bool).label() == "dry-run" and Argument("class_", str).label() == "class"
    assert Argument("color", bool, default=True, flag=True, short="c").head() == "--[no-]color, -c"
    assert Argument("debug", bool, default=False, flag=True).head() == "--debug" and Argument("name", str).head() == "name"
    assert Argument("token", str, only=True, required=True).head() == "--token"
    assert Argument("token", str, only=True, required=True).shape() == "--token=<token>"
    assert Argument("name", str, required=True).shape() == "<name>" and Argument("name", str, "x").shape() == "[name=x]"
    assert Argument.shown("a\x1b[31m\nb") == "a?[31m?b" and Argument.shown("x" * 100) == "x" * 64
    assert Argument.shown("x" * 100, 5) == "xxxxx" and Argument.shown(Level.HIGH) == "high"
    assert Argument.shown(Shade.LIGHT) == "2" and Argument.shown(None) == "None" and Argument.shown("\udc80é") == "?é"

def test_tokens_parse_into_the_values_the_action_takes () -> None:

    held = named()

    for name, tokens, changed in ACCEPTED:

        wanted = { **BASES[name], **changed }

        assert held[name].parse(list(tokens)) == wanted, tokens
        assert held[name].parse(tokens) == wanted, tokens

    found = held["seed"].parse(["demo", "-w", "5m"])

    assert type(found["wait"]) is float and type(found["files"]) is tuple and list(found) == list(BASES["seed"])
    assert type(held["cache:put"].parse(["k", "v", "3", "--token=t"])["ttl"]) is float

    CALLS.clear()

    assert held["cache:put"].invoke(held["cache:put"].parse(["k", "v", "3", "--token", "t", "--dry-run"])) is None
    assert held["seed"].invoke(held["seed"].parse(["demo", "a", "b", "--tag=x"])) is None
    assert held["serve"].invoke(held["serve"].parse(["-dn4", "9000"])) == 0
    assert held["nums"].invoke(held["nums"].parse(["1", "-2", "3"])) == 2
    assert held["paint"].invoke(held["paint"].parse(["2", "1"])) is None
    assert CALLS == [
        ("put", "k", "v", 3.0, "t", True), ("seed", "demo", ("a", "b"), "fast", ["x"], 1.0),
        ("serve", 9000, True, 4, Level.LOW, True), ("paint", Shade.LIGHT, (Shade.DARK,)),
    ]

def test_tokens_are_refused_by_name_and_reason () -> None:

    held = named()

    for name, tokens, reason, errors in REFUSED:

        fault = refused(reason, lambda name=name, tokens=tokens: held[name].parse(list(tokens)), errors, Code.BAD_REQUEST)

        assert fault.message == MESSAGES[reason] and fault.client(), tokens

    refused("cli.tokens", lambda: held["seed"].parse(cast("list[str]", ["demo", 5])), { "command": ["seed"] })
    refused("cli.value", lambda: Command("x", hinted(Decimal)).parse(["x"]), { "a": ["invalid"] }, Code.BAD_REQUEST)
    refused("cli.flag", lambda: Command("x", hinted(int, 1, "from_")).parse(["--from_=3"]), { "flag": ["--from_"], "nearest": ["--from"] }, Code.BAD_REQUEST)

    assert held["seed"].parse(["demo"]) == BASES["seed"]

def test_commands_refuse_wrong_declarations () -> None:

    make: Any = Command
    told  = { "command": ["x"] }
    waste = hang()

    for name in (5, "", "X", "a b", "a--b", "a:", "9a", "n" * 65, "é", None):

        refused("cli.name", lambda name=name: make(name, nothing), { "command": [Argument.shown(name)] })

    refused("cli.action", lambda: make("x", waste), told)

    assert inspect.getcoroutinestate(waste) == inspect.CORO_CLOSED

    for action in (None, 5, "seed", dict, int, shaped(inspect.Parameter("more", SPREAD)), hinted(int, name="_x"), hinted(int, name="é")):

        refused("cli.action", lambda action=action: make("x", action), told)

    refused("cli.action", lambda: make("x", hinted(bool, default=False, name="help")), told)
    refused("cli.action", lambda: make("x", lazy("Missing")), told)
    refused("cli.action", lambda: make("x", lazy("1 +")), told)
    refused("cli.action", lambda: make("x", lazy("1 / 0")), told)
    refused("cli.action", lambda: make("x", lazy("[][0]")), told)
    refused("cli.action", lambda: make("x", shaped(inspect.Parameter("a", PLAIN), inspect.Parameter("a_", NAMED))), told)
    refused("cli.action", lambda: make("x", shaped(
        inspect.Parameter("color", PLAIN, default=True, annotation=bool), inspect.Parameter("no_color", PLAIN, default=False, annotation=bool),
    )), told)

    for summary in ("a\nb", "s" * 201, 5, None, b"x"): refused("cli.summary", lambda summary=summary: make("x", nothing, summary), told)
    for group in ("", "g" * 65, "a\tb", 5, None): refused("cli.group", lambda group=group: make("x", nothing, "", group), told)

    for hint in (int | str, list, list[list[int]], Literal[1, 2], Literal["a", 1], Empty, dict, bytes, object, tuple[int, ...], 5, type(None), "int"):

        refused("cli.kind", lambda hint=hint: make("x", hinted(hint)), told)

    refused("cli.kind", lambda: make("x", hinted(list[int], kind=REST)), told)

    for hint, default in ((bool, None), (bool | None, None), (bool, "yes"), (bool, 1), (list[int], (1,)), (list[int], 1)):

        refused("cli.default", lambda hint=hint, default=default: make("x", hinted(hint, default)), told)

def test_arguments_and_examples_refuse_wrong_declarations () -> None:

    told = { "command": ["seed"] }

    def fresh () -> Any:

        return Command("seed", seed).argument("mode", short="m")

    refused("cli.unknown", lambda: fresh().argument("nope"), told)
    refused("cli.unknown", lambda: fresh().argument(5), told)

    for summary in ("a\tb", "s" * 201, 5): refused("cli.summary", lambda summary=summary: fresh().argument("name", summary), told)
    for short in ("dd", "1", "é", "h", "-", 5, "m"): refused("cli.short", lambda short=short: fresh().argument("name", short=short), told)

    refused("cli.short", lambda: fresh().argument("files", short="f"), told)
    refused("cli.kind", lambda: Command("seed", serve).argument("debug", kind=int), told)
    refused("cli.kind", lambda: fresh().argument("mode", kind=list[int]), told)
    refused("cli.kind", lambda: fresh().argument("mode", kind=dict), told)
    refused("cli.example", lambda: fresh().example(*["e"] * 17), told)
    refused("cli.example", lambda: fresh().example(*["e"] * 16).example("x"), told)

    for line in ("", "a\x1b", "e" * 201, 5): refused("cli.example", lambda line=line: fresh().example(line), told)

    made = fresh().argument("name", "first").argument("name", short="n").argument("mode", short="m").argument("wait", short="W")

    assert made.args[0] == Argument("name", str, None, "first", required=True, short="n") and made.args[2].short == "m"
    assert made.parse(["-n", "x", "-m", "full", "-W", "2"]) == { **BASES["seed"], "name": "x", "mode": "full", "wait": 2.0 }
    assert made.argument("name", short="k").parse(["-k", "x"])["name"] == "x" and made.args[0].summary == "first"
    assert len(fresh().example(*["e"] * 16).examples) == 16 and fresh().example().examples == []
    assert fresh().argument("mode", kind=Literal["a", "b"]).parse(["x", "--mode=b"])["mode"] == "b"
    assert fresh().argument("tag", kind=int).parse(["x", "--tag=1", "--tag=2"])["tag"] == [1, 2]
    assert fresh().argument("files", kind=int).parse(["x", "1", "2"])["files"] == (1, 2)
    assert fresh().argument("name", "s" * 200).args[0].summary == "s" * 200

    refused("cli.flag", lambda: made.parse(["-n", "x"]), { "flag": ["-n"] }, Code.BAD_REQUEST)
    refused("cli.value", lambda: fresh().argument("mode", kind=Literal["a", "b"]).parse(["x", "--mode=c"]), { "mode": ["choice"], "choices": ["a", "b"] }, Code.BAD_REQUEST)

def test_cli_refuses_wrong_declarations () -> None:

    make: Any = Cli
    cli: Any  = Cli("engine", "", "1.0")

    for program in ("", "p" * 65, "a b", "a\x1b", 5, None): refused("cli.program", lambda program=program: make(program, "s", "1"))
    for summary in (5, "s" * 201, "a\nb", None): refused("cli.summary", lambda summary=summary: make("p", summary, "1"))
    for version in ("", "v" * 65, 1, "1\n", None): refused("cli.version", lambda version=version: make("p", "s", version))

    refused("cli.default", lambda: make("p", "s", "1", 5))
    refused("cli.writer", lambda: cli.setup(5))
    refused("cli.writer", lambda: cli.setup(print, "err"))
    refused("cli.name", lambda: cli.register("seed"))
    refused("cli.name", lambda: cli.register(Command("help", nothing)))
    refused("cli.name", lambda: cli.register(Command("version", nothing)))
    refused("cli.duplicate", lambda: cli.register(Command("a", nothing), Command("a", nothing)), { "command": ["a"] })
    refused("cli.duplicate", lambda: cli.command("a")(nothing), { "command": ["a"] })
    refused("cli.command", lambda: cli.get(5), { "command": ["5"] }, Code.NOT_FOUND)
    refused("cli.command", lambda: cli.get("b"), { "command": ["b"] }, Code.NOT_FOUND)
    refused("cli.command", lambda: cli.manual("zz"), { "command": ["zz"] }, Code.NOT_FOUND)

    assert cli.names() == ("a",) and (cli.has(5), cli.has("a"), cli.has("b")) == (False, True, False)
    assert make("p" * 64, "s" * 200, "v" * 64, "serve").program == "p" * 64 and make("p", "", "1 2").version == "1 2"
    assert cli.setup(print, None) is cli and cli.setup() is cli and cli.register() is cli
    assert cli.manual() == lined(
        "engine 1.0", "", "Usage: engine <command> [arguments] [--options]", "", "general", "  a", "",
        "Run 'engine help <command>' for one command.",
    )
    assert cli.describe() == { "program": "engine", "version": "1.0", "default": None, "commands": [
        { "name": "a", "group": "general", "usage": "a", "summary": "", "arguments": [] },
    ] }

    full = Cli("engine", "", "1.0")

    full.register(*(Command(f"c{index}", nothing) for index in range(512)))

    refused("cli.full", lambda: full.register(Command("extra", nothing)), { "command": ["extra"] })

    assert len(full.names()) == 512 and not full.has("extra")

def test_run_routes_helps_and_answers () -> None:

    desk = Desk()
    made = desk.cli.command("show", "Show one", "database")(nothing)
    argv: Any

    CALLS.clear()
    log.setup("debug", "json")

    assert desk.cli.get("show") is made and desk.cli.has("show") and made.summary == "Show one"
    assert desk.cli.names() == ("cache:put", "many", "nums", "paint", "seed", "serve", "show")
    assert desk.cli.manual() == MANUAL.replace("  seed       Seed data", "  seed       Seed data\n  show       Show one")
    assert desk.cli.manual("seed") == SEEDING and desk.cli.describe()["commands"][0] == desk.cli.get("seed").describe()
    assert [item["name"] for item in desk.cli.describe()["commands"]][-1] == "show"

    for argv in ((), ("help",), ("-h",), ("--help",), ("help", "help"), ("help", "version")):

        assert desk.run(*argv) == (0, [desk.cli.manual()], []), argv

    for argv in (("help", "seed"), ("--help", "seed"), ("-h", "seed"), ("seed", "--help"), ("seed", "-h"), ("seed", "x", "--mode", "-h")):

        assert desk.run(*argv) == (0, [SEEDING], []), argv

    for argv in (("version",), ("--version",), ("-V",), ("version", "extra")): assert desk.run(*argv) == (0, ["engine 1.0"], []), argv

    assert CALLS == []
    assert desk.run("seed", "x", "--", "-h") == (0, [], []) and last() == ("seed", "x", ("-h",), "fast", None, 1.0)
    assert desk.run("serve", "-dn4", "9000") == (0, [], []) and last() == ("serve", 9000, True, 4, Level.LOW, True)
    assert desk.run("nums", "1", "2", "4") == (7, [], []) and desk.run("nums") == (0, [], [])
    assert desk.run("nums", "100", "200") == (1, [], []) and desk.run("nums", "-1") == (1, [], [])
    assert desk.cli.run(("nums", "3")) == 3

    with log.capture() as events:

        assert desk.run("seed") == (2, [], ["error: Missing argument (cli.missing)\n  name: required", "usage: engine " + USAGES["seed"]])
        assert desk.run("sed") == (2, [], ["error: Unknown command (cli.command)\n  command: sed\n  nearest: seed", HINT])
        assert desk.run("serve", "--prot=1") == (2, [], ["error: Unknown option (cli.flag)\n  flag: --prot\n  nearest: --port", "usage: engine " + USAGES["serve"]])
        assert desk.run("serve", "\x1b[31mred") == (2, [], ["error: Invalid value (cli.value)\n  port: parse.integer", "usage: engine " + USAGES["serve"]])
        assert desk.run("seed", "x", "--mode=slow") == (2, [], ["error: Invalid value (cli.value)\n  mode: choice\n  choices: fast, full", "usage: engine " + USAGES["seed"]])
        assert desk.run("help", "seed", "extra") == (2, [], ["error: Unexpected argument (cli.argument)\n  extra: extra", HINT])
        assert desk.run("help", "nope") == (2, [], ["error: Unknown command (cli.command)\n  command: nope", HINT])
        assert desk.run("\x1b[31mred") == (2, [], ["error: Unknown command (cli.command)\n  command: ?[31mred", HINT])
        assert desk.run("x" * 100) == (2, [], ["error: Unknown command (cli.command)\n  command: " + "x" * 64, HINT])
        assert desk.run("--port=1") == (2, [], ["error: Unknown command (cli.command)\n  command: --port=1", HINT])
        assert desk.run("") == (2, [], ["error: Unknown command (cli.command)\n  command: ", HINT])

    assert marks(events) == [("cli.refused", "debug", None, reason) for reason in (
        "cli.missing", "cli.command", "cli.flag", "cli.value", "cli.value", "cli.argument", "cli.command", "cli.command",
        "cli.command", "cli.command", "cli.command",
    )]

    with log.capture() as events:

        for argv in ("version", ["serve", 5], b"version", 5):

            desk.err.clear()

            assert desk.cli.run(cast("list[str]", argv)) == 1 and desk.err == [f"error: {WRONG} (cli.tokens)", HINT], argv

    assert marks(events) == [("cli.refused", "error", None, "cli.tokens")] * 4
    assert desk.cli.say("plain \x1b") == 0 and desk.out[-1] == "plain \x1b"
    assert [desk.cli.fail("no"), desk.cli.fail("no", 0), desk.cli.fail("no", 3), desk.cli.fail("no", 300)] == [1, 1, 3, 1]
    assert [desk.cli.fail("no", code=True), desk.cli.fail("no", code=False), desk.cli.fail("no", -1), desk.cli.fail("no", 255)] == [1, 1, 1, 255]
    assert desk.err[-8:] == ["no"] * 8 and desk.out == ["plain \x1b"]

def test_the_default_command_takes_the_bare_line () -> None:

    desk = Desk("serve")
    lost = Desk("ghost")

    CALLS.clear()
    log.setup("debug", "json")

    assert desk.run() == (0, [], []) and last() == ("serve", 8000, False, 1, Level.LOW, True)
    assert desk.run("--port=7000") == (0, [], []) and last()[1] == 7000
    assert desk.run("-d") == (0, [], []) and last()[2] is True
    assert desk.run("--", "9000") == (0, [], []) and last()[1] == 9000
    assert desk.run("serve", "--port=1") == (0, [], []) and last()[1] == 1
    assert desk.run("seed", "x") == (0, [], []) and last()[0] == "seed" and len(CALLS) == 6
    assert desk.run("9000") == (2, [], ["error: Unknown command (cli.command)\n  command: 9000", HINT])
    assert desk.run("--zzz") == (2, [], ["error: Unknown option (cli.flag)\n  flag: --zzz", "usage: engine " + USAGES["serve"]])
    assert desk.run("--help") == (0, [desk.cli.manual()], []) and desk.run("-V") == (0, ["engine 1.0"], [])
    assert desk.run("--port", "-h") == (0, [SERVING], []) and len(CALLS) == 6
    assert desk.cli.describe()["default"] == "serve"

    with log.capture() as events:

        assert lost.run() == (1, [], [f"error: {WRONG} (cli.default)\n  command: ghost", HINT])
        assert lost.run("--port=1") == (1, [], [f"error: {WRONG} (cli.default)\n  command: ghost", HINT])

    assert marks(events) == [("cli.refused", "error", None, "cli.default")] * 2
    assert lost.run("seed", "x") == (0, [], []) and lost.run("help") == (0, [lost.cli.manual()], [])

def test_actions_leave_by_code_exit_fault_crash_and_interrupt () -> None:

    desk = Desk()

    desk.cli.register(
        Command("answer", answer), Command("reply", reply), Command("later", later), Command("leave", leave),
        Command("depart", depart), Command("crash", crash), Command("wreck", wreck),
    )
    log.setup("debug", "json")

    for kind, (_, code) in RETURNS.items():

        assert desk.run("answer", kind) == (code, [], []), kind
        assert desk.run("reply", kind) == (code, [], []), kind
        assert desk.run("later", kind) == (code, [], []), kind

    for kind, (_, code, said) in EXITS.items():

        assert desk.run("leave", kind) == (code, [], said), kind
        assert desk.run("depart", kind) == (code, [], said), kind

    for name in ("crash", "wreck"):

        with log.capture() as events:

            assert desk.run(name, "client") == (1, [], ["error: No such order (order.missing)\n  id: unknown, gone"])
            assert desk.run(name, "server") == (1, [], [f"error: {Code.UNAVAILABLE.message()} (thread.broken)"])
            assert desk.run(name, "bare") == (1, [], [f"error: {Code.CONFLICT.message()} (conflict)"])
            assert desk.run(name, "loud") == (1, [], [f"error: m?{'x' * 198} (r?{'y' * 62})\n  f?{'z' * 62}: v?{'w' * 198}"])
            assert desk.run(name, "stop") == (130, [], []) and desk.run(name, "cancel") == (130, [], [])

        assert marks(events) == [
            ("cli.failed", "debug", name, "order.missing"), ("cli.failed", "error", name, "thread.broken"),
            ("cli.failed", "debug", name, None), ("cli.failed", "debug", name, "r\n" + "y" * 100),
        ]

        with log.capture() as events:

            assert desk.run(name, "value") == (1, [], ["error: ValueError (cli.crashed)"])
            assert desk.run(name, "group") == (1, [], ["error: ExceptionGroup (cli.crashed)"])

        assert marks(events) == [("cli.crashed", "error", name, None)] * 2
        assert "ValueError: secret-value" in events[0]["exception"] and "secret-group" in events[1]["exception"]

async def test_calls_answer_inside_a_running_loop () -> None:

    desk = Desk()

    desk.cli.register(
        Command("answer", answer), Command("reply", reply), Command("later", later), Command("leave", leave),
        Command("depart", depart), Command("crash", crash), Command("wreck", wreck), Command("hang", hang),
    )
    log.setup("debug", "json")

    for kind, (_, code) in RETURNS.items():

        assert await desk.call("answer", kind) == (code, [], []), kind
        assert await desk.call("reply", kind) == (code, [], []), kind
        assert await desk.call("later", kind) == (code, [], []), kind
        assert desk.run("answer", kind) == (code, [], []), kind

    for kind, (_, code, said) in EXITS.items():

        assert await desk.call("leave", kind) == (code, [], said), kind
        assert await desk.call("depart", kind) == (code, [], said), kind

    assert await desk.call() == (0, [desk.cli.manual()], []) and await desk.call("help", "seed") == (0, [SEEDING], [])
    assert await desk.call("version") == (0, ["engine 1.0"], [])
    assert await desk.call("sed") == (2, [], ["error: Unknown command (cli.command)\n  command: sed\n  nearest: seed", HINT])
    assert await desk.call("wreck", "value") == (1, [], ["error: ValueError (cli.crashed)"])
    assert await desk.call("crash", "client") == (1, [], ["error: No such order (order.missing)\n  id: unknown, gone"])
    assert await desk.cli.call(cast("list[str]", "version")) == 1 and desk.err[-2:] == [f"error: {WRONG} (cli.tokens)", HINT]
    assert await desk.cli.call(("nums", "3")) == 3

    with log.capture() as events:

        assert desk.run("reply", "seven") == (1, [], [f"error: {WRONG} (cli.loop)"])
        assert desk.run("later", "seven") == (1, [], [f"error: {WRONG} (cli.loop)"])

    assert marks(events) == [("cli.failed", "error", "reply", "cli.loop"), ("cli.failed", "error", "later", "cli.loop")]

    held = asyncio.ensure_future(desk.cli.call(["hang"]))

    desk.err.clear()

    await asyncio.sleep(0)

    held.cancel()

    with pytest.raises(asyncio.CancelledError): await held
    with pytest.raises(asyncio.CancelledError): await desk.cli.call(["wreck", "cancel"])
    with pytest.raises(asyncio.CancelledError): await desk.cli.call(["crash", "cancel"])
    with pytest.raises(KeyboardInterrupt): await desk.cli.call(["crash", "stop"])

    assert desk.err == [] and desk.out == []

def test_tables_align_by_what_the_terminal_shows () -> None:

    desk = Desk()
    rows: list[list[object]] = [["orders", "ready"], ["طلبات", 3], ["x"], ["日本", "é"], ["a\x1b", None], ["wide", "y" * 300]]

    assert desk.cli.table(["name", "state"], rows) == 0
    assert desk.out == [
        "name    state", "orders  ready", "طلبات   3", "x", "日本    é", "a?      None", "wide    " + "y" * 200,
    ]

    desk.out.clear()

    assert desk.cli.table(("id", "é", "tail"), ((index, "é", "") for index in range(2))) == 0
    assert desk.out == ["id  é  tail", "0   é", "1   é"]
    assert desk.cli.table(["a"], [["1", "2"], [Level.HIGH, Shade.LIGHT, "z"]]) == 0 and desk.out[-3:] == ["a", "1     2", "high  2  z"]
    assert desk.cli.table((), ()) == 0 and desk.out[-1] == "" and desk.err == []

def test_streams_carry_the_words_and_survive_their_loss ( capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch ) -> None:

    cli   = Cli("engine", "The engine", "1.0").register(*commands())
    lines: list[str] = []
    shut  = io.StringIO()

    shut.close()

    assert cli.run(["version"]) == 0 and capsys.readouterr() == ("engine 1.0\n", "")
    assert cli.run(["nope"]) == 2 and capsys.readouterr() == ("", f"error: Unknown command (cli.command)\n  command: nope\n{HINT}\n")
    assert cli.say("a") == 0 and cli.fail("b") == 1 and cli.table(["h"], [["c"]]) == 0 and capsys.readouterr() == ("a\nh\nc\n", "b\n")

    CALLS.clear()

    monkeypatch.setattr(sys, "argv", ["engine", "serve", "--port=9"])

    assert cli.run() == 0 and CALLS == [("serve", 9, False, 1, Level.LOW, True)]

    monkeypatch.setattr(sys, "argv", ["engine"])

    assert cli.run() == 0 and capsys.readouterr() == (cli.manual() + "\n", "")

    for lost in (shut, None, Jammed(OSError("full")), Jammed(ValueError("shut")), Jammed(None, OSError("full")), Jammed(None, ValueError("shut"))):

        with monkeypatch.context() as patch:

            patch.setattr(sys, "stdout", lost)
            patch.setattr(sys, "stderr", lost)

            assert [cli.run(["version"]), cli.run(["nope"]), cli.say("x"), cli.fail("x"), cli.run(["nums", "7"])] == [0, 2, 0, 1, 7]

    for cut in (Jammed(BrokenPipeError()), Jammed(None, BrokenPipeError()), Jammed(BrokenPipeError(), BrokenPipeError())):

        with monkeypatch.context() as patch:

            patch.setattr(sys, "stdout", cut)

            assert [cli.run(["version"]), cli.run(["nums", "7"]), cli.run(["nope"])] == ([141, 7, 2] if cut.flushed is None else [141] * 3)
            assert cli.say("x") == 0 and cli.run(["nums"]) == 141

            cli.setup(lines.append, lines.append)

            assert cli.run(["version"]) == 0 and cli.run(["nope"]) == 2 and lines[-3] == "engine 1.0"

            cli.setup()

    with monkeypatch.context() as patch:

        patch.setattr(sys, "stderr", Jammed(None, BrokenPipeError()))

        assert cli.run(["nope"]) == 2 and cli.run(["nums", "7"]) == 7 and cli.run(["version"]) == 0

    assert capsys.readouterr().out == "engine 1.0\n"
    assert cli.setup(deaf, deaf).run(["version"]) == 0 and cli.run(["nope"]) == 2 and cli.fail("x") == 1

    read, write = os.pipe()

    os.close(read)

    with os.fdopen(write, "w", encoding="utf-8") as pipe, monkeypatch.context() as patch:

        patch.setattr(sys, "stdout", pipe)

        assert cli.setup().run(["version"]) == 141
        assert os.fstat(pipe.fileno()).st_rdev == Path(os.devnull).stat().st_rdev
        assert cli.run(["version"]) == 0

async def test_a_closed_pipe_ends_the_process_quietly () -> None:

    for flags in ((), ("-u",)):

        read, write = os.pipe()

        try: child = await asyncio.create_subprocess_exec(sys.executable, *flags, "-c", CHILD, stdin=PIPE, stdout=write, stderr=PIPE)
        finally:

            os.close(write)
            os.close(read)

        _, wrong = await child.communicate(b"")

        assert (child.returncode, wrong) == (141, b""), flags
