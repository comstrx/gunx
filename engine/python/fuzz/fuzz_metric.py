from engine.error import Code, Fault
from engine.log import log
from engine.metric import Counter, Gauge, Histogram, Metrics
from collections.abc import Callable
from functools import partial
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any
import bisect, itertools, math, re, sys

type Labels = dict[str, str]
type Pairs  = tuple[tuple[str, str], ...]
type Step   = tuple[str, str, Labels, Any]

EXAMPLES = 1500
MOST     = sys.float_info.max
WORD     = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]*")
HEAD     = re.compile(r"# (?:HELP [a-zA-Z_][a-zA-Z0-9_]* .+|TYPE [a-zA-Z_][a-zA-Z0-9_]* (?:counter|gauge|histogram))")
BACK     = { "\\": "\\", '"': '"', "n": "\n" }
POOL     = ("calls", "heat", "took", "jobs")
KINDS    = { "calls": "counter", "jobs": "counter", "heat": "gauge", "took": "histogram" }
BOUNDS   = (0.5, 2.0, 8.0)
EDGES    = ("0.5", "2", "8", "+Inf")
VERB     = {
    ("counter", False): "inc", ("counter", True): "inc", ("histogram", False): "observe", ("histogram", True): "observe",
    ("gauge", False): "set", ("gauge", True): "add",
}
CAP      = 6
KEYS     = st.sampled_from(("route", "verb", "zone"))
TEXTS    = st.one_of(st.sampled_from(("", "a", "b", 'q"', "x\\y", "l\nm", "القاهرة", "\ud800", "z" * 257)), st.text(max_size=6))
LABELS   = st.dictionaries(KEYS, TEXTS, max_size=3)
FINITE   = st.one_of(st.integers(-10 ** 6, 10 ** 6), st.floats(allow_nan=False, allow_infinity=False, width=32))
WILD     = st.one_of(
    st.none(), st.booleans(), st.text(max_size=4), st.binary(max_size=4), st.floats(), st.integers(), st.decimals(),
    st.complex_numbers(), st.lists(st.integers(), max_size=2), st.just(float("nan")), st.just(10 ** 400),
)
AMOUNTS  = st.one_of(FINITE, FINITE, FINITE, WILD)
VERBS    = st.sampled_from(("write", "write", "write", "write", "move", "forget", "drop", "clear"))
STEPS    = st.lists(st.tuples(VERBS, st.sampled_from(POOL), LABELS, AMOUNTS), max_size=40)
NAMES    = st.one_of(st.text(max_size=8), st.from_regex(WORD, fullmatch=True), st.sampled_from(("__a", "a:b", "a" * 101, "é", "a\n")))

log.setup("error", "json", Path("/dev/null"))

def tried ( work: Callable[[], Any] ) -> Any:

    try: return work()
    except Fault as fault: return fault

def refused ( found: object, reason: str ) -> bool:

    return isinstance(found, Fault) and found.code is Code.INTERNAL and found.reason == f"metric.{reason}"

def number ( value: Any ) -> bool:

    return type(value) in (int, float) and -MOST <= value <= MOST

def encodable ( text: str ) -> bool:

    try: text.encode()
    except UnicodeEncodeError: return False

    return True

def shape ( labels: Labels ) -> Pairs | None:

    if any(len(value) > 256 or not encodable(value) for value in labels.values()): return None

    return tuple(sorted((name, value) for name, value in labels.items() if value))

def split ( line: str ) -> tuple[str, Pairs, float]:

    series, _, figure = line.rpartition(" ")
    name, brace, rest = series.partition("{")
    pairs: list[tuple[str, str]] = []
    index = 0

    assert WORD.fullmatch(name), line
    assert not brace or rest.endswith("}"), line

    while brace and index < len(rest) - 1:

        cut   = rest.index('="', index)
        label = rest[index:cut]
        index = cut + 2
        value = ""

        assert WORD.fullmatch(label), line

        while rest[index] != '"':

            if rest[index] == "\\":

                value += BACK[rest[index + 1]]
                index += 2

            else:

                assert rest[index] != "\n", line

                value += rest[index]
                index += 1

        pairs.append((label, value))

        index += 1

        assert rest[index] in ",}", line

        index += 1

    return name, tuple(pairs), float(figure)

def parsed ( text: str ) -> dict[tuple[str, Pairs], float]:

    samples: dict[tuple[str, Pairs], float] = {}
    lines   = text[:-1].split("\n") if text else []

    assert text == "" or (text.endswith("\n") and not text.endswith("\n\n"))

    for line in lines:

        if line.startswith("#"):

            assert HEAD.fullmatch(line), line

            continue

        name, pairs, value = split(line)

        assert (name, pairs) not in samples, line

        samples[name, pairs] = value

    return samples

class Model:

    def __init__ ( self ) -> None:

        self.metrics = Metrics("app", CAP)
        self.series: dict[str, dict[Pairs, list[float]]] = {}
        self.dropped: dict[str, int] = {}

    def meter ( self, name: str ) -> Any:

        self.series.setdefault(name, {})
        self.dropped.setdefault(name, 0)

        if KINDS[name] == "counter": return self.metrics.counter(name)
        if KINDS[name] == "gauge": return self.metrics.gauge(name)

        return self.metrics.histogram(name, buckets=BOUNDS)

    def cell ( self, name: str, labels: Labels ) -> list[float] | None:

        key  = shape(labels)
        held = self.series[name]

        if key is not None and (key in held or len(held) < CAP):
            return held.setdefault(key, [0.0] * (5 if KINDS[name] == "histogram" else 1))

        self.dropped[name] += 1

        return None

    def write ( self, name: str, labels: Labels, amount: Any, verb: str ) -> None:

        item  = self.meter(name)
        kind  = KINDS[name]
        work  = getattr(item, VERB[kind, verb == "move"])
        found = tried(partial(work, amount, **labels))

        if not number(amount): assert refused(found, "value"), (amount, found)
        elif kind == "counter" and amount < 0: assert refused(found, "negative"), (amount, found)
        else:

            assert found is None, found

            self.record(kind, self.cell(name, labels), amount, verb)

    def record ( self, kind: str, held: list[float] | None, amount: float, verb: str ) -> None:

        if held is None: return
        if kind == "gauge" and verb != "move": held[0] = float(amount)
        else: held[0] += amount
        if kind == "histogram": held[1 + bisect.bisect_left(BOUNDS, amount)] += 1

    def forget ( self, name: str, labels: Labels ) -> None:

        if name not in self.series: return

        key = shape(labels)

        assert self.meter(name).forget(**labels) is (key is not None and self.series[name].pop(key, None) is not None)

    def drop ( self, name: str ) -> None:

        assert self.metrics.forget(name) is (self.series.pop(name, None) is not None)

        self.dropped.pop(name, None)

    def clear ( self ) -> None:

        self.metrics.clear()
        self.series.clear()
        self.dropped.clear()

    def wanted ( self ) -> dict[tuple[str, Pairs], float]:

        wanted: dict[tuple[str, Pairs], float] = {}

        for name, series in self.series.items():

            for key, held in series.items():

                if KINDS[name] == "counter": wanted[f"app_{name}_total", key] = held[0]
                elif KINDS[name] == "gauge": wanted[f"app_{name}", key] = held[0]
                else: wanted.update(self.spread(name, key, held))

        return wanted

    def spread ( self, name: str, key: Pairs, held: list[float] ) -> dict[tuple[str, Pairs], float]:

        rows: dict[tuple[str, Pairs], float] = {}
        running = 0.0

        for bound, count in zip(EDGES, held[1:], strict=True):

            running += count

            rows[f"app_{name}_bucket", (*key, ("le", bound))] = running

        return rows | { (f"app_{name}_sum", key): held[0], (f"app_{name}_count", key): running }

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(STEPS)
def driven ( steps: list[Step] ) -> None:

    model = Model()

    for verb, name, labels, amount in steps:

        if verb in ("write", "move"): model.write(name, labels, amount, verb)
        elif verb == "forget": model.forget(name, labels)
        elif verb == "drop": model.drop(name)
        else: model.clear()

    for name, series in model.series.items():

        assert len(series) <= CAP
        assert model.meter(name).series() == len(series)
        assert model.meter(name).dropped() == model.dropped[name]

    samples = parsed(model.metrics.render())
    wanted  = model.wanted()

    assert samples.keys() == wanted.keys(), (sorted(samples), sorted(wanted))
    assert samples == wanted, (samples, wanted)
    assert model.metrics.describe()["series"] == sum(len(series) for series in model.series.values())
    assert model.metrics.describe()["dropped"] == sum(model.dropped.values())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, NAMES, st.one_of(st.text(max_size=300), st.sampled_from(("\ud800", "a" * 257))), st.one_of(st.text(max_size=20), WILD))
def named ( name: str, label: str, value: str, help_: Any ) -> None:

    fine  = WORD.fullmatch(name) is not None and len(name) <= 100 and not name.startswith("__")
    known = type(help_) is str and encodable(help_)
    kinds: tuple[Callable[..., Any], ...] = (Counter, Gauge, Histogram)

    for kind in kinds:

        made = tried(partial(kind, name, help_))

        if not fine: assert refused(made, "name"), (name, made)
        elif not known: assert refused(made, "help"), (help_, made)
        else: assert parsed("\n".join(made.lines("p")) + "\n") == {}

    calls = Counter("calls")
    held  = WORD.fullmatch(label) is not None and len(label) <= 100 and not label.startswith("__")
    given_: dict[str, Any] = { label: value }
    found = tried(partial(calls.inc, **given_))

    if not held:

        assert refused(found, "label"), (label, found)
        assert calls.series() == 0

        return

    kept = len(value) <= 256 and encodable(value)

    assert found is None, found
    assert (calls.series(), calls.dropped(), calls.value(**given_)) == (int(kept), int(not kept), float(kept))

    samples = parsed("\n".join(calls.lines("p")) + "\n")

    assert samples == ({ ("p_calls_total", ((label, value),) if value else ()): 1.0 } if kept else {})
    assert calls.forget(**given_) is kept
    assert calls.series() == 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.floats(allow_nan=False, allow_infinity=False), st.integers(-2 ** 70, 2 ** 70)), st.lists(st.one_of(FINITE, WILD), max_size=8))
def figured ( value: Any, bounds: list[Any] ) -> None:

    heat = Gauge("heat")

    heat.set(value)

    text = heat.lines()[1].removeprefix("heat ")

    assert float(text) == float(value) == heat.value()
    assert " " not in text
    assert text == str(int(value)) or abs(value) > 2 ** 53 or value != int(value)

    fine = bool(bounds) and all(number(bound) for bound in bounds) and all(low < high for low, high in itertools.pairwise(bounds))
    made = tried(partial(Histogram, "took", "", bounds))

    if not fine:

        assert refused(made, "buckets"), (bounds, made)

        return

    made.observe(value)

    rows  = parsed("\n".join(made.lines()) + "\n")
    edges = [line.split('"')[1] for line in made.lines()[1:-2]]
    hits  = [rows["took_bucket", (("le", edge),)] for edge in edges]

    assert [float(edge) for edge in edges] == [*made.buckets(), math.inf]
    assert hits == [float(value <= bound) for bound in made.buckets()] + [1.0]
    assert (rows["took_count", ()], rows["took_sum", ()], made.count()) == (1.0, float(value), 1)
    assert made.buckets() == tuple(float(bound) for bound in bounds)

driven()
named()
figured()

log.close()

print(f"fuzz metric  examples={EXAMPLES * 3}  ok")
