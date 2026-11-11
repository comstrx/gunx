from engine.domain import Dns, Domains, Record
from engine.domain.http import Http
from engine.error import Code, Fault
from collections.abc import Callable
from typing import Any, cast, override
import pytest

FLAG: Any = True

class FakeDns(Dns):

    def __init__ ( self, answers: dict[str, list[str]] ) -> None: self.answers = answers

    @override
    async def txt ( self, host: str ) -> list[str]: return self.answers.get(host, [])

async def test_domains_normalize_verify_and_point () -> None:

    domains = Domains()

    assert domains.normalize(" Shop.Example.IO. ") == "shop.example.io"
    assert domains.normalize("متجر.مصر") == "xn--pgbep1f.xn--wgbh1c"
    assert domains.apex("a.b.shop.io") == "shop.io" and domains.subdomains(["x.shop.io", "other.net", "y.shop.io"], "shop.io") == ["x.shop.io", "y.shop.io"]

    for bad in ("localhost", "example.com", "x", "-bad.io", "a..b", "a b.io"):

        with pytest.raises(Fault) as caught: domains.normalize(bad)

        assert caught.value.code is Code.VALIDATION and caught.value.reason == "domain.host"

    challenge = domains.challenge("shop.io")

    assert challenge.name == "_engine-verify.shop.io" and challenge.kind == "TXT" and challenge.value.startswith("engine-verify=")

    domains.dns(FakeDns({ "_engine-verify.shop.io": ["other", challenge.value] }))

    assert await domains.verify("shop.io", challenge.value) and not await domains.verify("shop.io", "wrong") and not await domains.verify("none.io", "x")

    record = await domains.point("shop.io", "edge.engine.io")

    assert record == Record("shop.io", "CNAME", "edge.engine.io") and await domains.records("shop.io") == [record]
    assert (await domains.tls("shop.io"))["status"] == "ready" and domains.describe()["default"] == "memory"
    assert record.dump()["ttl"] == 300

    await domains.close()

LONG = "x" * 1025

def test_records_and_hosts_are_validated () -> None:

    domains = Domains()

    wrongs: tuple[tuple[str, Callable[[], object]], ...] = (
        ("name", lambda: Record("", "A", "1.2.3.4")), ("name", lambda: Record("a b.io", "A", "1.2.3.4")), ("name", lambda: Record(cast("Any", 7), "A", "x")),
        ("name", lambda: Record("-a.io", "A", "x")), ("name", lambda: Record("a..io", "A", "x")), ("name", lambda: Record("a" * 254, "A", "x")),
        ("kind", lambda: Record("a.io", "PTR", "x")), ("kind", lambda: Record("a.io", "", "x")), ("kind", lambda: Record("a.io", cast("Any", None), "x")),
        ("value", lambda: Record("a.io", "TXT", "")), ("value", lambda: Record("a.io", "TXT", "a\nb")), ("value", lambda: Record("a.io", "TXT", "x" * 4097)),
        ("value", lambda: Record("a.io", "TXT", cast("Any", 7))), ("ttl", lambda: Record("a.io", "A", "x", -1)), ("ttl", lambda: Record("a.io", "A", "x", 604801)),
        ("ttl", lambda: Record("a.io", "A", "x", cast("Any", "300"))), ("ttl", lambda: Record("a.io", "A", "x", FLAG)),
    )

    for what, make in wrongs:

        with pytest.raises(Fault) as refused: make()

        assert refused.value.code is Code.VALIDATION and refused.value.reason == "domain.record" and refused.value.errors == { "record": [what] }, what

    assert Record("_engine-verify.shop.io", "txt", "engine-verify=abc", 0).kind == "TXT" and Record("shop.io", "cname", "x").dump()["kind"] == "CNAME"

    for bad in (cast("Any", None), cast("Any", 7), LONG, "", "shop.io/path", "a\nb.io", "xn--.io"):

        with pytest.raises(Fault) as wrong: domains.normalize(bad)

        assert wrong.value.reason == "domain.host"

    with pytest.raises(Fault) as unset: domains.dns(cast("Any", "resolver"))

    assert unset.value.reason == "domain.settings"

async def test_the_http_registrar_hides_a_broken_or_hostile_provider ( provider: Any ) -> None:


    domains   = Domains()
    registrar = domains.use(Http(provider.remote()))

    provider.answer(
        [{ "name": "shop.io", "kind": "cname", "value": "edge.io", "ttl": "120" }, { "name": "shop.io", "kind": "TXT", "value": "v" }],
        {}, {}, { "host": "shop.io", "status": "ready", "issuer": "le" }, "text",
    )

    found = await domains.records("shop.io")

    assert found == [Record("shop.io", "CNAME", "edge.io", 120), Record("shop.io", "TXT", "v")]
    assert provider.seen[-1][1] == "/records?host=shop.io"
    assert await domains.point("shop.io", "edge.engine.io") == Record("shop.io", "CNAME", "edge.engine.io") and provider.last() == { "name": "shop.io", "kind": "CNAME", "value": "edge.engine.io", "ttl": 300 }
    assert await registrar.remove(Record("shop.io", "A", "1.2.3.4")) and provider.seen[-1][0] == "DELETE"
    assert (await domains.tls("shop.io"))["issuer"] == "le" and (await domains.tls("shop.io")) == { "host": "shop.io", "status": "unknown" }

    for reason, answer in (
        ("domain.reply", { "records": [] }), ("domain.reply", ["x"]), ("domain.reply", [{ "name": "shop.io" }]), ("domain.reply", [{ "name": "shop.io", "kind": "A", "value": "x", "ttl": "soon" }]),
        ("domain.reply", [{ "name": "a b", "kind": "A", "value": "x" }]), ("domain.reply", b"{not json"), ("domain.provider", 400), ("domain.provider", 404), ("domain.provider", 429),
    ):

        provider.answer(answer)

        with pytest.raises(Fault) as broken: await domains.records("shop.io")

        assert broken.value.reason == reason and broken.value.server(), (reason, answer)

    provider.answer(500)

    with pytest.raises(Fault) as down: await domains.records("shop.io")

    assert down.value.code is Code.UNAVAILABLE and down.value.reason == "remote.500"

    with pytest.raises(Fault) as unset: Http(cast("Any", "http://x"))

    assert unset.value.reason == "domain.settings"

    await domains.close()

async def test_dns_lookups_fail_closed () -> None:

    domains = Domains()

    with pytest.raises(Fault) as blank: await Dns().txt("")

    assert blank.value.reason == "domain.host"

    assert not await domains.verify("shop.io", "") and not await domains.verify("shop.io", cast("Any", None))

    domains.dns(FakeDns({ "_engine-verify.shop.io": [cast("Any", 7), "right"] }))

    assert await domains.verify("shop.io", "right") and not await domains.verify("shop.io", "7")
