from engine.error import Code, Fault
from engine.validate import Resource, Rules, Shape, field, rules, validator
from typing import Any, cast, override
from typing import ClassVar
from concurrent.futures import ThreadPoolExecutor
from decimal import localcontext
from dataclasses import dataclass
from types import MappingProxyType
import gc, pytest, weakref

class Signup(Shape):

    email : str
    age   : int = 18
    tags  : list[str] = field(default_factory=list)

def test_shapes_decode_once_and_refuse_the_unknown () -> None:

    made = validator.shape(Signup, b'{"email": "a@b.co", "age": "21"}')

    assert made == Signup(email="a@b.co", age=21) and made.dump() == { "email": "a@b.co", "age": 21, "tags": [] }
    assert validator.shape(Signup, { "email": "x@y.z" }).age == 18
    assert validator.shape(Signup, '{"email": "s"}').copy(age=3).age == 3
    assert Signup.fields() == ("email", "age", "tags") and Signup.schema()["$ref"] == "#/$defs/Signup"
    assert Signup.decoder() is Signup.decoder()
    assert validator.convert(list[int], ["1", 2]) == [1, 2]

    with pytest.raises(Fault) as missing: validator.shape(Signup, b"{}")

    assert missing.value.code is Code.VALIDATION and missing.value.reason == "validate.shape"
    assert missing.value.errors == { "body": ["Object missing required field `email`"] }

    with pytest.raises(Fault) as wrong: validator.shape(Signup, { "email": "a", "age": "old" })

    assert wrong.value.errors == { "age": ["Expected `int`, got `str`"] }

    with pytest.raises(Fault) as unknown: validator.shape(Signup, { "email": "a", "extra": 1 })

    assert unknown.value.errors == { "extra": ["is not allowed"] }

    with pytest.raises(Fault) as malformed: validator.shape(Signup, b"{")

    assert malformed.value.code is Code.BAD_REQUEST

    with pytest.raises(Fault): validator.shape(Signup, 42)
    with pytest.raises(Fault): validator.convert(int, "x")

    for work in (
        lambda: validator.shape(Signup, '{"email": "\ud800"}'), lambda: validator.shape(Signup, b'{"email": "\xff"}'),
        lambda: validator.shape(Signup, { "email": "a", "age": "\ud800" }), lambda: validator.convert(int, "\udcff"),
    ):

        with pytest.raises(Fault) as garbled: work()

        assert garbled.value.code is Code.BAD_REQUEST and garbled.value.reason == "validate.encoding"

def test_rules_read_like_laravel () -> None:

    spec = {
        "email"  : "required|email|max:64",
        "age"    : "integer|between:18,99",
        "role"   : "required|in:admin,user",
        "phone"  : "nullable|phone",
        "slug"   : "slug",
        "site"   : "url",
        "id"     : "uuid",
        "otp"    : "digits:6",
        "born"   : "date",
    }

    kept = rules.check({ "email": "a@b.co", "age": 30, "role": "user", "phone": None, "otp": "123456", "born": "2020-01-02" }, spec)

    assert kept == { "email": "a@b.co", "age": 30, "role": "user", "phone": None, "otp": "123456", "born": "2020-01-02" }

    with pytest.raises(Fault) as caught:

        rules.check(
            { "email": "nope", "age": 7, "role": "boss", "phone": "abc", "slug": "Bad Slug", "site": "x", "id": "1", "otp": "12", "born": "x", "x": 1 },
            spec, "signup",
        )

    assert caught.value.reason == "signup"
    assert caught.value.errors == {
        "email" : ["must be a valid email"],
        "age"   : ["must be between 18 and 99"],
        "role"  : ["must be one of admin,user"],
        "phone" : ["must be a valid phone"],
        "slug"  : ["must be a slug"],
        "site"  : ["must be a url"],
        "id"    : ["must be a uuid"],
        "otp"   : ["must be 6 digits"],
        "born"  : ["must be a date"],
        "x"     : ["is not allowed"],
    }

    with pytest.raises(Fault) as missing: rules.check({}, { "email": "required" })

    assert missing.value.errors == { "email": ["is required"] }

    with pytest.raises(Fault) as unknown: rules.check({ "a": 1 }, { "a": "wat" })

    assert unknown.value.code is Code.INTERNAL and unknown.value.reason == "validate.rule"

    rules.register("even", lambda v, _: None if isinstance(v, int) and v % 2 == 0 else "must be even")

    assert "even" in rules.names() and rules.check({ "n": 2 }, { "n": "even" }) == { "n": 2 }

class Account(Shape):

    fillable : ClassVar[tuple[str, ...]] = ("name",)
    hidden   : ClassVar[tuple[str, ...]] = ("secret",)

    name   : str
    secret : str = "s3cret"

def test_shapes_fill_only_what_is_fillable_and_hide_what_is_hidden () -> None:

    account = Account(name="Ann")
    renamed = account.fill(name="Bob")

    assert renamed.name == "Bob" and account.name == "Ann" and renamed.dump() == { "name": "Bob" }

    with pytest.raises(Fault) as guarded: account.fill(name="Cat", secret="x")

    assert guarded.value.code is Code.VALIDATION and guarded.value.reason == "validate.guarded"
    assert guarded.value.errors == { "secret": ["is guarded"] }

class Card(Resource[Account]):

    fields: ClassVar[tuple[str, ...]] = ("name", "secret")

class Badge(Resource[Account]):

    @classmethod
    @override
    def dump ( cls, item: Account ) -> dict[str, Any]:

        return { "label": item.name.upper() }

def test_resources_shape_what_a_model_shows_and_never_what_it_hides () -> None:

    ann, bob = Account(name="Ann"), Account(name="Bob")

    assert Resource[Account].one(ann) == { "name": "Ann" } and Card.one(ann) == { "name": "Ann" }
    assert Card.many([ann, bob]) == [{ "name": "Ann" }, { "name": "Bob" }] and Badge.many([ann]) == [{ "label": "ANN" }]

def test_the_rulebook_covers_presence_types_sizes_and_cross_fields () -> None:

    payload = {
        "name": "Ann", "password": "secret12", "password_confirmation": "secret12", "age": "27", "kind": "pro", "plan": "gold",
        "code": "AB_c-1", "lower": "abc", "upper": "ABC", "tz": "Africa/Cairo", "ip4": "10.0.0.1", "ip6": "::1", "mac": "aa:bb:cc:dd:ee:ff",
        "color": "#fff", "terms": "yes", "news": "off", "flag": "1", "doc": '{"a":1}', "price": "12.50", "qty": 15, "big": 1000,
        "tags": ["a", "b"], "roles": ["x", "y"], "role": "x", "items": [{ "id": 1, "sku": "A1" }, { "id": 2, "sku": "B2" }],
        "start": "2026-01-01", "end": "2026-02-01", "when": "2026-01-01 10:00:00", "site": "https://x.co", "nickname": "nick", "ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "digits": "12345", "ascii": "plain", "alpha": "Hello", "alnum": "abc123", "pick": "b",
    }
    spec = {
        "name": "required|string|min:2|max:10|alpha", "password": "required|confirmed|min:8", "age": "numeric|digits_between:1,3",
        "kind": "required_if:plan,gold|in:pro,basic", "plan": "string", "code": "alpha_dash|regex:^[A-Z].*|not_regex:\\s",
        "lower": "lowercase|starts_with:a,z|doesnt_end_with:x", "upper": "uppercase|ends_with:C|doesnt_start_with:x",
        "tz": "timezone", "ip4": "ip|ipv4", "ip6": "ipv6", "mac": "mac", "color": "hex_color", "terms": "accepted", "news": "declined",
        "flag": "boolean", "doc": "json", "price": "decimal:2|multiple_of:0.5", "qty": "integer|gt:age|lt:big|between:10,20|size:15",
        "big": "gte:qty|max_digits:4|min_digits:2", "tags": "list|distinct|contains:a|size:2", "roles": "list", "role": "in_array:roles",
        "items": "list", "items.*.id": "required|integer", "items.*.sku": "required|string|size:2",
        "start": "date|before:end|before_or_equal:2026-01-01|date_equals:2026-01-01", "end": "date|after:start|after_or_equal:start",
        "when": "date_format:%Y-%m-%d %H:%M:%S", "site": "url|different:name", "nickname": "present|filled",
        "ulid": "ulid", "digits": "digits:5|min_digits:5", "ascii": "ascii", "alpha": "alpha", "alnum": "alpha_num", "pick": "in:a,b",
        "ghost": "missing|prohibited", "twin": "same:name|sometimes", "note": "required_with:nothing|prohibited_if:plan,gold",
    }

    kept = rules.check(payload, spec)

    assert kept["items"] == payload["items"] and kept["name"] == "Ann" and "ghost" not in kept and kept["nickname"] == "nick"
    assert "note" not in kept and "twin" not in kept

    with pytest.raises(Fault) as caught:

        rules.check(
            {
                "name": "A", "password": "secret12", "password_confirmation": "other", "age": "x", "kind": "boss", "plan": "gold", "code": "bad code",
                "lower": "ABx", "upper": "abc", "tz": "Mars", "ip4": "::1", "ip6": "1.1.1.1", "mac": "nope", "color": "red", "terms": "no", "news": "yes",
                "flag": "maybe", "doc": "{", "price": "12.123", "qty": 5, "big": 7, "tags": ["a", "a"], "roles": ["x"], "role": "q",
                "items": [{ "sku": "LONG" }], "start": "2026-03-01", "end": "2026-02-01", "when": "2026", "site": "ftp://x", "nickname": "",
                "ulid": "zz", "digits": "12", "ascii": "é", "alpha": "a1", "alnum": "a-1", "pick": "z", "ghost": 1, "twin": "Bob", "note": "x",
            },
            spec,
        )

    assert caught.value.errors == {
        "name": ["must be at least 2"], "password": ["must be confirmed"], "age": ["must be numeric"], "kind": ["must be one of pro,basic"],
        "code": ["must be letters, numbers or dashes"], "lower": ["must be lowercase"], "upper": ["must be uppercase"], "tz": ["must be a timezone"],
        "ip4": ["must be an ipv4 address"], "ip6": ["must be an ipv6 address"], "mac": ["must be a mac address"], "color": ["must be a color"],
        "terms": ["must be accepted"], "news": ["must be declined"], "flag": ["must be a boolean"], "doc": ["must be valid json"],
        "price": ["must have 2 decimal places"], "qty": ["must be between 10 and 20"], "big": ["needs at least 2 digits"],
        "tags": ["must not repeat"], "role": ["must be one of roles"], "items.0.id": ["is required"], "items.0.sku": ["must be exactly 2"],
        "start": ["must be before end"], "end": ["must be after start"], "when": ["must match the format %Y-%m-%d %H:%M:%S"],
        "site": ["must be a url"], "nickname": ["must be filled"], "ulid": ["must be a ulid"], "digits": ["must be 5 digits"],
        "ascii": ["must be ascii"], "alpha": ["must be letters only"], "alnum": ["must be letters and numbers"], "pick": ["must be one of a,b"],
        "ghost": ["must be missing"], "twin": ["must match name"], "note": ["is prohibited"],
    }

    assert rules.check({ "a": 1 }, { "a": "required_without:b", "b": "required_without:a" }) == { "a": 1 }
    assert rules.check({ "b": "x" }, { "a": "required_with_all:b,c", "b": "string", "c": "sometimes|string" }) == { "b": "x" }
    assert rules.check({ "plan": "free" }, { "plan": "string", "card": "required_unless:plan,free" }) == { "plan": "free" }
    assert rules.check({ "x": 2 }, { "x": "multiple_of:2|decimal:0" })["x"] == 2 and rules.check({}, { "x": "prohibits:y" }) == {}

    for payload_, spec_ in (
        ({}, { "a": "required_without:b" }), ({ "c": 1 }, { "a": "required_with:c", "c": "integer" }), ({ "b": 1, "c": 1 }, { "a": "required_with_all:b,c", "b": "integer", "c": "integer" }),
        ({ "plan": "gold" }, { "plan": "string", "card": "required_unless:plan,free" }), ({ "x": 1, "y": 2 }, { "x": "prohibits:y", "y": "integer" }),
        ({ "items": [1, "a"] }, { "items": "list", "items.*": "integer" }), ({ "a": 7 }, { "a": "multiple_of:0" }), ({ "a": "x" }, { "a": "decimal:2" }),
    ):

        with pytest.raises(Fault): rules.check(payload_, spec_)

    assert len(rules.names()) >= 75 and rules.compile(spec) is rules.compile(spec)

def test_the_laravel_lap_of_rules () -> None:

    accepted = rules.check({ "terms": "yes", "plan": "pro" }, { "plan": "string", "terms": "accepted_if:plan,pro" })

    assert accepted == { "terms": "yes", "plan": "pro" }

    with pytest.raises(Fault): rules.check({ "terms": "no", "plan": "pro" }, { "plan": "string", "terms": "accepted_if:plan,pro" })

    assert rules.check({ "plan": "free" }, { "plan": "string", "terms": "accepted_if:plan,pro" }) == { "plan": "free" }
    assert rules.check({ "ok": "off", "mode": "x" }, { "mode": "string", "ok": "declined_if:mode,x" })["ok"] == "off"

    with pytest.raises(Fault): rules.check({ "paid": True }, { "paid": "boolean", "card": "required_if_accepted:paid" })

    assert rules.check({ "paid": True, "card": "4111" }, { "paid": "boolean", "card": "required_if_accepted:paid" })["card"] == "4111"
    with pytest.raises(Fault): rules.check({ "paid": False }, { "paid": "boolean", "card": "required_if_declined:paid" })

    assert rules.check({ "paid": True }, { "paid": "boolean", "card": "required_if_declined:paid" }) == { "paid": True }

    with pytest.raises(Fault): rules.check({ "a": 1, "b": 2 }, { "a": "integer", "b": "missing_with:a" })

    assert rules.check({ "b": 2 }, { "a": "integer", "b": "missing_with:a" }) == { "b": 2 }

    with pytest.raises(Fault): rules.check({ "kind": "card" }, { "kind": "string", "number": "present_if:kind,card" })

    assert rules.check({ "kind": "card", "number": "" }, { "kind": "string", "number": "present_if:kind,card" })["kind"] == "card"

    kept = rules.check({ "kind": "x", "debug": 1, "secret": "s" }, { "kind": "string", "debug": "exclude", "secret": "exclude_if:kind,x" })

    assert kept == { "kind": "x" }

    kept = rules.check({ "kind": "y", "secret": "s", "token": "t" }, { "kind": "string", "secret": "exclude_if:kind,x", "token": "exclude_without:kind" })

    assert kept == { "kind": "y", "secret": "s", "token": "t" }

    with pytest.raises(Fault): rules.check({ "a": 1, "b": 2 }, { "a": "integer", "b": "prohibited_unless:a,9" })

    assert rules.check({ "a": 9, "b": 2 }, { "a": "integer", "b": "prohibited_unless:a,9" })["b"] == 2

    with pytest.raises(Fault): rules.check({ "paid": "yes", "iou": 1 }, { "paid": "accepted", "iou": "prohibited_if_accepted:paid" })

    assert rules.check({ "paid": "no", "iou": 1 }, { "paid": "declined", "iou": "prohibited_if_accepted:paid" })["iou"] == 1

    with pytest.raises(Fault): rules.check({ "paid": "no", "iou": 1 }, { "paid": "declined", "iou": "prohibited_if_declined:paid" })

    assert rules.check({ "roles": { "admin": 1 } }, { "roles": "array|in_array_keys:admin,owner|required_array_keys:admin" })

    with pytest.raises(Fault): rules.check({ "roles": { "guest": 1 } }, { "roles": "in_array_keys:admin,owner" })
    with pytest.raises(Fault): rules.check({ "roles": { "admin": 1 } }, { "roles": "required_array_keys:admin,owner" })
    with pytest.raises(Fault): rules.check({ "tags": ["a", "b"] }, { "tags": "list|doesnt_contain:b" })

    assert rules.check({ "tags": ["a"] }, { "tags": "list|doesnt_contain:b,c" })["tags"] == ["a"]
    assert rules.check({ "size": "L" }, { "size": "enum:S,M,L" })["size"] == "L" and rules.check({ "x": [] }, { "x": "array" })["x"] == []
    assert len(rules.compile({ "a": "nullable|sometimes|bail|string" })) == 1
    assert len(rules.names()) >= 100

def test_laravel_validation_examples_behave_the_same () -> None:

    kept = rules.check(
        { "title": "A post", "body": "text", "publish_at": "2026-01-01", "tags": ["a", "b"], "author": { "email": "a@b.co" } },
        {
            "title": "required|string|max:255", "body": "required", "publish_at": "nullable|date", "tags": "list|distinct",
            "tags.*": "string|alpha", "author.email": "required|email",
        },
    )

    assert set(kept) == { "title", "body", "publish_at", "tags", "author" }
    assert rules.check({ "password": "secret12", "password_confirmation": "secret12" }, { "password": "required|confirmed|min:8" })["password"]
    assert rules.check({ "age": 30 }, { "age": "integer|between:18,65" })["age"] == 30
    assert rules.check({ "role": "admin" }, { "role": "in:admin,user" })["role"] == "admin"
    assert rules.check({ "code": "1234" }, { "code": "digits:4" })["code"] == "1234"
    assert rules.check({ "site": "https://laravel.com" }, { "site": "url" })["site"] == "https://laravel.com"
    assert rules.check({ "user": "taylor_otwell-1" }, { "user": "alpha_dash" })["user"] == "taylor_otwell-1"
    assert rules.check({ "ends": "2026-02-01", "starts": "2026-01-01" }, { "starts": "date", "ends": "date|after:starts" })["ends"]
    assert rules.check({ "shipping": True, "address": "x" }, { "shipping": "boolean", "address": "required_if_accepted:shipping" })["address"] == "x"
    assert rules.check({ "shipping": False }, { "shipping": "boolean", "address": "required_if_accepted:shipping" }) == { "shipping": False }

def test_shape_metadata_is_owned_by_each_type_and_collectable () -> None:

    class Child(Signup):

        flag: bool = False

    assert Child.fields() == ("email", "age", "tags", "flag")
    assert Signup.fields() == ("email", "age", "tags") and Child.fields() is Child.fields()
    assert Child.decoder() is not Signup.decoder() and Child.members() is Child.members()
    assert Child.from_json(b'{"email":"a","flag":true}').flag

    def temporary () -> weakref.ReferenceType[type[Shape]]:

        class Temporary(Shape):

            value: int

        assert Temporary.from_json(b'{"value":1}').value == 1
        assert Temporary.fields() == ("value",) and Temporary.members()[0].name == "value"

        return weakref.ref(Temporary)

    reference = temporary()

    gc.collect()

    assert reference() is None

def test_shape_reads_buffers_without_mutating_them () -> None:

    raw = bytearray(b'{"email":"a","age":"31"}')
    before = bytes(raw)

    for payload in (raw, memoryview(raw), before, before.decode()):

        assert validator.shape(Signup, payload).age == 31 and bytes(raw) == before

    assert validator.schema(int) == { "type": "integer" }


def test_shape_accepts_strided_memory_without_mutating_input () -> None:

    raw = b'{"email":"a","age":31}'
    interleaved = bytearray(len(raw) * 2)

    interleaved[::2] = raw

    assert validator.shape(Signup, memoryview(interleaved)[::2]).age == 31
    assert interleaved[::2] == raw

@pytest.mark.parametrize(("rule", "value"), [("alpha", "abc\n"), ("alpha_num", "abc1\n"), ("alpha_dash", "a_b\n"), ("key", "abc\n"), ("numeric", "42\n")])
def test_whole_value_rules_refuse_trailing_newlines ( rule: str, value: str ) -> None:

    with pytest.raises(Fault): rules.check({ "value": value }, { "value": rule })

def test_rule_sequences_preserve_regex_alternation () -> None:

    spec = { "value": ["required", "regex:(?:left|right)"] }

    assert rules.check({ "value": "left" }, spec) == { "value": "left" }
    assert rules.check({ "value": "right" }, spec) == { "value": "right" }

    with pytest.raises(Fault): rules.check({ "value": "other" }, spec)

@pytest.mark.parametrize("rule", ["boolean", "accepted", "declined"])
@pytest.mark.parametrize("value", [[], {}, ["yes"], {"yes": True}])
def test_unhashable_values_are_validation_failures ( rule: str, value: object ) -> None:

    with pytest.raises(Fault) as caught: Rules().check({"value": value}, {"value": rule})

    assert caught.value.code is Code.VALIDATION

def test_confirmation_is_bound_to_its_own_field () -> None:

    with pytest.raises(Fault) as caught:

        Rules().check(
            {"a": "one", "a_confirmation": "two", "b": "two", "b_confirmation": "one"},
            {"a": "required|confirmed", "b": "required|confirmed"},
        )

    assert caught.value.errors is not None and set(caught.value.errors) == {"a", "b"}

def test_confirmation_accepts_an_explicit_field () -> None:

    assert Rules().check({"value": "one", "repeat": "one"}, {"value": "confirmed:repeat"}) == {"value": "one"}

def test_conditions_accept_structured_other_values () -> None:

    with pytest.raises(Fault) as caught: Rules().check({"other": {"a": 1}}, {"other": "map", "value": "required_with:other"})

    assert caught.value.errors == {"value": ["is required"]}

@pytest.mark.parametrize("value", [None, "", [], {}])
def test_required_wins_over_nullable ( value: object ) -> None:

    with pytest.raises(Fault) as caught: Rules().check({"value": value}, {"value": "required|nullable"})

    assert caught.value.errors == {"value": ["is required"]}

def test_excluded_fields_are_not_validated_or_retained () -> None:

    assert Rules().check({"value": "invalid"}, {"value": "exclude|integer"}) == {}
    assert Rules().check({"value": None}, {"value": "nullable|exclude"}) == {}
    assert Rules().check({"mode": "skip", "value": []}, {"mode": "string", "value": "exclude_if:mode,skip|integer"}) == {"mode": "skip"}

def test_nested_wildcards_validate_the_actual_leaf () -> None:

    spec = {"groups.*.items.*.id": "required|integer"}
    valid = {"groups": [{"items": [{"id": 1}, {"id": 2}]}, {"items": [{"id": 3}]}]}

    assert Rules().check(valid, spec) == valid

    with pytest.raises(Fault) as caught:

        Rules().check({"groups": [{"items": [{"id": 1}, {"id": "bad"}]}]}, spec)

    assert caught.value.errors == {"groups.0.items.1.id": ["must be an integer"]}

def test_nested_output_rejects_undeclared_keys_and_is_detached () -> None:

    rulebook = Rules()
    payload = {"author": {"name": "Ann"}}
    kept = rulebook.check(payload, {"author.name": "required|string"})

    kept["author"]["name"] = "Changed"

    assert payload["author"]["name"] == "Ann"

    with pytest.raises(Fault) as caught:

        rulebook.check({"author": {"name": "Ann", "admin": True}}, {"author.name": "required|string"})

    assert caught.value.errors == {"author.admin": ["is not allowed"]}

def test_shape_copy_and_fill_validate_types_and_do_not_mutate () -> None:

    item = Signup(email="a", tags=["x"])

    with pytest.raises(Fault): item.copy(age="bad")
    with pytest.raises(Fault): Account(name="Ann").fill(name=[])

    assert item.age == 18 and item.tags == ["x"]
    assert item.copy(age="21").age == 21

class HiddenChild(Shape, rename="camel"):

    hidden: ClassVar[tuple[str, ...]] = ("secret_key",)
    secret_key: str
    name: str

class HiddenParent(Shape):

    user: HiddenChild

def test_hidden_fields_apply_to_nested_shapes_and_renamed_fields () -> None:

    assert HiddenParent(user=HiddenChild(secret_key="hidden", name="Ann")).dump() == {"user": {"name": "Ann"}}

@pytest.mark.parametrize("rule", ["number", "numeric"])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_numeric_rules_refuse_non_finite_values ( rule: str, value: float ) -> None:

    with pytest.raises(Fault): Rules().check({"value": value}, {"value": rule})

def test_prepared_rules_are_reusable_snapshots_and_cache_is_bounded () -> None:

    book = Rules(cache=2)
    spec = {"v": "required|integer"}
    plan = book.prepare(spec)

    assert book.prepare(spec) is plan and book.compile(spec) is plan.fields
    assert plan.check({"v": 1}) == book.check({"v": 1}, plan) == {"v": 1}

    spec["v"] = "string"

    assert book.prepare(spec) is not plan and plan.check({"v": 2}) == {"v": 2}

    with pytest.raises(Fault): book.check({"v": 2}, spec)

    book.prepare({"x": "string"})

    assert book.prepare({"v": "required|integer"}) is not plan
    assert Rules(cache=0).prepare({}) is not Rules(cache=0).prepare({})

def test_registration_invalidates_cache_but_preserves_prepared_contract () -> None:

    book = Rules()
    book.register("custom", lambda v, _: None if v == 1 else "needs one")
    old = book.prepare({"v": "custom"})
    book.register("custom", lambda v, _, __: None if v == 2 else "needs two")
    new = book.prepare({"v": "custom"})

    assert old.check({"v": 1}) == {"v": 1} and new.check({"v": 2}) == {"v": 2}

    with pytest.raises(Fault): old.check({"v": 2})
    with pytest.raises(Fault): new.check({"v": 1})

def test_prepared_rules_support_concurrent_independent_calls () -> None:

    book = Rules()
    plan = book.prepare({"value": "required|integer", "items.*.id": "required|integer"})

    def call ( value: int ) -> dict[str, Any]:

        payload: dict[str, Any] = {"value": value, "items": [{"id": value}]}
        result = plan.check(payload)

        result["items"][0]["id"] = -1

        assert payload["items"][0]["id"] == value

        return result

    with ThreadPoolExecutor(max_workers=4) as pool: results = list(pool.map(call, range(64)))

    assert [result["value"] for result in results] == list(range(64))

def test_wildcard_confirmation_is_scoped_and_not_returned () -> None:

    plan = Rules().prepare({"users.*.code": "required|confirmed"})
    payload = {"users": [{"code": "a", "code_confirmation": "a"}, {"code": "b", "code_confirmation": "b"}]}

    assert plan.check(payload) == {"users": [{"code": "a"}, {"code": "b"}]}
    assert "code_confirmation" in payload["users"][0]
    payload["users"][1]["code_confirmation"] = "a"

    with pytest.raises(Fault) as caught: plan.check(payload)

    assert caught.value.errors == {"users.1.code": ["must be confirmed"]}

def test_nested_exclusion_is_order_independent_and_preserves_input () -> None:

    payload: dict[str, Any] = {"user": {"name": "Ann", "private": {"number": "bad"}}}

    for spec in (
        {"user.private.number": "required|integer", "user.private": "exclude", "user.name": "string"},
        {"user.private": "exclude", "user.name": "string", "user.private.number": "required|integer"},
    ):

        assert Rules().check(payload, spec) == {"user": {"name": "Ann"}}

    assert payload["user"]["private"]["number"] == "bad"

def test_conditional_rules_accept_several_comparison_values () -> None:

    with pytest.raises(Fault): Rules().check({"mode": "b"}, {"mode": "string", "value": "required_if:mode,a,b"})
    assert Rules().check({"mode": "c"}, {"mode": "string", "value": "required_if:mode,a,b"}) == {"mode": "c"}

def test_mapping_inputs_and_shape_strictness_are_explicit () -> None:

    class Strict(Shape):

        strict: ClassVar[bool] = True
        count: int

    assert Rules().check(MappingProxyType({"v": 2}), {"v": "integer"}) == {"v": 2}

    with pytest.raises(Fault): Strict.from_mapping({"count": "2"})
    with pytest.raises(Fault): Strict.from_json(b'{"count":"2"}')

    assert Strict.from_json(b'{"count":2}').count == 2
    assert Signup.from_mapping({"email": "a", "age": "2"}).age == 2

def test_shape_copy_validates_nested_values_and_is_independent () -> None:

    item = Signup(email="a", tags=["old"])
    changed = item.copy(tags=["new"])

    changed.tags.append("extra")

    assert item.tags == ["old"]

    with pytest.raises(Fault): HiddenParent(user=HiddenChild(secret_key="s", name="a")).copy(user={"secretKey": "s", "name": 2})
    with pytest.raises(Fault): item.copy(missing=1)

@pytest.mark.parametrize("rule", ["min:bad", "size:nan", "between:9,1", "digits:-1", "digits:1.5", "digits:2.0", "decimal:2,1", "regex:[", "required_if:x"])
def test_malformed_rules_fail_during_preparation ( rule: str ) -> None:

    with pytest.raises(Fault) as caught: Rules().prepare({"v": rule})

    assert caught.value.code is Code.INTERNAL

@pytest.mark.parametrize("options", [{"cache": -1}, {"cache": True}, {"limit": 0}, {"limit": False}])
def test_rule_limits_are_validated ( options: dict[str, Any] ) -> None:

    with pytest.raises(Fault): Rules(**options)

def test_wildcard_work_is_bounded () -> None:

    plan = Rules(limit=4).prepare({"items.*": "integer"})

    assert plan.check({"items": [1, 2, 3, 4]}) == {"items": [1, 2, 3, 4]}

    with pytest.raises(Fault) as caught: plan.check({"items": [1, 2, 3, 4, 5]})

    assert caught.value.reason == "validate.limit"

def test_custom_checks_reject_async_or_invalid_results () -> None:

    book = Rules()

    async def asynchronous ( _: Any, __: str ) -> str | None:

        return None

    with pytest.raises(Fault): book.register("async", cast("Any", asynchronous))

    book.register("invalid", cast("Any", lambda _, __: 1))

    with pytest.raises(Fault) as caught: book.check({"value": "x"}, {"value": "invalid"})

    assert caught.value.reason == "validate.check"

def test_nested_container_shape_is_enforced () -> None:

    with pytest.raises(Fault): Rules().check({"user": 1}, {"user.name": "string"})
    with pytest.raises(Fault): Rules().check({"items": {"id": 1}}, {"items.*.id": "integer"})

def test_invalid_input_and_spec_are_typed_faults () -> None:

    with pytest.raises(Fault): Rules().check(cast("Any", []), {"v": "string"})
    with pytest.raises(Fault): Rules().prepare(cast("Any", 1))
    with pytest.raises(Fault): Rules().prepare(cast("Any", {"v": [1]}))

def test_hidden_fields_are_not_exposed_by_incorrect_runtime_annotations () -> None:

    class Loose(Shape):

        values: list[str]

    secret = HiddenChild(secret_key="hidden", name="Ann")
    value = Loose(values=cast("Any", [secret]))

    assert value.dump() == {"values": [{"name": "Ann"}]}

def test_numeric_bounds_preserve_large_integer_precision () -> None:

    limit = 2 ** 53 + 1

    with pytest.raises(Fault): Rules().check({"value": limit - 1}, {"value": f"min:{limit}"})
    with pytest.raises(Fault): Rules().check({"value": limit + 1}, {"value": f"max:{limit}"})

    assert Rules().check({"value": limit}, {"value": f"size:{limit}"}) == {"value": limit}

def test_multiple_of_is_exact_and_independent_of_decimal_context () -> None:

    value = 3 * 10 ** 60

    with localcontext() as context:

        context.prec = 2

        assert Rules().check({"value": value}, {"value": "multiple_of:3"}) == {"value": value}

        with pytest.raises(Fault): Rules().check({"value": value + 1}, {"value": "multiple_of:3"})

def test_numeric_rules_reject_unbounded_exponents () -> None:

    with pytest.raises(Fault): Rules().prepare({"value": "min:1e999999999"})
    with pytest.raises(Fault): Rules().check({"value": "1e999999999"}, {"value": "multiple_of:3"})

def test_copy_refuses_unsupported_objects_with_a_typed_fault () -> None:

    with pytest.raises(Fault) as caught: Signup(email="a").copy(age=object())

    assert caught.value.reason == "validate.shape"

def test_hidden_shapes_inside_dataclasses_are_redacted () -> None:

    @dataclass
    class Record:

        child: HiddenChild

    class Container(Shape):

        value: Any

    source = Container(value=Record(HiddenChild(name="Ann", secret_key="hidden")))

    assert source.dump() == {"value": {"child": {"name": "Ann"}}}

def test_excluded_wildcard_parents_do_not_validate_their_children () -> None:

    book = Rules()
    payload = {"items": [1, {"id": "invalid", "extra": True}]}

    for spec in (
        {"items.*": "exclude", "items.*.id": "required|integer"},
        {"items.*.id": "exclude_if:drop,true", "items.*": "exclude", "drop": "boolean"},
    ):

        given = {**payload, "drop": True} if "drop" in spec else payload

        assert book.check(given, spec) == ({"items": [], "drop": True} if "drop" in spec else {"items": []})

    assert payload == {"items": [1, {"id": "invalid", "extra": True}]}

def test_custom_value_checks_are_not_overridden_by_preparation () -> None:

    book = Rules()
    previous = book.prepare({"value": "min:2"})
    book.register("min", lambda value, argument: None if value == argument else "custom")
    book.register("regex", lambda value, argument: None if value == argument else "custom")

    assert book.check({"value": "word"}, {"value": "min:word"}) == {"value": "word"}
    assert book.check({"value": "["}, {"value": "regex:["}) == {"value": "["}

    with pytest.raises(Fault): previous.check({"value": 1})

def test_partial_plan_checks_supplied_values_and_keeps_full_plan () -> None:

    full = Rules().prepare({"name": "required|string", "age": "required|integer", "meta.label": "required|string"})
    patch = full.partial()

    assert patch.check({}) == {}
    assert patch.check({"age": 21}) == {"age": 21}
    assert patch.check({"meta": {}}) == {"meta": {}}
    assert patch.errors({"age": None}) == {"age": ["is required"]}
    assert patch.errors({"meta": {"label": 1}}) == {"meta.label": ["must be a string"]}

    with pytest.raises(Fault): full.check({"age": 21})
    with pytest.raises(Fault): patch.check({"other": True})

def test_errors_and_valid_share_rules_without_hiding_configuration_faults () -> None:

    book = Rules()
    plan = book.prepare({"items.*.id": "required|integer"})

    assert plan.errors({"items": [{"id": "wrong"}]}) == {"items.0.id": ["must be an integer"]}
    assert not plan.valid({"items": [{"id": "wrong"}]})
    assert plan.valid({"items": [{"id": 2}]})
    assert book.errors({"items": [{"id": 2}]}, plan) == {}
    assert book.valid({"items": [{"id": 2}]}, {"items.*.id": "required|integer"})

    with pytest.raises(Fault): book.valid({}, {"x": "unknown_rule"})
    with pytest.raises(Fault): plan.errors(cast("Any", []))

    book.register("broken", cast("Any", lambda _, __: 2))

    with pytest.raises(Fault): book.valid({"x": 1}, {"x": "broken"})

def test_diagnostic_checks_do_not_clone_values () -> None:

    class Tracked(dict[str, int]):

        def __deepcopy__ ( self, _: dict[int, Any] ) -> Tracked:

            raise RuntimeError("must not copy for diagnostics")

    plan = Rules().prepare({"data": "required|map"})
    payload = {"data": Tracked(value=1)}

    assert plan.valid(payload) and plan.errors(payload) == {}

def test_grouped_fields_preserve_nested_failure_paths_and_input () -> None:

    plan = Rules().prepare({
        "rows.*.id": "required|integer", "rows.*.name": "required|string",
        "rows.*.tags.*": "required|string",
    })
    payload = {"rows": [{"id": 1, "name": "Ann", "tags": ["x"]}, {"id": "bad", "name": 2, "tags": ["y", 3]}]}

    assert plan.errors(payload) == {
        "rows.1.id": ["must be an integer"], "rows.1.name": ["must be a string"],
        "rows.1.tags.1": ["must be a string"],
    }
    payload["rows"][1] = {"id": 2, "name": "Ben", "tags": ["y"]}
    copied = plan.check(payload)
    copied["rows"][0]["tags"].append("z")

    assert payload["rows"][0]["tags"] == ["x"]

def test_grouped_paths_cover_missing_numeric_and_mapping_parents () -> None:

    plan = Rules().prepare({"root.items.0.a": "required|integer", "root.items.0.b": "required|string"})

    assert plan.errors({}) == {"root.items.0.a": ["is required"], "root.items.0.b": ["is required"]}
    assert plan.check({"root": {"items": [{"a": 1, "b": "x"}]}}) == {"root": {"items": [{"a": 1, "b": "x"}]}}

    source = MappingProxyType({"root": {"items": [{"a": 1, "b": "x"}]}})

    assert plan.check(source) == dict(source)

def test_copy_preserves_renames_hidden_values_and_detaches_unchanged_containers () -> None:

    source = Signup(email="a", tags=["x"])
    copied = source.copy(age="21")
    copied.tags.append("y")

    assert source.tags == ["x"] and copied.age == 21

    renamed = HiddenChild(secret_key="s", name="Ann").copy(name="Ben")

    assert renamed.name == "Ben" and renamed.secret_key == "s" and renamed.dump() == {"name": "Ben"}
    changes = ["fresh"]
    copied = source.copy(tags=changes)
    changes.append("outside")

    assert copied.tags == ["fresh"]

def test_copy_revalidates_existing_invalid_fields () -> None:

    invalid = Signup(email="a", age=cast("Any", "bad"))

    with pytest.raises(Fault): invalid.copy(email="b")

def test_custom_checks_keep_declared_field_execution_order () -> None:

    calls: list[int] = []
    book = Rules()

    def track ( value: Any, _: str ) -> None:

        calls.append(value)

    book.register("track", track)
    plan = book.prepare({"items.*.a": "track", "items.*.b": "track"})
    plan.check({"items": [{"a": 1, "b": 2}, {"a": 3, "b": 4}]})

    assert calls == [1, 3, 2, 4]

def test_prepared_results_preserve_shared_values_without_sharing_with_input () -> None:

    shared = {"x": [1]}
    source = {"a": shared, "b": shared}
    copied = Rules().check(source, {"a": "map", "b": "map"})

    assert copied["a"] is copied["b"] and copied["a"] is not shared
    copied["a"]["x"].append(2)

    assert shared == {"x": [1]}
