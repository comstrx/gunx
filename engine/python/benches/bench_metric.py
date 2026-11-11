from engine.log import log
from engine.metric import Counter, Gauge, Histogram, Metrics
from engine.test import Bench
from pathlib import Path

bench   = Bench()
metrics = Metrics("app")
calls   = metrics.counter("calls", "Calls served")
heat    = metrics.gauge("heat", "Work in flight")
took    = metrics.histogram("took", "Seconds per call")
tight   = Counter("tight", series=8)
board   = Metrics("svc")
wide    = Metrics("wide")
many    = wide.histogram("took", "Seconds per call")
ROUTES  = tuple(f"/v1/orders/{index}" for index in range(20))
VERBS   = ("get", "post", "put", "delete")
SPANS   = (0.0004, 0.003, 0.02, 0.08, 0.4, 1.7, 6.0, 30.0)

log.setup("info", "json", Path("/dev/null"))

for index in range(10):

    hits = board.counter(f"hits{index}", "Hits")
    held = board.gauge(f"held{index}", "Held")
    span = board.histogram(f"span{index}", "Seconds")

    for route in ROUTES:

        hits.inc(route=route, verb="get")
        held.set(index, route=route)
        span.observe(0.02, route=route)

for index in range(500): many.observe(SPANS[index % 8], route=f"/v1/items/{index}", verb=VERBS[index % 4])
for index in range(8): tight.inc(user=str(index))

def bare () -> None: calls.inc()

def one () -> None: calls.inc(route="/v1/orders")

def three () -> None: calls.inc(route="/v1/orders", verb="get", status="200")

def blank () -> None: calls.inc(route="/v1/orders", tenant="")

def amount () -> None: calls.inc(2.5, route="/v1/orders")

def read () -> None: calls.value(route="/v1/orders", verb="get", status="200")

def placed () -> None: heat.set(42.0, zone="a")

def moved () -> None: heat.add(1, zone="a")

def tracked () -> None:

    with heat.track(zone="a"): pass

def observed () -> None: took.observe(0.02)

def labelled () -> None: took.observe(0.4, route="/v1/orders", verb="get")

def beyond () -> None: took.observe(30.0, route="/v1/orders", verb="get")

def timed () -> None:

    with took.time(route="/v1/orders"): pass

def counted () -> None: took.count(route="/v1/orders", verb="get")

def dropped () -> None: tight.inc(user="late")

def found () -> None: metrics.counter("calls")

def fresh () -> None:

    made = Counter("fresh")

    made.inc(route="/v1/orders")

def churned () -> None:

    calls.inc(route="/v1/churn")
    calls.forget(route="/v1/churn")

def small () -> None: metrics.render()

def page () -> None: board.render()

def broad () -> None: wide.render()

def summed () -> None: board.describe()

def gauged () -> None: Gauge("fresh").set(1)

def built () -> None: Histogram("fresh", buckets=(0.1, 0.5, 1, 5))

bench.measure("metric.counter.inc", bare)
bench.measure("metric.counter.inc.label1", one)
bench.measure("metric.counter.inc.label3", three)
bench.measure("metric.counter.inc.blank", blank)
bench.measure("metric.counter.inc.amount", amount)
bench.measure("metric.counter.value", read)
bench.measure("metric.counter.dropped", dropped)
bench.measure("metric.counter.fresh", fresh)
bench.measure("metric.counter.churn", churned)
bench.measure("metric.gauge.set", placed)
bench.measure("metric.gauge.add", moved)
bench.measure("metric.gauge.track", tracked)
bench.measure("metric.gauge.fresh", gauged)
bench.measure("metric.histogram.observe", observed)
bench.measure("metric.histogram.observe.label2", labelled)
bench.measure("metric.histogram.observe.beyond", beyond)
bench.measure("metric.histogram.time", timed)
bench.measure("metric.histogram.count", counted)
bench.measure("metric.histogram.fresh", built)
bench.measure("metric.registry.counter", found)
bench.measure("metric.render.small", small, 5000)
bench.measure("metric.render.page600", page, 300)
bench.measure("metric.render.histogram500", broad, 100)
bench.measure("metric.describe.page", summed, 5000)

log.close()
