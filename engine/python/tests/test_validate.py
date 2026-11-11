from engine.error import Code, Fault
from engine.validate import Resource, Shape, field, rules, validator
from typing import Any, override
from typing import ClassVar
import pytest

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
