from engine.error import Code, Fault
from engine.parse import Email, Mime, parse
from engine.string import string
import pytest, yaml
from typing import Any, cast, override

def test_numbers_are_bounded () -> None:

    assert parse.integer(" 42 ") == 42 and parse.integer("1_000") == 1000 and parse.integer(7, 1, 10) == 7
    assert parse.number("1.5") == 1.5 and parse.number(2) == 2.0
    assert parse.boolean("yes") and parse.boolean("نعم") and not parse.boolean("off") and not parse.boolean("لا")

    for bad in ("x", True, "9" * 40, "nan"):

        with pytest.raises(Fault) as caught: parse.integer(bad)

        assert caught.value.code is Code.BAD_REQUEST and caught.value.reason == "parse.integer"

    with pytest.raises(Fault): parse.integer(11, 1, 10)
    with pytest.raises(Fault): parse.number("inf")
    with pytest.raises(Fault): parse.number("nan")
    with pytest.raises(Fault): parse.boolean("maybe")

def test_durations_and_sizes () -> None:

    assert parse.duration("1h30m") == 5400.0 and parse.duration("250ms") == 0.25 and parse.duration("2") == 2.0
    assert parse.duration("1.5d") == 129600.0 and parse.duration(3) == 3.0
    assert parse.size("10MiB") == 10485760 and parse.size("2kb") == 2000 and parse.size("512") == 512 and parse.size(7) == 7

    for bad in ("", "1x", "h", "1h x"):

        with pytest.raises(Fault): parse.duration(bad)

    with pytest.raises(Fault): parse.size("10 petabytes")

def test_queries_urls_and_toml () -> None:

    assert parse.query("?a=1&a=2&b=&c") == { "a": ["1", "2"], "b": [""], "c": [""] }

    url = parse.url("HTTPS://Example.com:8443/path?x=1")

    assert (url.scheme, url.host, url.port, url.path, url.query) == ("https", "example.com", 8443, "/path", "x=1")
    assert url.origin() == "https://example.com:8443" and parse.url("http://h").path == "/"
    assert parse.toml('a = 1\n[b]\nc = "d"') == { "a": 1, "b": { "c": "d" } }

    with pytest.raises(Fault): parse.url("ftp://x")
    with pytest.raises(Fault): parse.url("http://")
    with pytest.raises(Fault): parse.url("http://h:99999")
    with pytest.raises(Fault): parse.url("http://h:0")
    with pytest.raises(Fault): parse.url(cast("Any", None))

    for bad in ("http://exa mple.com/", "http://ex%41mple.com/", "http://a_b.com/", "http://-a.com/", "http://a..b/", "http://a.-b.com/", "http://[", "http://[::1"):

        with pytest.raises(Fault) as wrong: parse.url(bad)

        assert wrong.value.reason == "parse.url", bad

    assert parse.url("http://[::1]:8080/").host == "::1" and parse.url("http://127.0.0.1/").host == "127.0.0.1"
    assert parse.url("http://münchen.de/").host == "xn--mnchen-3ya.de" and parse.url("http://A.B.test./x").host == "a.b.test"
    assert parse.url("http://127。0。0。1/").host == "127.0.0.1" and parse.url("http://user:pw@h.test/").user == "user"
    assert parse.url("redis://:p%40ss@h.test:6380/3", schemes=("redis",)).password == "p@ss" and "p@ss" not in repr(parse.url("redis://:p%40ss@h.test/", schemes=("redis",)))
    with pytest.raises(Fault): parse.quote("\ud800")
    assert parse.quote("a b/c") == "a%20b%2Fc" and parse.quote(7) == "7" and parse.quote("a/b", safe="/") == "a/b" and parse.unquote("a%20b%2F") == "a b/"
    assert parse.encode({ "q": "a b", "n": 1, "none": None }) == "q=a+b&n=1" and parse.encode([("x", "é")]) == "x=%C3%A9" and parse.encode({}) == ""
    with pytest.raises(Fault): parse.toml("a = ")
    with pytest.raises(Fault): parse.query("a=1&" * 2000)

def test_semver_templates_and_lists () -> None:

    assert parse.semver("1.2.3-rc.1+build") == (1, 2, 3, "rc.1", "build")
    assert parse.template("Hi {user.name}, {n}", { "user": { "name": "A" }, "n": 2 }) == "Hi A, 2"
    assert parse.template("{missing}", {}, strict=False) == "{missing}"
    assert parse.keys("{a} {b.c} {a}") == ("a", "b.c")
    assert parse.list(" a, b ,, c ") == ["a", "b", "c"] and parse.list(["x", " "]) == ["x"]

    with pytest.raises(Fault): parse.semver("01.2.3")
    with pytest.raises(Fault): parse.template("{missing}", {})
    with pytest.raises(Fault) as wide: parse.template("{n}", { "n": 10 ** 5000 })

    assert wide.value.reason == "parse.template"
    assert parse.template("{n} of {m}", { "n": 10 ** 5000, "m": 2 }, strict=False) == "{n} of 2"

def test_identities () -> None:

    assert parse.email(" Ali.B@Example.COM ") == Email("Ali.B", "example.com") and parse.email("a@b.co").text() == "a@b.co"
    assert parse.phone("+20 (10) 9918-8572") == "+201099188572" and parse.phone("0020 10 99188572") == "+201099188572"
    assert parse.phone("01099188572", region="20") == "+201099188572" and parse.phone("01099188572", "+20") == "+201099188572"
    assert parse.phone(string.eastern("+201099188572")) == "+201099188572"
    assert parse.uuid("019A7E7B-5B1C-7F3A-9C2E-ABCDEF012345") == "019a7e7b-5b1c-7f3a-9c2e-abcdef012345"
    assert parse.uuid("019a7e7b5b1c7f3a9c2eabcdef012345") == "019a7e7b-5b1c-7f3a-9c2e-abcdef012345"
    assert parse.ulid("01arz3ndektsv4rrffq69g5fav") == "01ARZ3NDEKTSV4RRFFQ69G5FAV" and parse.slug("hello-world-2") == "hello-world-2"
    assert str(parse.ip("127.0.0.1")) == "127.0.0.1" and parse.ip("::1").version == 6 and str(parse.cidr("10.0.0.5/8")) == "10.0.0.0/8"
    assert parse.mac("AA-BB-CC-DD-EE-FF") == "aa:bb:cc:dd:ee:ff" and parse.mac("aabbccddeeff") == "aa:bb:cc:dd:ee:ff"
    assert parse.hostname("Example.COM.") == "example.com" and parse.hostname("مثال.مصر") == "xn--mgbh0fb.xn--wgbh1c" and parse.port("8080") == 8080
    assert parse.color("#fff") == (255, 255, 255, 255) and parse.color("#00ff0080") == (0, 255, 0, 128) and parse.color("abc8") == (170, 187, 204, 136)
    assert parse.color("rgb(1, 2, 3)") == (1, 2, 3, 255) and parse.color("rgba(1,2,3,0.5)") == (1, 2, 3, 128)
    assert parse.coordinates("30.0444, 31.2357") == (30.0444, 31.2357) and parse.coordinates(string.eastern("1,2")) == (1.0, 2.0)
    assert parse.numbers("1-3, 7, 5-6, 3") == [1, 2, 3, 5, 6, 7] and parse.numbers("") == []
    assert parse.pairs("a=1, b = x=y,,") == { "a": "1", "b": "x=y" } and parse.csv('a,"b,c",d') == ["a", "b,c", "d"] and parse.csv("") == []
    assert parse.join("https://x.com/a/b", "../c?d=1") == "https://x.com/c?d=1" and parse.join("https://x.com/a", "https://y.com/") == "https://y.com/"

    bad = {
        "email": ("x", "a@b", "a@b..c", "a@b.c."), "phone": ("123", "+0123456789", "abc"), "uuid": ("x", "019a7e7b-5b1c-9f3a-9c2e-abcdef012345"),
        "ulid": ("x", "8" + "0" * 25), "slug": ("Hello", "a--b", "-a"), "ip": ("1.2.3.256", "x"), "cidr": ("10.0.0.0/33",), "mac": ("aa:bb",),
        "hostname": ("", "-bad.com", "a" * 64 + ".com", "x" * 254), "port": ("0", "70000", "x"), "color": ("#12", "rgb(1,2)", "rgb(256,0,0)"),
        "coordinates": ("91,0", "1", "a,b"), "numbers": ("a", "5-1", "1-99999999"), "pairs": ("novalue", "=1"),
    }

    for kind, samples in bad.items():

        for sample in samples:

            with pytest.raises(Fault) as caught: getattr(parse, kind)(sample)

            assert caught.value.reason == f"parse.{kind}", (kind, sample)

def test_headers () -> None:

    found = parse.mime('Text/HTML; charset="UTF-8"; boundary=x')

    assert found == Mime("text", "html", { "charset": "UTF-8", "boundary": "x" }) and found.text() == "text/html"
    assert found.matches("text/*") and found.matches("*/*") and found.matches("text/html") and not found.matches("application/json")
    assert parse.accept("text/html, application/json;q=0.9, */*;q=0.1, image/png;q=0") == ["text/html", "application/json", "*/*"]
    assert parse.accept("a/b;q=x, c/d") == ["c/d"] and parse.accept("") == []
    assert parse.cookie('a=1; b="two"; broken; c=') == { "a": "1", "b": "two", "c": "" }
    assert parse.authorization("Bearer abc.def") == ("bearer", "abc.def") and parse.bearer("bearer tok") == "tok"
    assert parse.basic("Basic " + string.base64("user:pa:ss")) == ("user", "pa:ss")

    for kind, sample in (("mime", "text"), ("mime", "/x"), ("authorization", "Bearer"), ("bearer", "Basic x"), ("bearer", "Bearer a b"), ("basic", "Bearer x"), ("basic", "Basic ###"), ("basic", "Basic " + string.base64("nocolon"))):

        with pytest.raises(Fault) as caught: getattr(parse, kind)(sample)

        assert caught.value.reason == f"parse.{kind}"

def test_auto_guesses_scalars () -> None:

    assert parse.auto("42") == 42 and parse.auto("-1.5") == -1.5 and parse.auto("1e3") == 1000.0
    assert parse.auto("true") is True and parse.auto("False") is False and parse.auto("null") is None and parse.auto("") is None
    assert parse.auto("hello") == "hello" and parse.auto(7) == 7 and parse.auto(" 12 ") == 12

def test_list_conversion_preserves_nonempty_values_and_stringifies_once () -> None:

    class Named:

        def __init__ ( self ) -> None: self.calls = 0

        @override
        def __str__ ( self ) -> str:

            self.calls += 1

            return " item "

    named = Named()

    assert parse.list([" a ", "", "  ", 0, False, None, named]) == ["a", "0", "False", "None", "item"]
    assert named.calls == 1
    assert parse.list(" a | | b | ", "|") == ["a", "b"]
    assert parse.list((" a ", "", " b ")) == ["a", "b"]

def test_documents_round_trip_and_convert_without_file_io () -> None:

    value = {"name": "مرحبا", "enabled": True, "nested": {"items": [1, 2, 3]}}
    for kind in ("json", "toml", "yaml"):
        text = parse.dumps(value, kind)
        assert parse.loads(text, kind) == value
        assert parse.document(text, kind).dict() == value
    assert parse.loads(parse.convert("a = 1", "toml", "json")) == {"a": 1}
    assert parse.yaml("- 1\n- 2") == [1, 2]
    assert parse.json("[1,2]") == [1, 2]

def test_document_edits_are_owned_and_templates_are_single_pass () -> None:

    value: dict[str, Any] = {"service": {"name": "{name}", "port": 80}, "remove": True}
    doc = parse.of(value).set("service.port", 8080).update({"new": "x"}).remove("remove")
    assert doc.render({"name": "api"}).get("service.name") == "api"
    assert value["service"]["name"] == "{name}" and value["service"]["port"] == 80
    assert doc.match("service.*") == {"service.name": "api", "service.port": 8080}
    assert parse.of({"name": "__name__"}).render({"name": "{other}"}, delimiters=("__", "__")).dict() == {
        "name": "{other}",
    }
    result = doc.dict()
    result["service"]["port"] = 7
    assert doc.get("service.port") == 8080
    assert parse.of([1, 2]).list() == [1, 2]

def test_yaml_rejects_code_duplicate_keys_cycles_and_excess_depth () -> None:

    for text in (
        "!!python/object/apply:os.system ['echo forbidden']",
        "a: 1\na: 2",
        "a: &a [*a]",
        "[" * 150 + "0" + "]" * 150,
        "1: x",
    ):
        with pytest.raises(Fault): parse.yaml(text)

def test_document_failures_are_atomic_and_do_not_leak_content () -> None:

    doc = parse.of({"a": "{missing}", "b": "{found}"})
    with pytest.raises(Fault): doc.render({"found": "new"})
    assert doc.dict() == {"a": "{missing}", "b": "{found}"}
    for text in ("Bearer secret token", "Basic secret"):
        with pytest.raises(Fault) as caught: parse.basic(text)
        assert caught.value.errors is None
    with pytest.raises(Fault): parse.dumps([1], "toml")
    with pytest.raises(Fault): parse.loads("x", "unknown")
    cycle: dict[str, Any] = {}
    cycle["self"] = cycle
    with pytest.raises(Fault): parse.of(cycle)

def test_precise_sizes_ipv6_and_nonfinite_coordinates () -> None:

    assert parse.size("9007199254740993B") == 9007199254740993
    assert parse.size("0.1KiB") == 102
    assert parse.url("http://[::1]:8080/a").origin() == "http://[::1]:8080"
    for text in ("nan,0", "0,nan", "inf,0"):
        with pytest.raises(Fault): parse.coordinates(text)
    assert parse.csv("a,b\nc,d") == ["a", "b"]

def test_paths_are_explicit_and_document_callbacks_cannot_leak_ownership () -> None:

    doc = parse.of({"a.b": {"value": 1}, "rows": [{"id": 3}]}, separator="/")
    assert doc.keys() == ["a.b/value", "rows/0/id"]
    assert doc.get("a.b/value") == 1
    assert doc.match("rows/*") == {"rows/0/id": 3}
    doc.set("a.b/value", 2)
    assert doc.get("a.b/value") == 2
    original = doc.value()
    with pytest.raises(Fault): doc.update({"a.b/value": 8, "rows/99": 4})
    assert doc.value() == original
    with pytest.raises(Fault): parse.of({"a.b": 1}).keys()
    with pytest.raises(Fault): parse.of({"": 1}).keys()
    shared = [1]
    made = parse.of({"x": 2}).map(lambda _: shared)
    shared.append(3)
    assert made.get("x") == [1]
    collision = parse.of({"{x}": 1, "same": 2})
    with pytest.raises(Fault): collision.render({"x": "same"}, keys=True)
    assert collision.dict() == {"{x}": 1, "same": 2}

def test_headers_semver_and_duration_preserve_syntax_boundaries () -> None:

    assert parse.mime('text/plain; title="a;b,c"; note="a\\"b"').params == {"title": "a;b,c", "note": 'a"b'}
    assert parse.accept('text/plain; note="a,b"; q=0.5, application/json') == ["application/json", "text/plain"]
    for text in ('text/plain; title="open', "text/plain\r\nX: bad"):
        with pytest.raises(Fault): parse.mime(text)
    for text in ("1.2.3-a..b", "1.2.3-01", "1.2.3+x..y", "\u0661.2.3"):
        with pytest.raises(Fault): parse.semver(text)
    assert parse.semver("1.2.3-0+01") == (1, 2, 3, "0", "01")
    assert parse.duration("1 h 30 m") == 5400
    for value in ("1 2", -1, float("nan"), float("inf")):
        with pytest.raises(Fault): parse.duration(value)
    with pytest.raises(Fault): parse.url("http://exa\nmple.com")

def test_yaml_loader_customizations_do_not_change_global_safe_loader ( monkeypatch: pytest.MonkeyPatch ) -> None:

    constructors = dict(yaml.SafeLoader.yaml_constructors)
    native = getattr(yaml, "CSafeLoader", None)
    assert parse.yaml("a: &item [1, 2]\nb: *item") == {"a": [1, 2], "b": [1, 2]}
    for key in ("CSafeLoader", "CSafeDumper"):
        monkeypatch.delattr(yaml, key, raising=False)
    assert parse.yaml("name: value") == {"name": "value"}
    assert parse.yaml(parse.dumps({"name": "yes"}, "yaml")) == {"name": "yes"}
    with pytest.raises(Fault): parse.yaml("a: 1\na: 2")
    assert yaml.SafeLoader.yaml_constructors == constructors
    if native is not None:
        assert native.yaml_constructors == constructors

def test_yaml_merges_allow_explicit_overrides_but_bound_alias_expansion () -> None:

    text = "base: &base {port: 80, host: localhost}\nservice: {<<: *base, port: 8080}"
    assert parse.yaml(text)["service"] == {"port": 8080, "host": "localhost"}
    bomb = "a0: &a0 {x: 1}\n"
    for index in range(1, 20):
        bomb += f"a{index}: &a{index} {{<<: [*a{index - 1}, *a{index - 1}]}}\n"
    with pytest.raises(Fault) as caught: parse.yaml(bomb)
    assert caught.value.code is Code.TOO_LARGE

def test_render_limits_total_substitution_before_publishing () -> None:

    doc = parse.of({"a": "{text}", "b": "{text}", "c": "{text}"})
    with pytest.raises(Fault) as caught: doc.render({"text": "x" * 3_000_000})
    assert caught.value.code is Code.TOO_LARGE
    assert doc.get("a") == "{text}"

@pytest.mark.parametrize("value", [None, 1, [], {}])
def test_document_boundary_errors_are_typed ( value: Any ) -> None:

    with pytest.raises(Fault): parse.loads("{}", value)
    with pytest.raises(Fault): parse.loads(value)
    with pytest.raises(Fault): parse.of({}, separator=value)

def test_render_walks_tuple_values_and_keys_atomically () -> None:

    source = {"{ key }": ("__ name __",)}
    doc = parse.of(source)
    doc.render({"key": "title"}, keys=True, strict=False)
    doc.render({"name": "value"}, delimiters=("__", "__"))
    assert doc.value() == {"title": ("value",)}
    assert source == {"{ key }": ("__ name __",)}
    failed = parse.of({"{ key }": "{value}", "title": "old"})
    with pytest.raises(Fault): failed.render({"key": "title", "value": "new"}, keys=True)
    assert failed.value() == {"{ key }": "{value}", "title": "old"}

def test_failed_document_mapping_preserves_mutable_leaf_ownership () -> None:

    doc = parse.of({"a": bytearray(b"old"), "b": 2})
    def fail ( value: Any ) -> Any:

        if value == 2: raise ValueError("stop")
        value.extend(b"-changed")
        return value

    with pytest.raises(ValueError, match="stop"): doc.map(fail)
    assert doc.value() == {"a": bytearray(b"old"), "b": 2}
