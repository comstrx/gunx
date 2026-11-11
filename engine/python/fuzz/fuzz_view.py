from engine.error import Code, Fault
from engine.thread import thread
from engine.view import View
from engine.view.arch import BITS, ELEMENT, LEFT, MOST, NAME, RESERVED, TEXTS, WORD
from collections.abc import Awaitable, Callable, Coroutine
from functools import partial
from hypothesis import assume, HealthCheck, given, settings, strategies as st
from jinja2.filters import FILTERS
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, cast
import asyncio

type Made = str | Fault
type Grow = tuple[str, Callable[[int], str]]
type Act  = tuple[str, str, int]
type Pick = tuple[int, int]

EXAMPLES = 1000
STEPS    = 2_000
OUTPUT   = 4_096
SLACK    = 16
OUTCOMES = {
    "view.syntax": Code.INTERNAL, "view.render": Code.INTERNAL, "view.limit": Code.INTERNAL, "view.unsafe": Code.FORBIDDEN,
    "view.missing": Code.NOT_FOUND,
}
MARKS    = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&#34;" }
SNIPPETS = (
    "{{ who }}", "{{ rows | length }}", "{% for a in rows %}{{ a }}{% endfor %}", "{% for a in range(9) %}.{% endfor %}",
    "{% for a in range(99999) %}", "{% endfor %}", "{% if who %}", "{% else %}", "{% endif %}", "{{ 'a' * 99999 }}",
    "{{ 9 ** 99999 }}", "{{ who.__class__ }}", "{{ rows.append(1) }}", "{{ conf.update(a=2) }}", "{% set b = who ~ who %}",
    "{% set b %}", "{% endset %}", "{{ b }}", "{% macro m(n) %}", "{% endmacro %}", "{{ m(1) }}", "{% include 'part' %}",
    "{% include 'nope' %}", "{% include 'spin' %}", "{% extends 'base' %}", "{% block body %}", "{% endblock %}", "{{ super() }}",
    "{{ '%99999d' % 1 }}", "{{ who | center(99999) }}", "{{ who.ljust(99999) }}", "{{ rows | join(who) }}", "{{ self }}",
    "{{ loop.index }}", "{{ missing.deep.er }}", "{{ 1 / 0 }}", "{% raw %}", "{% endraw %}", "{# note #}", "{{ conf | tojson }}",
    "{{ who | upper | list }}", "{% with a = rows %}", "{% endwith %}", "{% filter upper %}", "{% endfilter %}", "{% call m(2) %}",
    "{% endcall %}", "{{ caller() }}", "{{ range(5) | list }}", "{{ rows * 99999 }}", "{{ (rows * 9) | batch(3, 'x') | list }}",
    "{{ rows[::-1] }}", "{{ who[:99999] }}", "{{ cycler(1, 2).next() }}", "{{ namespace(a=1).a }}", "{{ dict(a=who) }}",
    "{{ lipsum() }}", "{% import 'lib' as lib %}", "{{ lib.twice(who) }}", "{% from 'lib' import twice %}", "{{ twice(rows) }}",
    "{{ who.translate({119: 'x' * 99999}) }}", "{{ '{0.__class__}'.format(who) }}", "{{ rows | map('upper') | list }}",
)
SCRAPS   = (
    "{{", "}}", "{%", "%}", "{#", "#}", " ", "\n", "who", "rows", "conf", "a", "b", "|", "upper", "length", "join", "(", ")", "[",
    "]", ".", ",", "*", "**", "+", "~", "%", "9", "99999", "'a'", "'%s'", "for a in ", "endfor", "if ", "endif", "set b = ", "range",
    "m", "self", "loop", "__class__", "__mro__", "format", "replace", "center", "-", "=", "not ", " is ", "defined", "'", "\\",
    "\x00", "é", "{", "}",
)
LIBRARY  = {
    "base": "<{% block body %}base{% endblock %}>", "part": "part {{ who }}", "spin": "{% include 'spin' %}",
    "lib": "{% macro twice(x) %}{{ x }}{{ x }}{% endmacro %}",
}
PAGES    = { "m.html": "[{{ v }}]", "m.txt": "[{{ v }}]", "in.html": "{% include 'm.txt' %}|{{ v }}|{{ v | safe }}" }
FILES    = { "a.html": "A", "sub/b.txt": "B", "sub/deep/c.html": "C" }
PARTS    = ("a.html", "sub", "b.txt", "deep", "c.html", "..", ".", "", "secret.txt", "root", " ", "\x00", "\n", "\\")
LOOPS    = {
    "rows": "{% for a in rows %}.{% endfor %}", "test": "{% for a in rows if a %}.{% endfor %}",
    "range": "{% for a in range(n) %}.{% endfor %}", "nested": "{% for a in rows %}{% for b in rows[:1] %}.{% endfor %}{% endfor %}",
}
POURS    = {
    "data": "{{ text }}", "twice": "{{ text }}{{ text }}", "repeat": "{{ 'a' * n }}", "list": "{{ ([0] * n) | length }}",
}
GROWS: dict[str, Grow] = {
    "repeat"  : ("{{ 'ab' * n }}", lambda size: "ab" * size),
    "ljust"   : ("{{ 'a'.ljust(n) }}", "a".ljust),
    "zfill"   : ("{{ '1'.zfill(n) }}", "1".zfill),
    "center"  : ("{{ 'a' | center(n) }}", "a".center),
    "percent" : ("{{ '%*d' % (n, 1) }}", lambda size: f"{1:{size}d}"),
    "format"  : ("{{ '{:>{w}}'.format(1, w=n) }}", lambda size: f"{1:>{size}}"),
    "indent"  : ("{{ 'a' | indent(n, true) }}", lambda size: " " * size + "a"),
    "join"    : ("{{ ('a' * n) | join('bb') }}", lambda size: "bb".join("a" * size)),
    "replace" : ("{{ ('a' * n) | replace('a', 'bbb') }}", lambda size: "bbb" * size),
}
POOL     = ("p0", "p1", "p2", "sub/p3")
TAKEN    = { *FILTERS, "json", "slug", "mask", "squish" }
SEEN: set[int] = set()
VIEWS: dict[tuple[int, int], View] = {}
HOME     = TemporaryDirectory()
ROOT     = Path(HOME.name) / "root"
OUTSIDE  = (str(ROOT.parent / "secret.txt"), "../secret.txt", "sub/../../secret.txt", "sub/../a.html", "x" * 300, "sub", "sub/deep")
SOURCES  = st.lists(st.one_of(st.sampled_from(SNIPPETS), st.sampled_from(SNIPPETS), st.sampled_from(SCRAPS)), max_size=12)
NAMES    = st.one_of(
    st.sampled_from([*sorted(FILES), *OUTSIDE]), st.lists(st.sampled_from(PARTS), max_size=5).map("/".join),
    st.text(max_size=12), st.text(alphabet="ab./\\ \n", max_size=12), st.integers(NAME - 2, NAME + 2).map(lambda size: "n" * size),
)
SIZES    = st.one_of(st.integers(0, 3 * OUTPUT), st.integers(OUTPUT - 40, OUTPUT + 40), st.integers(0, 40))
WHOLE    = st.one_of(st.integers(-(1 << 70), 1 << 70), st.integers(0, BITS + 200).map(lambda bits: 1 << bits))
LABELS   = st.one_of(
    st.from_regex(WORD, fullmatch=True), st.text(max_size=70), st.sampled_from(sorted(FILTERS)), st.integers(), st.none(),
)
GLOBALS  = st.one_of(st.text(max_size=12), st.sampled_from(sorted(RESERVED)), st.from_regex(r"g_[a-z0-9_]{0,8}", fullmatch=True))
VALUES   = st.one_of(
    st.integers(-3, 3), st.integers(MOST - 2, MOST + 2), st.integers(), st.booleans(), st.floats(), st.text(max_size=3), st.none(),
)
ACTS     = st.lists(st.tuples(
    st.sampled_from(["put", "render", "render", "page", "text", "has"]), st.sampled_from(POOL), st.integers(0, 9),
), max_size=8)
PICKS    = st.lists(st.tuples(st.integers(0, 400), st.integers(0, 9)), max_size=6)
loop     = asyncio.new_event_loop()

def memory ( templates: dict[str, str], steps: int = STEPS, output: int = OUTPUT ) -> View:

    made = View()

    made.setup(templates=templates, steps=steps, output=output)

    return made

def tight ( steps: int, output: int ) -> View:

    made = VIEWS.get((steps, output))

    if made is None: made = VIEWS[steps, output] = memory({ **LOOPS, **POURS }, steps, output)

    return made

def folder () -> View:

    made = View()

    for name, source in FILES.items():

        (ROOT / name).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / name).write_text(source)

    (ROOT.parent / "secret.txt").write_text("SECRET")
    made.setup(ROOT)

    return made

def run [T] ( work: Awaitable[T] ) -> T:

    return loop.run_until_complete(cast("Coroutine[Any, Any, T]", work))

async def tried ( work: Awaitable[str] ) -> Made:

    try: return await work
    except Fault as fault: return fault

def denied ( job: Callable[[], object] ) -> Fault | None:

    try: job()
    except Fault as fault: return fault

    return None

def refused ( made: object, reason: str, code: Code = Code.INTERNAL, errors: object = None ) -> bool:

    return isinstance(made, Fault) and made.reason == reason and made.code is code and made.errors == errors

def spent ( made: object, what: str, name: str = "text" ) -> bool:

    return refused(made, "view.limit", Code.INTERNAL, { "view": [name], "limit": [what] })

def limited ( made: object ) -> bool:

    return spent(made, "size") or spent(made, "output")

def shown ( name: str ) -> str:

    return "".join(letter if letter.isprintable() else "?" for letter in name[:NAME])

def sound ( value: object ) -> bool:

    return type(value) is int and 0 < value <= MOST

def marked ( value: object ) -> str:

    return f"{value}!"

def sane ( made: Made ) -> bool:

    if isinstance(made, str): return len(made) <= OUTPUT

    return OUTCOMES.get(made.reason or "") is made.code and made.errors is not None

WILD     = memory(LIBRARY)
PLAIN    = memory(PAGES)
TIGHT    = memory({})
BOOK     = memory({})
WORLD    = memory({})
TEXTY    = memory({})
FOLDER   = folder()

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(SOURCES.map("".join))
def wild ( source: str ) -> None:

    rows, conf = [1, 2, 3], { "a": 1 }
    made = run(tried(WILD.render_text(source, who="w<", rows=rows, conf=conf)))

    assert sane(made)
    assert LEFT.get() is None
    assert (rows, conf) == ([1, 2, 3], { "a": 1 })

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=200))
def escaped ( text: str ) -> None:

    safe = "".join(MARKS.get(letter, letter) for letter in text)

    assert run(PLAIN.render("m.html", v=text)) == f"[{safe}]"
    assert run(PLAIN.render("m.txt", v=text)) == f"[{text}]"
    assert run(PLAIN.render("in.html", v=text)) == f"[{text}]|{safe}|{text}"
    assert run(PLAIN.render_text("{{ v }}{{ v | e }}{{ v | safe }}", v=text)) == safe + safe + text

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES)
def named ( name: str ) -> None:

    made, held = run(tried(FOLDER.render(name))), FILES.get(name)

    assert (made == held) if held is not None else refused(made, "view.missing", Code.NOT_FOUND, { "view": [shown(name)] })
    assert run(FOLDER.has(name)) is (held is not None)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES)
def held ( name: str ) -> None:

    fresh = View()
    parts = name.split("/")
    valid = 0 < len(name) <= NAME and name.isprintable() and "\\" not in name and not { "", ".", ".." }.intersection(parts)
    made  = denied(lambda: fresh.setup(templates={ name: "x{{ n }}" }))

    assert made is None if valid else refused(made, "view.name")
    assert fresh.ready() is valid

    if valid: assert (run(fresh.names()), run(fresh.render(name, n=1)), run(fresh.has(name))) == ([name], "x1", True)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(1, 64), st.integers(0, 80), st.sampled_from(sorted(LOOPS)))
def budgeted ( steps: int, size: int, kind: str ) -> None:

    made = run(tried(tight(steps, OUTPUT).render(kind, rows=[1] * size, n=size)))
    cost = size if kind in ("rows", "test") else 2 * size

    assert (made == "." * size) if cost <= steps else spent(made, "steps", kind)
    assert LEFT.get() is None

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(1, 300), st.integers(0, 400), st.sampled_from(sorted(POURS)))
def poured ( output: int, size: int, kind: str ) -> None:

    made = run(tried(tight(STEPS, output).render(kind, text="a" * size, n=size)))
    full = { "data": "a" * size, "twice": "a" * 2 * size, "repeat": "a" * size, "list": str(size) }[kind]
    cost = size * ELEMENT if kind == "list" else len(full)

    assert (made == full) if cost <= output else spent(made, "output" if kind in ("data", "twice") else "size", kind)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.sampled_from(sorted(GROWS)), SIZES)
def grown ( kind: str, size: int ) -> None:

    source, model = GROWS[kind]
    full = model(size)
    made = run(tried(TIGHT.render_text(source, n=size)))

    if len(full) > OUTPUT: assert limited(made)
    elif len(full) + SLACK <= OUTPUT: assert made == full
    else: assert made == full or limited(made)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(-(1 << 70), 1 << 70), st.integers(0, 5000), WHOLE, WHOLE)
def numbered ( base: int, power: int, left: int, right: int ) -> None:

    raised = run(tried(TIGHT.render_text("{{ a ** b }}", a=base, b=power)))
    timed  = run(tried(TIGHT.render_text("{{ a * b }}", a=left, b=right)))

    if power > 1 and base.bit_length() * power > BITS: assert spent(raised, "number")
    else: assert raised == str(base ** power)

    if left.bit_length() + right.bit_length() > BITS: assert spent(timed, "number")
    else: assert timed == str(left * right)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(LABELS)
def registered ( name: object ) -> None:

    valid = isinstance(name, str) and WORD.fullmatch(name) is not None and name not in TAKEN
    made  = denied(partial(BOOK.register, cast("Any", name), marked))

    if valid: TAKEN.add(str(name))

    assert (made is None and run(BOOK.render_text(f"{{{{ 'a' | {name} }}}}")) == "a!") if valid else refused(made, "view.filter")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(GLOBALS)
def shared ( name: str ) -> None:

    assume(name != "self")

    valid = name.isidentifier() and name not in RESERVED
    made  = denied(lambda: WORLD.share(**{ name: 7 }))

    assert made is None if valid else refused(made, "view.shared")
    assert run(WORLD.render_text("{{ range(2) | list }}{{ dict(a=1).a }}")) == "[0, 1]1"

    if valid and name.startswith("g_"): assert run(WORLD.render_text(f"{{{{ {name} }}}}")) == "7"

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(VALUES, VALUES)
def tuned ( steps: object, output: object ) -> None:

    fresh = View()
    made  = denied(lambda: fresh.setup(steps=cast("Any", steps), output=cast("Any", output)))

    fine  = sound(steps) and sound(output)

    assert made is None if fine else refused(made, "view.output" if sound(steps) else "view.steps")
    assert fresh.ready() is fine

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ACTS)
def swapped ( acts: list[Act] ) -> None:

    lib = memory({ "page": "<{% include 'p0' %}>" })
    model: dict[str, int] = {}

    for act, name, value in acts:

        mark  = model.get(name)
        first = model.get("p0")

        if act == "put":

            lib.put(name, f"v{value}:{{{{ n }}}}")

            model[name] = value

        elif act == "has": assert run(lib.has(name)) is (mark is not None)
        elif act == "page":

            made = run(tried(lib.render("page", n=value)))

            assert (made == f"<v{first}:{value}>") if first is not None else refused(made, "view.missing", Code.NOT_FOUND, { "view": ["p0"] })

        else:

            job  = lib.render(name, n=value) if act == "render" else lib.render_text(f"[{{% include '{name}' %}}]", n=value)
            made = run(tried(job))
            full = f"v{mark}:{value}" if act == "render" else f"[v{mark}:{value}]"

            assert (made == full) if mark is not None else refused(made, "view.missing", Code.NOT_FOUND, { "view": [name] })

    assert run(lib.names()) == sorted({ "page", *model })
    assert lib.stats()["loaded"] <= len(model) + 1

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PICKS)
def cached ( picks: list[Pick] ) -> None:

    for index, value in picks:

        SEEN.add(index)

        assert run(TEXTY.render_text(f"{index}:{{{{ n }}}}", n=value)) == f"{index}:{value}"
        assert TEXTY.stats()["texts"] == min(len(SEEN), TEXTS)

wild()
escaped()
named()
held()
budgeted()
poured()
grown()
numbered()
registered()
shared()
tuned()
swapped()
cached()

run(thread.close())
loop.close()
HOME.cleanup()

print(f"fuzz view  examples={EXAMPLES * 13}  ok")
