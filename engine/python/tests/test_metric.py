from collections.abc import Callable
from decimal import Decimal
from enum import Enum, StrEnum
from functools import partial
from typing import Any, cast

from engine.error import Code, Fault
from engine.metric import MEDIA, Counter, Gauge, Histogram, Meter, Metrics, metrics as shared
import pytest, re, sys, threading, time

MOST    = sys.float_info.max
WORD    = r"[a-zA-Z_][a-zA-Z0-9_]*"
SAMPLE  = re.compile(rf'({WORD})(?:\{{({WORD}="(?:[^"\\\n]|\\\\|\\"|\\n)*"(?:,{WORD}="(?:[^"\\\n]|\\\\|\\"|\\n)*")*)\}})? (\S+)')
COMMENT = re.compile(rf"# (?:HELP {WORD} .+|TYPE {WORD} (?:counter|gauge|histogram))")
DEFAULT = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
FIGURES = (
    (0, "0"), (-0.0, "0"), (1, "1"), (-3, "-3"), (1.5, "1.5"), (0.1 + 0.2, "0.30000000000000004"), (1e-7, "1e-07"),
    (2 ** 53, "9007199254740992"), (-(2 ** 53), "-9007199254740992"), (2.0 ** 53 + 2, "9007199254740994.0"),
    (1e22, "1e+22"), (MOST, "1.7976931348623157e+308"), (-MOST, "-1.7976931348623157e+308"),
    (123456789.125, "123456789.125"), (10 ** 30, "1e+30"), (-2.5e-300, "-2.5e-300"),
)

class Word(str):

    __slots__ = ()

class Whole(int):

    pass

class Real(float):

    pass

class Verb(StrEnum):

    GET = "get"

class Spy:

    def __init__ ( self ) -> None:

        self.calls: list[tuple[str, dict[str, Any]]] = []

    def warning ( self, event: str, **fields: Any ) -> None:

        self.calls.append((event, fields))

TONE = cast("Any", Enum)("Tone", { "RED": "red" }, type=str)

NUMBERS: tuple[Any, ...] = (
    True, False, None, "1", b"1", 1j, Decimal(1), float("nan"), float("inf"), float("-inf"), 10 ** 400, -(10 ** 400),
    [1], (1,), Whole(1), Real(1.0), object(),
)
NAMES: tuple[Any, ...]   = ("", "a b", "1a", "a:b", "a-b", "a.b", "a\n", "\na", "__a", "é", "٣", "a" * 101, "a\x00")
OTHERS: tuple[Any, ...]  = (None, 5, 1.5, b"a", ["a"], ("a",), { "a": 1 }, Word("a"), object())

def refused ( reason: str, work: Callable[[], object] ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL and caught.value.reason == f"metric.{reason}"

    return caught.value

def parsed ( text: str ) -> dict[str, float]:

    samples: dict[str, float] = {}

    if text == "": return samples

    assert text.endswith("\n") and not text.endswith("\n\n")

    for line in text[:-1].split("\n"):

        if line.startswith("#"):

            assert COMMENT.fullmatch(line), line

            continue

        found  = SAMPLE.fullmatch(line)
        series = line.rsplit(" ", 1)[0]

        assert found is not None and series not in samples, line

        samples[series] = float(found[3])

    return samples

def test_metrics_render_prometheus_text () -> None:

    metrics = Metrics("app")
    calls   = metrics.counter("calls", "Calls served")
    heat    = metrics.gauge("heat", "Current heat")
    took    = metrics.histogram("took", "Seconds", buckets=(0.1, 1.0))

    assert metrics.render() == (
        "# HELP app_calls_total Calls served\n# TYPE app_calls_total counter\n"
        "# HELP app_heat Current heat\n# TYPE app_heat gauge\n"
        "# HELP app_took Seconds\n# TYPE app_took histogram\n"
    )

    calls.inc(route="a")
    calls.inc(2, route="a")
    calls.inc(route='b"q')
    heat.set(3.5)
    heat.add(-1)
    took.observe(0.05)
    took.observe(0.5)
    took.observe(5)

    assert calls.value(route="a") == 3 and heat.value() == 2.5 and took.count() == 3 and took.sum() == 5.55
    assert type(calls.value(route="a")) is float and type(heat.value()) is float and type(took.count()) is int
    assert metrics.counter("calls") is calls and metrics.gauge("heat") is heat and metrics.histogram("took") is took
    assert metrics.names() == ("app_calls_total", "app_heat", "app_took")
    assert metrics.render() == (
        "# HELP app_calls_total Calls served\n"
        "# TYPE app_calls_total counter\n"
        'app_calls_total{route="a"} 3\n'
        'app_calls_total{route="b\\"q"} 1\n'
        "# HELP app_heat Current heat\n"
        "# TYPE app_heat gauge\n"
        "app_heat 2.5\n"
        "# HELP app_took Seconds\n"
        "# TYPE app_took histogram\n"
        'app_took_bucket{le="0.1"} 1\n'
        'app_took_bucket{le="1"} 2\n'
        'app_took_bucket{le="+Inf"} 3\n'
        "app_took_sum 5.55\n"
        "app_took_count 3\n"
    )
    assert metrics.describe() == {
        "prefix"  : "app",
        "metrics" : { "app_calls_total": "counter", "app_heat": "gauge", "app_took": "histogram" },
        "series"  : 4,
        "dropped" : 0,
    }
    assert parsed(metrics.render())['app_calls_total{route="b\\"q"}'] == 1
    assert MEDIA == "text/plain; version=0.0.4; charset=utf-8" and isinstance(shared, Metrics)

    metrics.clear()

    assert metrics.names() == () and metrics.render() == "" and metrics.describe()["metrics"] == {}
    assert metrics.gauge("calls_total", "free again").value() == 0 and metrics.counter("took").kind == "counter"
    assert metrics.counter("heat") is not calls and metrics.names() == ("app_calls_total", "app_heat_total", "app_took_total")

def test_figures_render_exactly () -> None:

    heat = Gauge("heat")

    for value, text in FIGURES:

        heat.set(value)

        assert heat.lines() == ["# TYPE heat gauge", f"heat {text}"] and float(text) == float(value) == heat.value()

    heat.set(MOST)
    heat.add(MOST)

    assert heat.lines()[1] == "heat +Inf"

    heat.add(-MOST)

    assert heat.value() == float("inf")

    heat.set(-MOST)
    heat.add(-MOST)

    assert heat.lines()[1] == "heat -Inf" and parsed("heat -Inf\n") == { "heat": float("-inf") }

    calls = Counter("calls")

    calls.inc(MOST)
    calls.inc(MOST)

    assert calls.lines() == ["# TYPE calls_total counter", "calls_total +Inf"]

    took = Histogram("took", buckets=(1,))

    took.observe(MOST)
    took.observe(MOST)

    assert took.lines()[1:] == ['took_bucket{le="1"} 0', 'took_bucket{le="+Inf"} 2', "took_sum +Inf", "took_count 2"]

def test_amounts_are_finite_numbers () -> None:

    calls = Counter("calls")
    heat  = Gauge("heat")
    took  = Histogram("took")

    for bad in NUMBERS:

        for work in (calls.inc, heat.set, heat.add, took.observe):

            fault = refused("value", partial(work, bad))

            assert fault.errors == { "value": [type(bad).__name__] }

            refused("value", partial(work, bad, route="a"))

    assert refused("negative", partial(calls.inc, -1)).errors == { "negative": ["calls"] }

    refused("negative", partial(calls.inc, -0.000001, route="a"))

    assert calls.series() == 0 and heat.series() == 0 and took.series() == 0
    assert calls.lines() == ["# TYPE calls_total counter"] and took.lines() == ["# TYPE took histogram"]

    calls.inc(0)
    calls.inc(-0.0, route="a")
    calls.inc(2)
    calls.inc(0.5)
    heat.set(7, zone="a")
    heat.add(-2, zone="a")
    heat.add(-0.5, zone="b")
    took.observe(-3)
    took.observe(2 ** 40)

    assert calls.value() == 2.5 and calls.value(route="a") == 0 and calls.series() == 2
    assert heat.value(zone="a") == 5 and heat.value(zone="b") == -0.5 and type(heat.value(zone="a")) is float
    assert took.count() == 2 and took.sum() == 2 ** 40 - 3
    assert calls.lines() == ["# TYPE calls_total counter", "calls_total 2.5", 'calls_total{route="a"} 0']

def test_labels_are_names_and_strings () -> None:

    calls = Counter("calls")
    took  = Histogram("took")

    for name in NAMES:

        named: dict[str, Any] = { name: "v" }

        assert refused("label", partial(calls.inc, **named)).errors == { "label": [name[:100]] }

        refused("label", partial(calls.value, **named))
        refused("label", partial(calls.forget, **named))
        refused("label", partial(took.observe, 1, **named))

    scalars: tuple[Any, ...] = (1, 1.5, None, True, b"x", ("x",), object())
    holders: tuple[Any, ...] = (["x"], { "x": 1 }, { "x" })
    crowd: dict[str, Any]    = { f"l{index}": "v" for index in range(33) }
    most: dict[str, Any]     = { f"l{index}": "v" for index in range(32) }
    long: dict[str, Any]     = { "a" * 100: "z" }

    for value in scalars:

        assert refused("label", partial(calls.inc, route=value)).errors == { "label": ["route"] }

        refused("label", partial(calls.value, route=value))

    for value in holders:

        assert refused("label", partial(calls.inc, route=value)).errors == { "label": ["value"] }

        refused("label", partial(calls.value, route=value))
        refused("label", partial(calls.forget, route=value))

    assert refused("label", partial(took.observe, 1, le="1")).errors == { "label": ["le"] }
    assert refused("label", partial(calls.inc, **crowd)).errors == { "label": ["count"] }
    assert calls.series() == 0 and took.series() == 0

    calls.inc(le="1", quantile="0.5", _a="x", A1="y", **long)
    calls.inc(**most)
    calls.inc(b="2", a="1")
    calls.inc(a="1", b="2")
    calls.inc(verb=Verb.GET)
    calls.inc(verb="get")
    calls.inc(verb=Word("get"))
    calls.inc(tone="red")
    calls.inc(tone=TONE.RED)
    calls.inc(tone=Word("blue"))

    assert calls.value(a="1", b="2") == 2 and calls.value(verb="get") == 3 == calls.value(verb=Verb.GET)
    assert calls.value(tone=TONE.RED) == 2 and calls.value(tone="blue") == 1 and calls.series() == 6

    first = Counter("first")

    first.inc(tone=TONE.RED)
    first.inc(verb=Verb.GET)

    assert first.lines()[1:] == ['first_total{tone="red"} 1', 'first_total{verb="get"} 1'] and first.value(tone="red") == 1

    lines = calls.lines()

    assert lines[1] == 'calls_total{A1="y",_a="x",' + "a" * 100 + '="z",le="1",quantile="0.5"} 1'
    assert lines[2] == 'calls_total{a="1",b="2"} 2'
    assert lines[4:] == ['calls_total{tone="blue"} 1', 'calls_total{tone="red"} 2', 'calls_total{verb="get"} 3']

def test_label_values_escape_and_merge () -> None:

    calls = Counter("calls", 'Line\none \\ "two"')

    calls.inc(path='a\\b"c\nd')
    calls.inc(path="tab\there\rcr\x00nul")
    calls.inc(city="القاهرة")
    calls.inc(path="")
    calls.inc()
    calls.inc(city="", path="")
    calls.inc(city="", path="x")
    calls.inc(path="x")

    assert calls.value() == 3 == calls.value(path="") and calls.value(city="") == 3 and calls.value(path="x", city="") == 2
    assert calls.series() == 5 and calls.lines() == [
        '# HELP calls_total Line\\none \\\\ "two"',
        "# TYPE calls_total counter",
        "calls_total 3",
        'calls_total{city="القاهرة"} 1',
        'calls_total{path="a\\\\b\\"c\\nd"} 1',
        'calls_total{path="tab\there\rcr\x00nul"} 1',
        'calls_total{path="x"} 2',
    ]
    assert len(parsed("\n".join(calls.lines()) + "\n")) == 5 and "\n".join(calls.lines()).encode()
    assert calls.forget(path="") and calls.value() == 0 and not calls.forget() and calls.series() == 4
    assert calls.forget(city="", path="x") and calls.value(path="x") == 0 and not calls.forget(path="x")
    assert calls.forget(city="القاهرة") and not calls.forget(city="none") and calls.series() == 2

    calls.inc(path="x")

    assert calls.value(path="x") == 1 and calls.series() == 3

def test_series_are_capped ( monkeypatch: pytest.MonkeyPatch ) -> None:

    spy = Spy()

    monkeypatch.setattr("engine.metric.meter.log", spy)

    loose = Counter("loose")

    loose.inc(user="\ud800")
    loose.inc(user="x" * 257)
    loose.inc(user="x" * 256, trail="ok \udfff")

    assert (loose.series(), loose.dropped(), loose.lines()) == (0, 3, ["# TYPE loose_total counter"])
    assert spy.calls == [("metric.series", { "metric": "loose", "limit": 2000 })]

    spy.calls.clear()

    calls = Counter("calls", series=3)

    for index in range(5): calls.inc(user=str(index))

    assert calls.series() == 3 and calls.dropped() == 2 and calls.value(user="3") == 0 and calls.value(user="2") == 1
    assert spy.calls == [("metric.series", { "metric": "calls", "limit": 3 })]

    calls.inc(user="0")
    calls.inc(4, user="2")
    calls.inc(user="x" * 257)
    calls.inc(user="\ud800")
    calls.inc(user="ok", trail="\udfff")

    assert calls.value(user="0") == 2 and calls.value(user="2") == 5 and calls.dropped() == 5 and len(spy.calls) == 1
    assert calls.value(user="x" * 257) == 0 and calls.value(user="\ud800") == 0 and not calls.forget(user="\ud800")
    assert calls.dropped() == 5 and len(calls.lines()) == 4 and "\n".join(calls.lines()).encode()
    assert calls.forget(user="1") and calls.series() == 2

    calls.inc(user="x" * 256)
    calls.inc(user="9")

    assert calls.series() == 3 and calls.value(user="x" * 256) == 1 and calls.dropped() == 6

    calls.clear()

    assert calls.series() == 0 and calls.dropped() == 0 and calls.lines() == ["# TYPE calls_total counter"]

    for index in range(4): calls.inc(user=str(index))

    assert calls.dropped() == 1 and len(spy.calls) == 2

    heat = Gauge("heat", series=1)
    took = Histogram("took", series=1)

    heat.set(1)
    heat.set(2, zone="a")
    heat.add(2, zone="a")
    took.observe(1)
    took.observe(1, zone="a")

    with heat.track(zone="b"): assert heat.value(zone="b") == 0
    with took.time(zone="b"): pass

    assert (heat.series(), heat.dropped(), took.series(), took.dropped()) == (1, 4, 1, 2)
    assert [event for event, _ in spy.calls] == ["metric.series"] * 4

    metrics = Metrics("app", 2)
    wide    = metrics.counter("wide")

    for index in range(5): wide.inc(user=str(index))

    metrics.gauge("heat").set(1)

    assert metrics.describe()["series"] == 3 and metrics.describe()["dropped"] == 3

    for bad in (0, -1, True, 1.5, "5", None, 1_000_001):

        assert refused("series", partial(Metrics, "app", cast("int", bad))).errors == { "series": ["series"] }
        assert refused("series", partial(Counter, "calls", "", cast("int", bad))).errors == { "series": ["calls"] }

        refused("series", partial(Histogram, "took", "", (1,), cast("int", bad)))

    assert Counter("calls", series=1_000_000).series() == 0 and Metrics("app", 1).counter("calls").series() == 0

def test_histograms_bucket_inclusive_bounds ( monkeypatch: pytest.MonkeyPatch ) -> None:

    took = Histogram("took", buckets=(1, 2.5, 10))

    for value in (0, 1, 1.5, 2.5, 3, 10, 11, -5): took.observe(value)

    took.observe(2.5, route="a")
    took.observe(100, route="a")

    assert took.buckets() == (1.0, 2.5, 10.0) and all(type(bound) is float for bound in took.buckets())
    assert took.count() == 8 and took.sum() == 24 and took.count(route="a") == 2 and took.sum(route="a") == 102.5
    assert took.count(route="b") == 0 and took.sum(route="b") == 0 and took.series() == 2
    assert took.lines("app") == [
        "# TYPE app_took histogram",
        'app_took_bucket{le="1"} 3',
        'app_took_bucket{le="2.5"} 5',
        'app_took_bucket{le="10"} 7',
        'app_took_bucket{le="+Inf"} 8',
        "app_took_sum 24",
        "app_took_count 8",
        'app_took_bucket{route="a",le="1"} 0',
        'app_took_bucket{route="a",le="2.5"} 1',
        'app_took_bucket{route="a",le="10"} 1',
        'app_took_bucket{route="a",le="+Inf"} 2',
        'app_took_sum{route="a"} 102.5',
        'app_took_count{route="a"} 2',
    ]
    assert Histogram("d").buckets() == DEFAULT and Metrics().histogram("d").buckets() == DEFAULT
    assert Histogram("wide", buckets=list(range(64))).buckets() == tuple(float(bound) for bound in range(64))
    assert Histogram("low", buckets=(-MOST, -1, 0, 1e-9, MOST)).lines()[0] == "# TYPE low histogram"

    hostile: tuple[Any, ...] = (
        (), [], (1, 1), (2, 1), (1, 2, 2), (1, float("nan")), (float("inf"),), (1, float("-inf")), (1, "2"), (True,),
        (None,), "abc", b"ab", 5, None, tuple(range(65)), iter((1, 2)), { 1, 2 }, { 1: 2 }, (10 ** 400,), (Real(1.0),),
        range(3), ((1,),),
    )

    for bad in hostile: assert refused("buckets", partial(Histogram, "took", "", bad)).errors == { "buckets": ["took"] }

    ticks = iter((10.0, 12.5, 20.0, 20.25))

    with monkeypatch.context() as patch:

        patch.setattr(time, "perf_counter", lambda: next(ticks))

        with took.time(route="t"): pass
        with pytest.raises(KeyError), took.time(route="t"): raise KeyError("x")

    assert took.count(route="t") == 2 and took.sum(route="t") == 2.75

    entered: list[str] = []

    def timed ( **labels: Any ) -> None:

        with took.time(**labels): entered.append("body")

    assert refused("label", partial(timed, le="1")).errors == { "label": ["le"] }
    assert refused("label", partial(timed, route=5)).errors == { "label": ["route"] }
    assert refused("label", partial(timed, route=["a"])).errors == { "label": ["value"] }
    assert took.series() == 3 and took.dropped() == 0 and entered == []

def test_gauges_track_work_in_flight () -> None:

    heat = Gauge("heat")

    with heat.track():

        assert heat.value() == 1

        with heat.track(), heat.track(zone="a"): assert heat.value() == 2 and heat.value(zone="a") == 1

        assert heat.value() == 1 and heat.value(zone="a") == 0

    with pytest.raises(KeyError), heat.track(zone="a"): raise KeyError("x")

    assert heat.value() == 0 and heat.value(zone="a") == 0 and heat.series() == 2

    heat.set(5)
    heat.set(-2, zone="a")
    heat.set(9, zone="b")

    assert heat.lines("svc") == ["# TYPE svc_heat gauge", "svc_heat 5", 'svc_heat{zone="a"} -2', 'svc_heat{zone="b"} 9']
    assert heat.value(zone="c") == 0 and heat.series() == 3

def test_reads_never_open_a_series () -> None:

    calls = Counter("calls")
    heat  = Gauge("heat")
    took  = Histogram("took")

    assert calls.value() == 0 and calls.value(route="a") == 0 and heat.value(zone="a") == 0
    assert took.count(route="a") == 0 and took.sum(route="a") == 0 and not calls.forget(route="a")
    assert type(calls.value()) is float and type(heat.value()) is float and type(took.sum()) is float
    assert (calls.series(), heat.series(), took.series()) == (0, 0, 0) and calls.dropped() == 0

def test_registry_guards_names_and_claims () -> None:

    metrics = Metrics("app")
    calls   = metrics.counter("calls_total", "Calls")

    assert calls.name == "calls" and calls.help == "Calls" and calls.kind == "counter"
    assert metrics.counter("calls") is calls and metrics.counter("calls", "Other").help == "Calls"
    assert metrics.has("calls") and metrics.has("calls_total") and not metrics.has("call") and not metrics.has("total")
    assert refused("kind", partial(metrics.gauge, "calls")).errors == { "kind": ["calls"] }
    assert refused("kind", partial(metrics.histogram, "calls")).errors == { "kind": ["calls"] }
    assert refused("taken", partial(metrics.gauge, "calls_total")).errors == { "taken": ["calls_total"] }

    took = metrics.histogram("took", buckets=[0.1, 1])

    assert metrics.histogram("took") is took and metrics.histogram("took", buckets=(0.1, 1.0)) is took
    assert refused("buckets", partial(metrics.histogram, "took", buckets=(0.1, 2))).errors == { "buckets": ["took"] }
    assert refused("buckets", partial(metrics.histogram, "took", buckets=(1, 1))).errors == { "buckets": ["took"] }
    assert refused("kind", partial(metrics.counter, "took")).errors == { "kind": ["took"] }
    assert refused("kind", partial(metrics.gauge, "took")).errors == { "kind": ["took"] }

    for suffix in ("_bucket", "_sum", "_count"):

        assert refused("taken", partial(metrics.gauge, f"took{suffix}")).errors == { "taken": [f"took{suffix}"] }

    metrics.gauge("wait_sum")
    metrics.gauge("wait_count")
    metrics.gauge("jobs_total")
    metrics.gauge("flat")

    assert refused("taken", partial(metrics.histogram, "wait")).errors == { "taken": ["wait_sum", "wait_count"] }
    assert refused("taken", partial(metrics.counter, "jobs")).errors == { "taken": ["jobs_total"] }
    assert refused("kind", partial(metrics.counter, "flat_total")).errors == { "kind": ["flat"] }
    assert not metrics.has("wait") and not metrics.has("jobs") and not metrics.has("flat_total") and metrics.has("flat")
    assert metrics.names() == ("app_calls_total", "app_flat", "app_jobs_total", "app_took", "app_wait_count", "app_wait_sum")
    assert metrics.counter("took_bucket").name == "took_bucket" and metrics.histogram("calls_total_x").name == "calls_total_x"
    assert metrics.forget("took") and not metrics.forget("took") and not metrics.has("took")
    assert metrics.forget("calls_total") and not metrics.has("calls") and not metrics.forget("calls")
    assert metrics.gauge("took_count").kind == "gauge" and metrics.gauge("calls_total").name == "calls_total"
    assert metrics.gauge("took").kind == "gauge" and not metrics.forget("flat_total") and metrics.has("flat")

    for name in NAMES:

        for make in (metrics.counter, metrics.gauge, metrics.histogram):

            assert refused("name", partial(make, name)).errors == { "name": [name[:100]] }

        assert not metrics.has(name) and not metrics.forget(name)

    for name in OTHERS:

        for work in (metrics.counter, metrics.gauge, metrics.histogram, metrics.has, metrics.forget):

            assert refused("name", partial(work, name)).errors == { "name": [type(name).__name__] }

        for kind in (Counter, Gauge, Histogram, Meter): refused("name", partial(kind, name))

    assert refused("name", partial(metrics.counter, "_total")).errors == { "name": [""] }
    assert metrics.counter("a" * 100 + "_total").name == "a" * 100 and metrics.gauge("_").name == "_"

    for bad in (None, 5, b"help", ["help"], "h" * 513, "bad \ud800"):

        assert refused("help", partial(metrics.gauge, "fresh", cast("str", bad))).errors == { "help": ["fresh"] }

    assert not metrics.has("fresh") and metrics.gauge("fresh", "h" * 512).help == "h" * 512
    assert Meter("plain").kind == "meter" and Meter("plain").lines() == ["# TYPE plain meter"]

def test_prefix_is_applied_at_exposition () -> None:

    metrics = Metrics("app")
    calls   = metrics.counter("calls")

    calls.inc()
    metrics.gauge("heat", "Heat").set(1)
    metrics.setup("svc")

    assert metrics.names() == ("svc_calls_total", "svc_heat") and metrics.counter("calls") is calls
    assert metrics.render() == "# TYPE svc_calls_total counter\nsvc_calls_total 1\n# HELP svc_heat Heat\n# TYPE svc_heat gauge\nsvc_heat 1\n"
    assert metrics.describe()["prefix"] == "svc" and list(metrics.describe()["metrics"]) == ["svc_calls_total", "svc_heat"]

    metrics.setup("")

    assert metrics.names() == ("calls_total", "heat") and metrics.render().startswith("# TYPE calls_total counter\ncalls_total 1\n")
    assert Metrics("").describe() == { "prefix": "", "metrics": {}, "series": 0, "dropped": 0 }
    assert Metrics().describe()["prefix"] == "engine" and Metrics("_a1").counter("x").lines("_a1")[0] == "# TYPE _a1_x_total counter"

    for bad in ("a b", "1a", "a:b", "a-b", "a\n", "__a", "é", "a" * 101):

        assert refused("prefix", partial(metrics.setup, bad)).errors == { "prefix": [bad[:100]] }
        assert refused("prefix", partial(Metrics, bad)).errors == { "prefix": [bad[:100]] }

    for other in (None, 5, b"a", ["a"], Word("a")):

        assert refused("prefix", partial(metrics.setup, cast("str", other))).errors == { "prefix": [type(other).__name__] }

        refused("prefix", partial(Metrics, cast("str", other)))

    assert metrics.describe()["prefix"] == "" and Metrics("a" * 100).describe()["prefix"] == "a" * 100

def test_meters_hold_under_threads () -> None:

    metrics = Metrics("t")
    calls   = metrics.counter("calls")
    heat    = metrics.gauge("heat")
    took    = metrics.histogram("took", buckets=(0.5,))
    made: list[Counter] = []
    texts: list[str]    = []
    interval = sys.getswitchinterval()

    def work ( index: int ) -> None:

        made.append(metrics.counter("late"))

        for turn in range(2000):

            calls.inc(lane=str(turn % 4))
            heat.add(1)
            took.observe(turn % 2, lane=str(index))
            metrics.counter("late").inc(turn=str(turn % 50))

            if turn % 400 == 0: texts.append(metrics.render())

    threads = [threading.Thread(target=work, args=(index,)) for index in range(8)]

    sys.setswitchinterval(1e-6)

    try:

        for thread in threads: thread.start()
        for thread in threads: thread.join()

    finally: sys.setswitchinterval(interval)

    assert all(item is made[0] for item in made) and len(made) == 8 and made[0].series() == 50
    assert sum(calls.value(lane=str(lane)) for lane in range(4)) == 16000 and heat.value() == 16000
    assert all(took.count(lane=str(index)) == 2000 and took.sum(lane=str(index)) == 1000 for index in range(8))
    assert len(texts) == 40 and all(parsed(text) for text in texts)

    final = parsed(metrics.render())

    assert final["t_heat"] == 16000 and final['t_took_bucket{lane="3",le="0.5"}'] == 1000 and final['t_took_count{lane="7"}'] == 2000
    assert sum(value for series, value in final.items() if series.startswith("t_late_total")) == 16000
