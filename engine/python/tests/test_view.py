from collections.abc import Awaitable, Callable
from functools import partial
from pathlib import Path
from types import MappingProxyType
from typing import Any, cast

from engine.error import Code, Fault
from engine.view import View, view
from engine.view.arch import CACHE, LEFT, MOST, NAME, SMALL, SOURCE, Spent, TEXTS, VERDICTS
from engine.view.sandbox import Sandbox
from jinja2 import DictLoader, pass_eval_context, Template
from jinja2.sandbox import ImmutableSandboxedEnvironment
import asyncio, itertools, os, pytest, threading, tracemalloc

type Data  = dict[str, Any]
type Wrong = tuple[str, Callable[[], object]]

class Row:

    def __init__ ( self ) -> None:

        self.name = "n"
        self.tags = ["a"]

    def fresh ( self ) -> list[int]:

        return [1, 2]

    def _hidden ( self ) -> int:

        return 1

BASE     = "<{% block body %}base{% endblock %}>"
TWICE    = "{% macro twice(x) %}{{ x }}{{ x }}{% endmacro %}"
GROW     = "{% set ns = namespace(s='a') %}{% for i in range(60) %}"
HOARD    = "{% set big = 'a' * 1000000 %}{% set ns = namespace(l=[]) %}{% for i in range(5000) %}"
STEPS    = 20_000
OUTPUT   = 1_048_576
ROOM     = 33_554_432
ESCAPES  = (
    "../secret.html", "/etc/passwd", "mail/../hello.html", "mail//welcome.txt", "mail\\welcome.txt", "", "./hello.html",
    "hello.html/", "nope.html",
)
HOSTILE  = (
    ("{{ ''.__class__.__mro__[1].__subclasses__() }}", None), ("{{ who.__init__.__globals__ }}", None),
    ("{{ cycler.__init__.__globals__.os }}", None), ("{{ (1).__class__.__base__ }}", None),
    ("{{ self.__init__.__globals__ }}", None), ("{{ row._hidden() }}", None), ("{{ namespace.__init__.__globals__ }}", None),
    ("{{ range.__func__.__globals__ }}", None), ("{{ dict.mro() }}", None), ("{{ '{0.__class__.__mro__}'.format(1) }}", None),
    ("{{ '{a.__class__.__mro__}'.format_map({'a': 1}) }}", None), ("{{ who.format.__self__.__class__ }}", ""),
    ("{{ 'x'.format.__globals__ }}", ""), ("{{ '{0.__class__}'.format(1) }}", ""), ("{{ self._TemplateReference__context }}", ""),
    ("{{ row.fresh.__func__ }}", ""), ("{{ row.fresh.__globals__ }}", ""), ("{{ range.__self__ }}", ""), ("{{ row.__dict__ }}", ""),
    ("{{ row | attr('__class__') }}", ""), ("{{ [row] | map(attribute='__class__') | list }}", "[Undefined]"),
)
MUTATING = (
    "{{ items.append(1) }}", "{{ items.clear() }}", "{{ data.update(a=2) }}", "{{ data.pop('a') }}", "{{ data.clear() }}",
    "{{ conf.update(a=2) }}", "{% set _ = conf.setdefault('b', 1) %}", "{{ pile.add(1) }}", "{{ 'aaa'.translate({97: 'bbb'}) }}",
    "{{ ''.maketrans('a', 'b') }}", "{{ who.format.__self__.__class__.mro() }}", "{{ ''.__class__.__mro__ }}",
)
LIMITS   = (
    ("steps", "{% for a in range(99999) %}{% for b in range(99999) %}x{% endfor %}{% endfor %}"),
    ("steps", "{% for a in range(99999) if a %}{% for b in range(99999) if b %}x{% endfor %}{% endfor %}"),
    ("steps", "{{ range(10 ** 12) | list | length }}"),
    ("steps", "{{ range(10 ** 30) | length }}"),
    ("steps", "{% for a in count %}{% endfor %}"),
    ("steps", "{% for a in rows %}{% for b in rows %}{% endfor %}{% endfor %}"),
    ("steps", HOARD + "{% set ns.l = ns.l + [big[1:]] %}{% endfor %}{{ ns.l | length }}"),
    ("steps", HOARD + "{% set ns.l = ns.l + ['a' * 1000000] %}{% endfor %}{{ ns.l | length }}"),
    ("output", "{% for a in rows %}{{ wide }}{% endfor %}"),
    ("output", "{% for a in range(6000) %}{{ wide }}{% endfor %}"),
    ("output", "{{ half }}{{ half }}"),
    ("size", "{{ 'a' * 200000000 }}"),
    ("size", "{{ 200000000 * 'a' }}"),
    ("size", "{{ ([0] * 200000000) | length }}"),
    ("size", "{{ '%999999999s' | format('a') | length }}"),
    ("size", "{{ ('%*d' % (999999999, 1)) | length }}"),
    ("size", "{{ ('%0999999999d' % 1) | length }}"),
    ("size", "{{ ('%.999999999f' % 1) | length }}"),
    ("size", "{{ '{:>999999999}'.format(1) | length }}"),
    ("size", "{{ '{:>{w}}'.format(1, w=999999999) | length }}"),
    ("size", "{{ '{a:>999999999}'.format_map({'a': 1}) | length }}"),
    ("size", "{{ 'a'.ljust(999999999) | length }}"),
    ("size", "{{ 'a'.rjust(999999999) | length }}"),
    ("size", "{{ 'a'.center(999999999) | length }}"),
    ("size", "{{ '1'.zfill(999999999) | length }}"),
    ("size", "{{ 'a' | center(999999999) | length }}"),
    ("size", "{{ 'a' | indent(999999999, true) | length }}"),
    ("size", "{{ ('a' * 400000) | replace('a', 'b' * 4000) | length }}"),
    ("size", "{{ ('a' * 400000).replace('', 'bbbbbbbbbbbb') | length }}"),
    ("size", "{{ ('a' * 400000) | join('b' * 4000) | length }}"),
    ("size", "{{ ('b' * 4000).join('a' * 400000) | length }}"),
    ("size", "{{ ('\t' * 100000).expandtabs(100000) | length }}"),
    ("size", "{{ [1] | slice(1000000000) | list | length }}"),
    ("size", "{{ [1] | batch(1000000000, 'x') | list | length }}"),
    ("size", "{{ {'a': 1} | tojson(999999999) | length }}"),
    ("size", "{{ ('a' * 400000) | mask(0, 'b' * 4000) | length }}"),
    ("size", "{{ ('a ' * 200000) | wordwrap(1, true, 'b' * 4000) | length }}"),
    ("size", GROW + "{% set ns.s = ns.s ~ ns.s %}{% endfor %}{{ ns.s | length }}"),
    ("size", GROW + "{% set ns.s = ns.s + ns.s %}{% endfor %}{{ ns.s | length }}"),
    ("size", GROW + "{% set ns.s %}{{ ns.s }}{{ ns.s }}{% endset %}{% endfor %}{{ ns.s | length }}"),
    ("size", "{% macro d(s) %}{{ s }}{{ s }}{% endmacro %}" + GROW + "{% set ns.s = d(ns.s) %}{% endfor %}{{ ns.s | length }}"),
    ("size", "{{ rows | join(wide) | length }}"),
    ("size", "{{ ('%s%s' % (half, half)) | length }}"),
    ("size", "{{ (half ~ half) | length }}"),
    ("size", "{{ (half + half) | length }}"),
    ("size", "{{ (half | upper | list) | length }}"),
    ("number", "{{ (2 ** 3000000) | string | length }}"),
    ("number", "{{ 2 ** 4096 }}"),
    ("number", "{% set n = 2 ** 2048 %}{{ (n * n) | string | length }}"),
    ("depth", "{% macro m(n) %}{{ m(n + 1) }}{% endmacro %}{{ m(0) }}"),
)
FINE     = (
    ("{% for a in range(50) %}{{ a }},{% endfor %}", "".join(f"{index}," for index in range(50))),
    ("{{ 'ab' * 3 }} {{ 2 ** 10 }} {{ 3 * 4 }} {{ '%05d' % 42 }} {{ '{:>6}'.format('x') }} {{ 'a' ~ 'b' ~ 1 }}", "ababab 1024 12 00042      x ab1"),
    ("{{ 'abcdef'[1:3] }} {{ [1, 2] + [3] }} {{ 'x'.center(5) }}|{{ 'a,b' | replace(',', ';') }} {{ [1, 2, 3] | join('-') }}", "bc [1, 2, 3]   x  |a;b 1-2-3"),
    ("{{ tag }} {{ tag ~ tag }} {% set b %}{{ tag }}{% endset %}{{ b }}", "&lt;b&gt; &lt;b&gt;&lt;b&gt; &lt;b&gt;"),
    ("{{ 10 ** 10 ** 10 }}", "1" + "0" * 100),
    ("{{ (2 ** 2048) | string | length }} {{ ((2 ** 2047) * (2 ** 2047)) | string | length }}", "617 1233"),
    ("{{ (half | upper | length) + (half | length) }} {{ 7 | view.tick }}{{ 'ab' | view.sized }}{{ ['a', 'b'] | view.concat }}", "1200000 7abab"),
    ("{% for a in rows %}{% endfor %}{% for a in range(4000) %}{% endfor %}{{ rows | length }}", "6000"),
)
FEATURES = (
    ("{% for a in nothing %}{{ a }}{% else %}none{% endfor %}", "none"),
    ("{% for a in three %}{{ loop.index }}{{ loop.cycle('x', 'y') }}{% endfor %}", "1x2y3x"),
    ("{% for item in tree recursive %}{{ item.name }}{% if item.kids %}({{ loop(item.kids) }}){% endif %}{% endfor %}", "a(b)"),
    ("{% macro box(x) %}[{{ x }}{{ caller() }}]{% endmacro %}{% call box(1) %}in{% endcall %}", "[1in]"),
    ("{% filter upper %}abc{% endfilter %}{% raw %}{{ x }}{% endraw %}{# c #}{% with a = 2 %}{{ a }}{% endwith %}", "ABC{{ x }}2"),
    ("{{ 'a' if n is divisibleby 2 else 'b' }}{{ n is defined }}{{ missing is defined }}{{ 3 in [1, 3] }}", "aTrueFalseTrue"),
    ("{{ d.items() | list }}{{ d.get('a') }}{{ d.keys() | list }}{{ 'a b'.split() }}{{ 'ab'.startswith('a') }}", "[(&#39;a&#39;, 1)]1[&#39;a&#39;][&#39;a&#39;, &#39;b&#39;]True"),
    ("{{ row.name }}{{ row.tags }}{{ row.fresh() }}{{ row.missing }}", "n[&#39;a&#39;][1, 2]"),
    ("{% set ns = namespace(n=0) %}{% for a in range(3) %}{% set ns.n = ns.n + a %}{% endfor %}{{ ns.n }}", "3"),
    ("{{ tag | safe }}{{ tag }}{{ tag | e }}", "<b>&lt;b&gt;&lt;b&gt;"),
    ("{% include 'nope.html' ignore missing %}ok", "ok"),
    ("{% extends 'base.html' %}{% block body %}{{ super() }}child{% endblock %}", "<basechild>"),
    ("{% import 'lib.html' as lib %}{{ lib.twice(3) }}", "33"),
    ("{% from 'lib.html' import twice %}{{ twice('<') }}", "&lt;&lt;"),
    ("{{ range(3) | list }}{{ range(1, 10, 3) | list }}{{ range(5)[1:3] | list }}", "[0, 1, 2][1, 4, 7][1, 2]"),
    ("{{ dict(a=1) }}{{ cycler('a', 'b').next() }}{{ joiner(',')() }}", "{&#39;a&#39;: 1}a"),
    ("{{ ('%(a)s' % {'a': 1}) }}{{ '{a}'.format_map({'a': 2}) }}", "12"),
    ("{{ [1, 2, 3][::-1] }}{{ 'abc'[::-1] }}{{ (1, 2) + (3,) }}", "[3, 2, 1]cba(1, 2, 3)"),
    ("{{ 5 // 2 }}{{ 5 % 2 }}{{ -2 ** 2 }}{{ 2 ** -1 }}{{ 2.5 * 2 }}{{ 'a' * 0 }}{{ 3 * 'ab' }}{{ [1] * 2 }}", "2140.55.0ababab[1, 1]"),
    ("{{ card | mask }} {{ ' a  b ' | squish }} {{ 'Hello World' | slug }} {{ three | json }}", "41************11 a b hello-world [1,2,3]"),
    ("{% if n %}\nyes\n{% endif %}\n  {% if n %}\nso\n  {% endif %}\n", "yes\nso\n"),
)

def memory ( templates: dict[str, str] | None = None, **options: Any ) -> View:

    made = View()

    made.setup(templates=templates or {}, **options)

    return made

def data () -> Data:

    return {
        "wide": "w" * 200, "rows": [0] * 6000, "half": "h" * 600_000, "tag": "<b>", "count": itertools.count(),
        "nothing": [], "three": [1, 2, 3], "n": 4, "d": { "a": 1 }, "row": Row(), "card": "4111111111111111",
        "tree": [{ "name": "a", "kids": [{ "name": "b", "kids": [] }] }],
    }

async def refused ( job: Awaitable[object], reason: str, code: Code = Code.INTERNAL ) -> Fault:

    with pytest.raises(Fault) as caught: await job

    assert caught.value.reason == reason and caught.value.code is code

    return caught.value

def denied ( job: Callable[[], object], reason: str ) -> Fault:

    with pytest.raises(Fault) as caught: job()

    assert caught.value.reason == reason and caught.value.code is Code.INTERNAL

    return caught.value

async def spent ( job: Awaitable[object], what: str, name: str = "text" ) -> None:

    fault = await refused(job, "view.limit")

    assert fault.errors == { "view": [name], "limit": [what] }

async def test_refuses_every_verb_before_setup () -> None:

    unset = View()

    assert not unset.ready() and unset.stats() == { "loaded": 0, "texts": 0, "rendered": 0 }

    for job in (unset.render("x"), unset.render_text("x"), unset.has("x"), unset.names()): await refused(job, "view.setup")

    acts: tuple[Callable[[], object], ...] = (
        lambda: unset.put("a", "b"), lambda: unset.share(a=1), lambda: unset.register("f", str),
    )

    for act in acts: denied(act, "view.setup")

    assert not unset.ready()

async def test_renders_from_a_folder_and_never_leaves_it ( tmp_path: Path ) -> None:

    root = tmp_path / "views"

    (root / "mail").mkdir(parents=True)
    (root / "hello.html").write_text("<p>{{ app }}: {{ name }} {{ tags | json }} {{ title | slug }}</p>")
    (root / "mail" / "welcome.txt").write_text("hi {{ name }}")
    (root / "broken.html").write_text("a\n{% if %}")
    (root / "bad.html").write_bytes(b"\xff\xfe")
    (root / "peek.html").write_text("{% include '../secret.html' %}")
    (root / "pick.html").write_text("{% include path %}")
    (tmp_path / "secret.html").write_text("SECRET")

    view.setup(root, app="Engine")

    names = ["bad.html", "broken.html", "hello.html", "mail/welcome.txt", "peek.html", "pick.html"]
    made  = await view.render("hello.html", name="<b>x</b>", tags=["a"], title="Hello World")

    assert view.ready() and await view.names() == names
    assert made == "<p>Engine: &lt;b&gt;x&lt;/b&gt; [&#34;a&#34;] hello-world</p>"
    assert await view.render("mail/welcome.txt", name="<n>") == "hi <n>"
    assert await view.has("hello.html") and await view.has("mail/welcome.txt") and await view.has("broken.html")

    for name in ESCAPES:

        fault = await refused(view.render(name), "view.missing", Code.NOT_FOUND)

        assert fault.errors == { "view": [name] } and not await view.has(name)

    odd  = await refused(view.render("a\nb\x00.html"), "view.missing", Code.NOT_FOUND)
    long = await refused(view.render("x" * 300), "view.missing", Code.NOT_FOUND)
    peek = await refused(view.render("peek.html"), "view.missing", Code.NOT_FOUND)
    pick = await refused(view.render("pick.html", path=str(tmp_path / "secret.html")), "view.missing", Code.NOT_FOUND)
    wild = await refused(view.render("pick.html", path="a\nb"), "view.missing", Code.NOT_FOUND)

    assert odd.errors == { "view": ["a?b?.html"] } and long.errors == { "view": ["x" * NAME] }
    assert peek.errors == { "view": ["../secret.html"] } and wild.errors == { "view": ["a?b"] }
    assert pick.errors == { "view": [str(tmp_path / "secret.html")] }
    assert (await refused(view.render("broken.html"), "view.syntax")).errors == { "view": ["broken.html:2"] }
    assert (await refused(view.render("bad.html"), "view.load")).errors == { "view": ["bad.html"] }

    await refused(view.has("bad.html"), "view.load")
    await refused(view.render(cast(Any, 5)), "view.name")
    denied(lambda: view.put("x.txt", "x"), "view.folder")

    assert not await view.has(cast(Any, 5)) and not await view.has(cast(Any, None))
    assert view.stats() == { "loaded": 4, "texts": 0, "rendered": 2 }

async def test_escapes_by_extension_and_never_renders_data_as_a_template () -> None:

    lib = memory({
        "m.txt": "hi {{ who }}", "M.TXT": "hi {{ who }}", "m.html": "hi {{ who }}", "m.md": "hi {{ who }}", "plain": "hi {{ who }}",
        "page.html": "{% include 'm.txt' %}|{{ raw }}|{{ who | safe }}", "cat.txt": "{{ who ~ who }}|{{ who + who }}",
    })

    for name in ("m.txt", "M.TXT"): assert await lib.render(name, who="<script>") == "hi <script>"
    for name in ("m.html", "m.md", "plain"): assert await lib.render(name, who="<script>") == "hi &lt;script&gt;"

    assert await lib.render("page.html", who="<a>", raw="{{ 7 * 7 }}{% include 'm.txt' %}") == "hi <a>|{{ 7 * 7 }}{% include &#39;m.txt&#39; %}|<a>"
    assert await lib.render_text("{{ who }}{{ who | safe }}{{ who | e }}{{ missing }}", who="<a&b>") == "&lt;a&amp;b&gt;<a&b>&lt;a&amp;b&gt;"
    assert await lib.render("m.txt", template="x", who="t") == "hi t" and await lib.render_text("{{ source }}", source="s") == "s"
    assert await lib.render("cat.txt", who="<a>") == "<a><a>|<a><a>"
    assert await lib.names() == ["M.TXT", "cat.txt", "m.html", "m.md", "m.txt", "page.html", "plain"]

@pytest.mark.parametrize(("source", "expected"), FEATURES)
async def test_keeps_the_template_language_whole ( source: str, expected: str ) -> None:

    lib = memory({ "base.html": BASE, "lib.html": TWICE })

    assert await lib.render_text(source, **data()) == expected

@pytest.mark.parametrize(("source", "expected"), HOSTILE)
async def test_hides_every_internal_attribute ( source: str, expected: str | None ) -> None:

    lib = memory()
    job = lib.render_text(source, who="x", row=Row())

    if expected is not None: assert await job == expected
    else: assert (await refused(job, "view.unsafe", Code.FORBIDDEN)).errors == { "view": ["text"] }

async def test_refuses_mutation_and_leaves_the_data_intact () -> None:

    items: list[int] = [7]
    held:  dict[str, int] = { "a": 1 }
    conf:  dict[str, int] = { "a": 1 }
    pile:  set[int] = { 3 }
    lib    = memory(conf=conf)

    for source in MUTATING:

        fault = await refused(lib.render_text(source, items=items, data=held, pile=pile, who="x"), "view.unsafe", Code.FORBIDDEN)

        assert fault.errors == { "view": ["text"] }

    await refused(lib.render_text("{% set conf.a = 2 %}"), "view.render")
    await refused(lib.render_text("{% set row.name = 2 %}", row=Row()), "view.render")

    assert items == [7] and held == { "a": 1 } and conf == { "a": 1 } and pile == { 3 }
    assert await lib.render_text("{% set conf = 5 %}{{ conf }}") == "5" and await lib.render_text("{{ conf.a }}") == "1"
    assert await lib.render_text("{{ items | length }}{{ data.get('a') }}{{ 3 in pile }}", items=items, data=held, pile=pile) == "11True"

@pytest.mark.parametrize(("what", "source"), LIMITS)
async def test_bounds_every_runaway_template ( what: str, source: str ) -> None:

    tight = memory(steps=STEPS, output=OUTPUT)

    await spent(tight.render_text(source, **data()), what)

    assert LEFT.get() is None and tight.stats()["rendered"] == 0
    assert await tight.render_text("{{ 'ok' }}") == "ok"

@pytest.mark.parametrize(("source", "expected"), FINE)
async def test_lets_honest_templates_through_the_same_bounds ( source: str, expected: str ) -> None:

    tight = memory(steps=STEPS, output=OUTPUT)

    assert await tight.render_text(source, **data()) == expected

async def test_spends_the_budget_exactly_at_its_edges () -> None:

    tight = memory({ "loop.txt": "{% for a in rows %}.{% endfor %}" }, steps=10, output=64)
    loops = ("{% for a in rows %}.{% endfor %}", "{% for a in rows if a %}.{% endfor %}")

    for source in loops:

        assert await tight.render_text(source, rows=[1] * 10) == "." * 10

        await spent(tight.render_text(source, rows=[1] * 11), "steps")

    assert await tight.render_text("{% for a in range(n) %}.{% endfor %}", n=5) == "....."
    assert await tight.render_text("{{ 'a' * n }}", n=64) == "a" * 64 and await tight.render_text("{{ text }}", text="a" * 64) == "a" * 64

    await spent(tight.render_text("{% for a in range(n) %}.{% endfor %}", n=6), "steps")
    await spent(tight.render_text("{{ 'a' * n }}", n=65), "size")
    await spent(tight.render_text("{{ text }}", text="a" * 65), "output")
    await spent(tight.render("loop.txt", rows=[1] * 11), "steps", "loop.txt")
    await spent(tight.render_text(loops[1], rows=[0] * 11), "steps")
    await spent(tight.render_text("{{ ([0] * n) | length }}", n=2), "size")

    assert await tight.render_text("{{ ([0] * n) | length }}", n=1) == "1" and await tight.render_text(loops[1], rows=[0] * 10) == ""

    wide = memory(steps=10)

    for size in (1_023, 10 * 1_024, 11 * 1_024 - 1): assert await wide.render_text("{{ big | upper | length }}", big="a" * size) == str(size)

    await spent(wide.render_text("{{ big | upper | length }}", big="a" * 11 * 1_024), "steps")
    await spent(wide.render_text("{{ rows | list | length }}", rows=range(11 * 16)), "steps")

    assert await wide.render_text("{{ rows | list | length }}", rows=range(10 * 16)) == "160"

    odd, one, mid = memory(steps=11), memory(steps=1), memory(output=2_048)
    chain = "{{ big | upper | lower | length }}"

    await spent(odd.render_text("{% for a in range(n) %}.{% endfor %}", n=6), "steps")
    await spent(one.render_text(chain, big="a" * 1_024), "steps")
    await spent(mid.render_text("{{ big | upper | length }}", big="a" * 2_049), "size")

    assert await one.render_text(chain, big="a" * 1_023) == "1023"
    assert await mid.render_text("{{ big | upper | length }}", big="a" * 2_048) == "2048"

async def test_defaults_to_generous_budgets () -> None:

    stock = memory()
    loop  = "{% for a in rows %}{% endfor %}{{ rows | length }}"

    assert await stock.render_text(loop, rows=[1] * 100_000) == "100000"
    assert len(await stock.render_text("{{ text }}", text="a" * 8_388_608)) == 8_388_608

    await spent(stock.render_text(loop, rows=[1] * 100_001), "steps")
    await spent(stock.render_text("{{ text }}", text="a" * 8_388_609), "output")

async def test_refuses_growth_before_allocating_it () -> None:

    tight = memory(steps=STEPS, output=OUTPUT)
    given = data()

    tracemalloc.start()

    try:

        for what, source in LIMITS:

            if what != "size": continue

            tracemalloc.reset_peak()

            await spent(tight.render_text(source, **given), "size")

            assert tracemalloc.get_traced_memory()[1] < ROOM, source

    finally: tracemalloc.stop()

def test_weighs_a_growing_filter_before_running_it () -> None:

    box = Sandbox()
    calls: list[tuple[object, ...]] = []

    def job ( *args: object, **options: object ) -> str:

        calls.append(args)

        return "made"

    @pass_eval_context
    def aware ( mood: object, *args: object ) -> str:

        calls.append(args)

        return "made"

    box.output = 100

    plain, passed, free = box.weighed("center", job), box.weighed("center", aware), box.weighed("upper", job)
    wrong: tuple[Callable[[], object], ...] = (
        lambda: plain("a", 101), lambda: passed(None, "a", 101), lambda: plain("a", width=101),
    )

    assert plain("a", 100) == "made" and passed(None, "a", 100) == "made" and free("a", 10 ** 9) == "made" and len(calls) == 3

    for act in wrong:

        with pytest.raises(Spent) as caught: act()

        assert caught.value.what == "size"

    assert len(calls) == 3

async def test_keeps_a_bounded_number_of_loaded_templates () -> None:

    lib = memory({ f"t{index}.txt": f"{index} {{{{ n }}}}" for index in range(CACHE + 8) })

    for index in range(CACHE + 8): assert await lib.render(f"t{index}.txt", n=1) == f"{index} 1"

    assert lib.stats() == { "loaded": CACHE, "texts": 0, "rendered": CACHE + 8 }
    assert await lib.render(f"t{CACHE + 7}.txt", n=2) == f"{CACHE + 7} 2" and await lib.render("t0.txt", n=3) == "0 3"

async def test_gives_every_render_its_own_budget () -> None:

    tight = memory({ "loop.txt": "{% for a in rows %}{{ a }}{% endfor %}" }, steps=10)
    rows  = list(range(10))
    full  = list(range(12))
    made  = await asyncio.gather(*(tight.render("loop.txt", rows=rows) for _ in range(200)))

    assert made == ["0123456789"] * 200 and LEFT.get() is None

    await spent(tight.render("loop.txt", rows=[*rows, 10]), "steps", "loop.txt")

    mixed = await asyncio.gather(*(tight.render("loop.txt", rows=full[:index % 12]) for index in range(120)), return_exceptions=True)
    fine  = [made for made in mixed if isinstance(made, str)]

    assert len(fine) == 110 and all(isinstance(made, Fault) and made.reason == "view.limit" for made in mixed if made not in fine)
    assert await tight.render("loop.txt", rows=rows) == "0123456789" and tight.stats() == { "loaded": 1, "texts": 0, "rendered": 311 }

async def test_passes_faults_through_and_wraps_every_other_failure () -> None:

    def closed () -> None: raise Fault(Code.FORBIDDEN, reason="shop.closed")

    def leave () -> None: raise SystemExit(3)

    def broken () -> None: raise OSError("disk")

    lib = memory()

    assert (await refused(lib.render_text("{{ job() }}", job=closed), "shop.closed", Code.FORBIDDEN)).errors is None

    for job, kind in ((leave, SystemExit), (broken, OSError)):

        fault = await refused(lib.render_text("a{{ job() }}", job=job), "view.render")

        assert fault.errors == { "view": ["text"] } and type(fault.__cause__) is kind and "disk" not in str(fault)

    for source in ("{{ x.y.z }}", "{{ 1 / 0 }}", "{{ 1 // zero }}", "{{ lipsum() }}", "{{ [1][5] + 1 }}", "{{ 'a' + 1 }}", "{{ row.fresh(1) }}"):

        fault = await refused(lib.render_text(source, zero=0, row=Row()), "view.render")

        assert fault.errors == { "view": ["text"] }

    assert lib.stats()["rendered"] == 0 and await lib.render_text("{{ 1 }}") == "1"

async def test_strict_views_refuse_missing_values () -> None:

    strict, lax = memory(strict=True), memory()

    for source in ("{{ missing }}", "{% if missing %}x{% endif %}", "{{ row.missing }}", "{% for a in missing %}{% endfor %}"):

        assert (await refused(strict.render_text(source, row=Row()), "view.render")).errors == { "view": ["text"] }
        assert await lax.render_text(source, row=Row()) == ""

    await refused(strict.render_text("{{ who.__class__ }}", who="x"), "view.unsafe", Code.FORBIDDEN)

    assert await strict.render_text("{{ missing | default('d') }}{{ missing is defined }}{{ who }}", who="w") == "dFalsew"
    assert await lax.render_text("[{{ who.__class__ }}]", who="x") == "[]"

async def test_refuses_a_malformed_setup_and_keeps_the_old_one ( tmp_path: Path ) -> None:

    kept = memory({ "a.txt": "{{ site }} {{ n }}" }, site="Engine")
    file = tmp_path / "file.txt"

    file.write_text("x")

    assert await kept.render("a.txt", n=1) == "Engine 1"

    wrong: tuple[Wrong, ...] = (
        ("view.templates", lambda: kept.setup(tmp_path, {})),
        ("view.templates", lambda: kept.setup(templates=cast(Any, [("a", "b")]))),
        ("view.templates", lambda: kept.setup(templates=cast(Any, "a"))),
        ("view.folder", lambda: kept.setup(tmp_path / "nope")),
        ("view.folder", lambda: kept.setup(file)),
        ("view.folder", lambda: kept.setup(cast(Any, 5))),
        ("view.option", lambda: kept.setup(reload=cast(Any, 1))),
        ("view.option", lambda: kept.setup(strict=cast(Any, "yes"))),
        ("view.steps", lambda: kept.setup(steps=0)),
        ("view.steps", lambda: kept.setup(steps=-1)),
        ("view.steps", lambda: kept.setup(steps=True)),
        ("view.steps", lambda: kept.setup(steps=cast(Any, 1.5))),
        ("view.steps", lambda: kept.setup(steps=MOST + 1)),
        ("view.output", lambda: kept.setup(output=0)),
        ("view.output", lambda: kept.setup(output=True)),
        ("view.output", lambda: kept.setup(output=cast(Any, "8"))),
        ("view.output", lambda: kept.setup(output=MOST + 1)),
        ("view.name", lambda: kept.setup(templates={ "../a": "x" })),
        ("view.name", lambda: kept.setup(templates={ "": "x" })),
        ("view.name", lambda: kept.setup(templates={ "a\\b": "x" })),
        ("view.name", lambda: kept.setup(templates={ "a\nb": "x" })),
        ("view.name", lambda: kept.setup(templates={ "x" * (NAME + 1): "x" })),
        ("view.name", lambda: kept.setup(templates=cast(Any, { 5: "x" }))),
        ("view.source", lambda: kept.setup(templates=cast(Any, { "a": 5 }))),
        ("view.source", lambda: kept.setup(templates={ "a": "x" * (SOURCE + 1) })),
        ("view.shared", lambda: kept.setup(range=1)),
        ("view.shared", lambda: kept.setup(lipsum=1)),
        ("view.shared", lambda: kept.setup(**cast(Any, { "a-b": 1 }))),
        ("view.shared", lambda: kept.share(namespace=1)),
        ("view.shared", lambda: kept.share(**{ "1a": 1 })),
        ("view.name", lambda: kept.put("../x", "x")),
        ("view.name", lambda: kept.put("", "x")),
        ("view.name", lambda: kept.put("a/./b", "x")),
        ("view.name", lambda: kept.put(cast(Any, 5), "x")),
        ("view.source", lambda: kept.put("b.txt", cast(Any, 5))),
        ("view.source", lambda: kept.put("b.txt", "x" * (SOURCE + 1))),
    )

    for reason, job in wrong: assert denied(job, reason).errors is None

    assert await kept.render("a.txt", n=2) == "Engine 2" and await kept.names() == ["a.txt"]
    assert kept.stats() == { "loaded": 1, "texts": 0, "rendered": 2 }

    kept.setup(templates={ "x" * NAME: "edge", "b.txt": "{{ site }}|{{ n }}" }, steps=MOST, output=MOST)

    assert await kept.render("b.txt", n=3) == "|3" and await kept.render("x" * NAME) == "edge" and not await kept.has("a.txt")
    assert kept.stats() == { "loaded": 2, "texts": 0, "rendered": 2 }

    kept.setup()

    assert await kept.names() == [] and kept.stats() == { "loaded": 0, "texts": 0, "rendered": 0 }

async def test_registers_filters_and_shares_values_with_cached_templates () -> None:

    def closed ( value: object ) -> None: raise Fault(Code.FORBIDDEN, reason="shop.closed")

    def crash ( value: object ) -> None: raise ValueError("secret")

    async def later ( value: object ) -> object: return value

    lib = memory({ "a.txt": "{{ site }} {{ year }} {{ n | twice }}" }, site="Engine")

    assert (await refused(lib.render("a.txt", n=4), "view.syntax")).errors == { "view": ["a.txt:1"] }
    assert await lib.render_text("{{ site }}|{{ year }}") == "Engine|"

    lib.register("twice", lambda value: value * 2)
    lib.register("deny", closed)
    lib.register("crash", crash)
    lib.share(year=2026, site="Shop")

    assert await lib.render("a.txt", n=4) == "Shop 2026 8" and await lib.render_text("{{ site }}|{{ year }}") == "Shop|2026"
    assert await lib.render_text("{{ '<b>' | twice }}") == "&lt;b&gt;&lt;b&gt;" and lib.stats()["texts"] == 2

    await refused(lib.render_text("{{ 1 | deny }}"), "shop.closed", Code.FORBIDDEN)
    await spent(lib.render_text("{{ big | twice | length }}", big="a" * 5_000_000), "size")

    crashed = await refused(lib.render_text("{{ 1 | crash }}"), "view.render")

    assert crashed.errors == { "view": ["text"] } and "secret" not in str(crashed)

    wrong: tuple[tuple[object, object], ...] = (
        ("Up", str), ("1a", str), ("a-b", str), ("a.b", str), ("", str), ("a" * 65, str), (5, str), ("upper", str), ("json", str),
        ("twice", str), ("fresh", 5), ("fresh", None), ("fresh", later),
    )

    for name, job in wrong: denied(partial(lib.register, cast(Any, name), cast(Any, job)), "view.filter")

    assert await lib.render_text("{{ 3 | twice }}") == "6"
    assert (await refused(lib.render_text("{{ 1 | fresh }}"), "view.syntax")).errors == { "view": ["text:1"] }
    assert (await refused(lib.render_text("a\n\n{% for %}"), "view.syntax")).errors == { "view": ["text:3"] }

async def test_puts_templates_that_every_child_sees () -> None:

    lib = memory({
        "base.html": BASE, "child.html": "{% extends 'base.html' %}{% block body %}c{% endblock %}", "part.txt": "one",
        "page.html": "{% include 'part.txt' %}!",
    })

    assert await lib.render("child.html") == "<c>" and await lib.render("page.html") == "one!"
    assert await lib.render_text("{% include 'part.txt' %}?") == "one?" and not await lib.has("new.txt")

    lib.put("base.html", "[{% block body %}{% endblock %}]")
    lib.put("part.txt", "two")
    lib.put("new.txt", "{{ n }}")

    assert await lib.render("child.html") == "[c]" and await lib.render("page.html") == "two!"
    assert await lib.render_text("{% include 'part.txt' %}?") == "two?" and await lib.render("new.txt", n=1) == "1"
    assert await lib.names() == ["base.html", "child.html", "new.txt", "page.html", "part.txt"]

    lib.put("new.txt", "{% if %}")

    assert (await refused(lib.render("new.txt"), "view.syntax")).errors == { "view": ["new.txt:1"] } and await lib.has("new.txt")

    lib.put("new.txt", "back {{ n }}")

    assert await lib.render("new.txt", n=2) == "back 2"

async def test_never_keeps_a_template_loaded_across_a_change ( monkeypatch: pytest.MonkeyPatch ) -> None:

    stock = DictLoader.get_source
    read, gate = threading.Event(), threading.Event()

    def slow ( self: DictLoader, *args: Any ) -> Any:

        made = stock(self, *args)

        read.set()
        gate.wait(5)

        return made

    monkeypatch.setattr(DictLoader, "get_source", slow)

    race  = memory({ "a.txt": "{{ n }}" })
    first = asyncio.ensure_future(race.render("a.txt", n=1))

    assert await asyncio.to_thread(read.wait, 5)

    race.put("a.txt", "new {{ n }}")
    gate.set()

    assert await first == "1" and race.stats()["loaded"] == 0
    assert await race.render("a.txt", n=2) == "new 2" and race.stats()["loaded"] == 1

    read.clear()
    gate.clear()
    race.put("b.txt", "{{ n }}")

    second = asyncio.ensure_future(race.render("b.txt", n=3))

    assert await asyncio.to_thread(read.wait, 5)

    race.setup(templates={ "b.txt": "fresh {{ n }}" })
    gate.set()

    assert await second == "3" and race.stats() == { "loaded": 0, "texts": 0, "rendered": 1 }
    assert await race.render("b.txt", n=4) == "fresh 4"

async def test_caches_small_texts_in_a_bounded_queue ( monkeypatch: pytest.MonkeyPatch ) -> None:

    stock = Sandbox.from_string
    seen: list[str] = []

    def counted ( self: Sandbox, source: str, *args: Any, **kwargs: Any ) -> Template:

        seen.append(source)

        return stock(self, source, *args, **kwargs)

    monkeypatch.setattr(Sandbox, "from_string", counted)

    lib = memory()

    for index in range(TEXTS): assert await lib.render_text(f"{index} {{{{ n }}}}", n=1) == f"{index} 1"

    assert len(seen) == TEXTS and lib.stats() == { "loaded": 0, "texts": TEXTS, "rendered": TEXTS }
    assert await lib.render_text("0 {{ n }}", n=2) == "0 2" and len(seen) == TEXTS
    assert await lib.render_text("new {{ n }}", n=3) == "new 3" and len(seen) == TEXTS + 1 and lib.stats()["texts"] == TEXTS
    assert await lib.render_text("0 {{ n }}", n=4) == "0 4" and len(seen) == TEXTS + 2 and lib.stats()["texts"] == TEXTS
    assert await lib.render_text("2 {{ n }}", n=5) == "2 5" and len(seen) == TEXTS + 2

    edge, over = "a" * SMALL, "a" * (SMALL + 1)

    assert await lib.render_text(over) == over and await lib.render_text(over) == over and len(seen) == TEXTS + 4
    assert await lib.render_text(edge) == edge and await lib.render_text(edge) == edge and len(seen) == TEXTS + 5
    assert await lib.render_text("a" * SOURCE) == "a" * SOURCE and lib.stats()["texts"] == TEXTS

    await refused(lib.render_text("a" * (SOURCE + 1)), "view.source")
    await refused(lib.render_text(cast(Any, 5)), "view.source")
    await refused(lib.render_text(cast(Any, b"a")), "view.source")

async def test_reloads_changed_files_only_when_asked ( tmp_path: Path ) -> None:

    page = tmp_path / "live.html"

    page.write_text("one")

    held, live = View(), View()

    held.setup(tmp_path)
    live.setup(tmp_path, reload=True)

    assert await held.render("live.html") == "one" and await live.render("live.html") == "one"

    page.write_text("two")

    later = page.stat().st_mtime + 5

    os.utime(page, (later, later))
    (tmp_path / "late.html").write_text("late")

    assert await held.render("live.html") == "one" and await live.render("live.html") == "two"
    assert await held.render("late.html") == "late" and await live.render("late.html") == "late"
    assert held.stats()["loaded"] == 2 and live.stats()["loaded"] == 0
    assert await held.names() == ["late.html", "live.html"]

def test_caches_attribute_verdicts_without_changing_them () -> None:

    box, stock = Sandbox(), ImmutableSandboxedEnvironment()
    row  = Row()
    liar = type("Liar", (), { "__class__": property(lambda _: str) })()
    pairs: tuple[tuple[object, str], ...] = (
        ("a", "upper"), ("a", "__class__"), ("a", "format"), ([], "append"), ([], "index"), ({}, "update"), ({}, "get"),
        (set(), "add"), ((), "count"), (1, "bit_length"), (row, "fresh"), (row, "_hidden"), (row, "name"), (Row.fresh, "__globals__"),
        (row.fresh, "__func__"), (Row, "mro"), (Row, "fresh"),
    )

    for target, name in pairs:

        expected = stock.is_safe_attribute(target, name, None)

        assert box.is_safe_attribute(target, name, None) is expected and box.verdicts[type(target), name] is expected
        assert box.is_safe_attribute(target, name, None) is expected

    for text in ("a", b"a"):

        for name in ("translate", "maketrans"):

            assert stock.is_safe_attribute(text, name, None) and not box.is_safe_attribute(text, name, None)

    held = len(box.verdicts)

    assert box.is_safe_attribute(liar, "upper", None) and not box.is_safe_attribute(liar, "_x", None) and len(box.verdicts) == held

    for index in range(VERDICTS + 500): assert box.is_safe_attribute(row, f"a{index}", None)

    assert len(box.verdicts) == VERDICTS and not box.is_safe_attribute(row, "_late", None) and box.is_safe_attribute(row, "late", None)
    assert (Row, "late") not in box.verdicts and Sandbox().verdicts == {}

async def test_weighs_every_growth_at_its_exact_edge () -> None:

    tight = memory(output=64)
    huge  = 1 << 5_000
    lines = "a\na\na\na\na"
    fits: tuple[tuple[str, Data, str], ...] = (
        ("{{ 'a'.ljust(n) | length }}", { "n": 64 }, "64"),
        ("{{ ('%60s' % 'a') | length }}", {}, "60"),
        ("{{ ('%*d' % (n, 1)) | length }}", { "n": -60 }, "60"),
        ("{{ (n ** 1) == n }}", { "n": huge }, "True"),
        ("{{ 'aaaa'.replace('a', pad) | length }}", { "pad": "b" * 16 }, "64"),
        ("{{ text | indent(10) | length }}", { "text": lines }, "49"),
        ("{{ text | indent(pad) | length }}", { "text": "a\na\na", "pad": "p" * 19 }, "43"),
    )
    over: tuple[tuple[str, Data, str], ...] = (
        ("{{ 'a'.ljust(n) | length }}", { "n": 65 }, "size"),
        ("{{ ('%61s' % 'a') | length }}", {}, "size"),
        ("{{ ('%*d' % (n, 1)) | length }}", { "n": -100 }, "size"),
        ("{{ (n ** 2) == n }}", { "n": huge }, "number"),
        ("{{ 'aaaa'.replace('a', pad) | length }}", { "pad": "b" * 17 }, "size"),
        ("{{ text | indent(10) | length }}", { "text": lines + "\na" }, "size"),
        ("{{ text | indent(pad) | length }}", { "text": "a\na\na", "pad": "p" * 20 }, "size"),
    )

    for source, given, expected in fits: assert await tight.render_text(source, **given) == expected, source

    for source, given, what in over: await spent(tight.render_text(source, **given), what)

async def test_spends_steps_on_every_grown_value () -> None:

    one   = memory(steps=1)
    grown = ("{{ big | replace('a', 'b') | length }}", "{{ ('a' * n) | length }}", "{{ big[:] | length }}")

    for source in grown:

        await spent(one.render_text(source, big="a" * 2_048, n=2_048), "steps")

        assert await one.render_text(source, big="a" * 1_024, n=1_024) == "1024", source

    await spent(one.render_text("{{ rows[:] | length }}", rows=[0] * 32), "steps")

    assert await one.render_text("{{ rows[:] | length }}", rows=[0] * 16) == "16"

async def test_joins_keep_markup_and_escape_the_rest () -> None:

    lib   = memory({ "plain.txt": "{{ (lead | safe) ~ tag }}" })
    given = { "lead": "<i>", "tag": "<b>" }

    assert await lib.render_text("{{ (lead | safe) ~ tag }}", **given) == "<i>&lt;b&gt;"
    assert await lib.render_text("{{ tag ~ (lead | safe) ~ 1 }}", **given) == "&lt;b&gt;<i>1"
    assert await lib.render_text("{{ tag ~ lead }}", **given) == "&lt;b&gt;&lt;i&gt;" and await lib.render("plain.txt", **given) == "<i><b>"

async def test_takes_a_source_up_to_the_limit_and_copies_the_mapping () -> None:

    edge, over = "a" * SOURCE, "a" * (SOURCE + 1)
    given = { "a.txt": "a" }
    lib   = memory(given)

    lib.put("edge.txt", edge)
    lib.put("b.txt", "b")

    given["c.txt"] = "c"

    assert given == { "a.txt": "a", "c.txt": "c" } and not await lib.has("c.txt")
    assert await lib.names() == ["a.txt", "b.txt", "edge.txt"] and await lib.render("edge.txt") == edge
    assert await memory({ "edge.txt": edge }).render("edge.txt") == edge

    denied(lambda: lib.put("over.txt", over), "view.source")
    denied(lambda: memory({ "over.txt": over }), "view.source")

    frozen = View()

    frozen.setup(templates=MappingProxyType({ "a.txt": "a" }))
    frozen.put("b.txt", "b")

    assert await frozen.render("b.txt") == "b" and await frozen.names() == ["a.txt", "b.txt"]

async def test_drops_cached_texts_on_a_new_setup ( monkeypatch: pytest.MonkeyPatch ) -> None:

    lib, source = memory(brand="old"), "{{ brand }}"

    assert await lib.render_text(source) == "old" and lib.stats()["texts"] == 1

    lib.setup(templates={}, brand="new")

    assert lib.stats()["texts"] == 0 and await lib.render_text(source) == "new" and lib.stats()["texts"] == 1

    stock = Sandbox.from_string
    read, gate = threading.Event(), threading.Event()

    def slow ( self: Sandbox, text: str, *args: Any, **kwargs: Any ) -> Template:

        made = stock(self, text, *args, **kwargs)

        read.set()
        gate.wait(5)

        return made

    monkeypatch.setattr(Sandbox, "from_string", slow)

    late  = "late {{ brand }}"
    first = asyncio.ensure_future(lib.render_text(late))

    assert await asyncio.to_thread(read.wait, 5)

    lib.setup(templates={}, brand="newer")
    gate.set()

    assert await first == "late new" and lib.stats()["texts"] == 0
    assert await lib.render_text(late) == "late newer" and lib.stats()["texts"] == 1

