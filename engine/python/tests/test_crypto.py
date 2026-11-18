from engine.rand import rand
from argon2 import PasswordHasher, Type
from cryptography.hazmat.primitives.ciphers.aead import AESGCM, AESGCMSIV, ChaCha20Poly1305
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from engine.crypto import Crypto, Hasher, Key, Pair, Sealed, crypto
from engine.error import Code, Fault
from typing import Any
import base64, hashlib, hmac, importlib, pytest

RFC    = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
HEAVY  = "$argon2id$v=19$m=4194304,t=64,p=1$c29tZXNhbHQ$" + "A" * 43
SPANS: tuple[Any, ...]   = (0, -1, 8161, 10 ** 6, True, 1.5, "32")
NAMES: tuple[Any, ...]   = ("md4000", "", "shake_128", "shake_256", "SHAKE_128", None)
WINDOWS: tuple[Any, ...] = (-1, 11, 10 ** 7, 1.0, True, None)
PACES: tuple[tuple[Any, Any, Any], ...] = (
    (59, 5, 30), (59, 9, 30), (59, 0, 30), (59, -1, 30), (59, 5000, 30), (59, 6.0, 30), (59, True, 30), (59, 6, 0), (59, 6, -30), (59, 6, 3601),
    (59, 6, 30.0), (59, 6, True), (float("nan"), 6, 30), (float("inf"), 6, 30), (-float("inf"), 6, 30), (-1, 6, 30), (-0.001, 6, 30),
    (2 ** 63 * 30, 6, 30), (10 ** 40, 6, 30),
)
COSTS: tuple[tuple[Any, Any, Any], ...] = (
    (0, 0, 0), (0, 8, 1), (1, 7, 1), (1, 8, 2), (1, 8, 0), (17, 8, 1), (1, 1048577, 1), (1, 8192, 17), (1.0, 8, 1), (1, True, 1), (1, 8, None),
)

def test_seals_open_and_rotate () -> None:

    first  = crypto.key("k1")
    second = crypto.key("k2")

    crypto.setup([first])

    sealed = crypto.seal("hello", b"ctx")

    assert sealed.startswith("v2.0.k1.") and crypto.open_text(sealed, b"ctx") == "hello" and not crypto.stale(sealed)
    assert crypto.open(crypto.seal(b"\x00\x01")) == b"\x00\x01" and crypto.open(crypto.seal("")) == b""
    assert crypto.ready() and crypto.current() is first and crypto.names() == ("k1",) and crypto.describe()["current"] == "k1"
    assert crypto.seal("hello", b"ctx") != sealed and Sealed.decode(sealed).encode() == sealed

    with pytest.raises(Fault) as tampered: crypto.open(sealed[:-2] + "zz", b"ctx")

    assert tampered.value.reason == "crypto.tampered" and tampered.value.code is Code.BAD_REQUEST

    with pytest.raises(Fault) as aad: crypto.open(sealed, b"other")

    assert aad.value.reason == "crypto.tampered"

    crypto.setup([second, first], current="k2")

    assert crypto.stale(sealed) and crypto.rotate(sealed, b"ctx").startswith("v2.0.k2.") and crypto.names() == ("k1", "k2")
    assert crypto.open_text(crypto.rotate(sealed, b"ctx"), b"ctx") == "hello" and crypto.current() is second

    for wrong, reason in (([], "crypto.keys"), ([first, first], "crypto.keys"), ([first], "crypto.current")):

        with pytest.raises(Fault) as refused: crypto.setup(wrong, current="nope")

        assert refused.value.reason == reason and crypto.current() is second and crypto.open_text(sealed, b"ctx") == "hello"

    crypto.setup([second])

    with pytest.raises(Fault) as unknown: crypto.open(sealed, b"ctx")

    assert unknown.value.reason == "crypto.unknown_key"

    fresh = crypto.seal(b"\x01")
    head  = fresh.rpartition(".")[0]
    body  = fresh.rpartition(".")[2]
    loose = body[:-1] + chr(ord(body[-1]) + 1)
    wild  = (
        "", "garbage", "v9.k.aaaa", "v1.k.aa", f"{fresh}!", f"{fresh}=", f"{fresh} ", f"{head}.{body[:5]}!{body[5:]}", f"{head}.{loose}",
        f"{head}.{body}\n", f"v1..{body}", f"v1.k 2.{body}", f"v1.{'k' * 65}.{body}", f"{head}.{body}\ud800", f"{head}.{body}é",
        f"V1.k2.{body}", f"{head}.+{body[1:]}", f"{head}./{body[1:]}", f"{head}.{body}A",
    )

    assert base64.urlsafe_b64decode(loose + "=" * (-len(loose) % 4)) == base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))

    for bad in wild:

        with pytest.raises(Fault) as broken: crypto.open(bad)

        assert broken.value.code is Code.BAD_REQUEST and broken.value.reason in ("crypto.sealed", "crypto.tampered"), bad

        if bad != f"{head}.{body}A":

            with pytest.raises(Fault) as stale: crypto.stale(bad)

            assert stale.value.reason == "crypto.sealed", bad

    with pytest.raises(Fault) as text: crypto.open_text(crypto.seal(b"\xff\xfe"))

    assert text.value.reason == "crypto.encoding" and text.value.code is Code.BAD_REQUEST

    with pytest.raises(Fault) as lone: crypto.seal("a\ud800")

    assert lone.value.reason == "crypto.encoding"

    for name in ("", "k:1", "k 1", ".k", "-k", "k" * 65, "ك"):

        with pytest.raises(Fault) as named: Key(name, bytes(32))

        assert named.value.reason == "crypto.key" and named.value.code is Code.INTERNAL, name

    for size in (0, 16, 31, 33, 64):

        with pytest.raises(Fault) as sized: Key("k", bytes(size))

        assert sized.value.reason == "crypto.key"

    assert Key("k" * 64, bytes(32)).id == "k" * 64 and Key("A.b_c-9", bytes(32)).id == "A.b_c-9"
    assert "secret" not in repr(first) and first.secret.hex() not in repr(first) and repr(first) == "Key(id='k1')"

    with pytest.raises(Fault): Crypto().setup([])
    with pytest.raises(Fault): Crypto().setup([first], current="nope")
    with pytest.raises(Fault) as unset: Crypto().current()

    assert unset.value.reason == "crypto.setup" and not Crypto().ready() and Crypto().stale(fresh)

    for work in (lambda: Crypto().seal("x"), lambda: Crypto().seal_bytes(b"x"), lambda: Crypto().mac("x"), lambda: Crypto().derive("x")):

        with pytest.raises(Fault) as blank: work()

        assert blank.value.reason == "crypto.setup"

    exported = crypto.export_key(first)
    standard = base64.b64encode(first.secret).decode()

    assert crypto.parse_key(exported) == first and exported.startswith("k1:") and "=" not in exported
    assert crypto.parse_key(f"k1:{standard}") == first and crypto.parse_key(standard) == first and crypto.parse_key(f":{standard}") == first
    assert crypto.parse_key(f"old.2024:{standard.rstrip('=')}") == Key("old.2024", first.secret)

    for bad in ("k:%%%", "", "k1:", f"k1:{standard}=", f"k1:{standard[:-2]}", f"k1:{standard}!", f"k 1:{standard}", f"a:b:{standard}", f"k1:{standard}\n", f"k1:{standard[:20]} {standard[20:]}", "k1:" + base64.b64encode(bytes(31)).decode(), f"\ud800:{standard}"):

        with pytest.raises(Fault) as parsed: crypto.parse_key(bad)

        assert parsed.value.reason == "crypto.key" and parsed.value.errors is None, bad

def test_derived_keys_and_raw_seals () -> None:

    crypto.setup([crypto.key("k1")])

    blob = crypto.seal_bytes(b"\x00" * 1000, b"file")

    assert blob.startswith(b"E2\x00\x02k1") and crypto.open_bytes(blob, b"file") == b"\x00" * 1000 and len(blob) == 6 + 12 + 1000 + 16

    for bad in (b"", b"E1", b"E9" + blob[2:], b"E1\x02k1short", b"E1\x02zz" + b"\x00" * 40, blob[:-1] + bytes((blob[-1] ^ 1,)), b"E1\xff" + blob[3:], blob[:32]):

        with pytest.raises(Fault) as refused: crypto.open_bytes(bad, b"file")

        assert refused.value.code is Code.BAD_REQUEST and refused.value.reason in ("crypto.sealed", "crypto.unknown_key", "crypto.tampered")

    with pytest.raises(Fault) as bound: crypto.open_bytes(blob, b"other")

    assert bound.value.reason == "crypto.tampered"

    derived = crypto.hkdf("secret", "tokens")

    assert len(derived) == 32 and derived == crypto.hkdf(b"secret", b"tokens") and derived != crypto.hkdf("secret", "other")
    assert len(crypto.hkdf("s", "i", 64)) == 64 and crypto.hkdf("s", "i", 64)[:32] == crypto.hkdf("s", "i") and len(crypto.hkdf("s", "i", 8160)) == 8160
    assert crypto.hkdf("s", "i", salt=b"salt") != crypto.hkdf("s", "i") and len(crypto.hkdf("s", "i", 1)) == 1
    assert crypto.hkdf(bytes.fromhex("0b" * 22), bytes.fromhex("f0f1f2f3f4f5f6f7f8f9"), 42, bytes.fromhex("000102030405060708090a0b0c")).hex() == (
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
    )

    for length in SPANS:

        with pytest.raises(Fault) as long_: crypto.hkdf("s", "i", length)

        assert long_.value.reason == "crypto.length" and long_.value.code is Code.INTERNAL

    for secret, reason in (("", "crypto.secret"), (b"", "crypto.secret"), ("a\ud800", "crypto.encoding")):

        with pytest.raises(Fault) as weak: crypto.hkdf(secret, "i")

        assert weak.value.reason == reason

    files = crypto.derive("files")
    vault = Crypto()

    vault.setup([files, crypto.current()])

    sealed = vault.seal("report", b"aad")

    assert files.id == "k1.files" and sealed.startswith("v2.0.k1.files.") and vault.open_text(sealed, b"aad") == "report" and not vault.stale(sealed)
    assert vault.open_bytes(vault.seal_bytes(b"frame")) == b"frame" and vault.seal_bytes(b"frame").startswith(b"E2\x00\x08k1.files")
    assert crypto.derive("sessions").id == "k1.sessions" and crypto.derive("files") == files and crypto.derive("x", "named").id == "named"
    assert files.secret == crypto.hkdf(crypto.current().secret, "files") and files.secret != crypto.derive("other").secret

    with pytest.raises(Fault) as outside: crypto.open(sealed, b"aad")

    assert outside.value.reason == "crypto.unknown_key"

    with pytest.raises(Fault) as odd: crypto.derive("bad info")

    assert odd.value.reason == "crypto.key"

def test_hashes_and_signatures () -> None:

    crypto.setup([crypto.key("k1")])

    assert crypto.hash("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" and crypto.hash(b"abc") == crypto.hash("abc")
    assert crypto.hash("abc", "blake3") == "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85" and crypto.digest("abc") == crypto.hash("abc", "blake3")
    assert len(crypto.hash("abc", "sha512")) == 128 and crypto.hash("abc", "md5") == "900150983cd24fb0d6963f7d28e17f72"
    assert crypto.hash("abc", "sha1") == "a9993e364706816aba3e25717850c26c9cd0d89d" and crypto.hash("", "sha256").startswith("e3b0c442")
    assert crypto.verify("payload", crypto.sign("payload")) and not crypto.verify("payload", "00" * 32)
    assert crypto.verify("payload", crypto.sign("payload", "shared"), "shared") and not crypto.verify("payload", crypto.sign("payload", "shared"), "other")
    assert not crypto.verify("payload", "") and not crypto.verify("payload", "é" * 64) and not crypto.verify("payload", "\ud800")
    assert not crypto.verify("payload", crypto.sign("payload").upper()) and not crypto.verify("payloae", crypto.sign("payload"))

    for name in ("blake3", "sha256", "sha1", "md5", "blake2b"):

        stream = crypto.hasher(name)

        stream.update(b"ab")
        stream.update(b"c")

        assert stream.hexdigest() == crypto.hash("abc", name)

    for wrong in NAMES:

        with pytest.raises(Fault) as bad: crypto.hash("x", wrong)

        assert bad.value.reason == "crypto.algorithm" and bad.value.code is Code.INTERNAL

        with pytest.raises(Fault) as stream_: crypto.hasher(wrong)

        assert stream_.value.reason == "crypto.algorithm"

    asked = "what do ya want for nothing?"

    assert crypto.mac(asked, "Jefe").hex() == "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    assert crypto.mac(asked.encode(), b"Jefe", "sha512").hex().startswith("164b7a7bfcf819e2e395fbe73b56e0a3")
    assert len(crypto.mac(asked, "Jefe", "sha384")) == 48 and crypto.mac("payload").hex() == crypto.sign("payload")
    assert crypto.mac("payload", "one") != crypto.mac("payload", "two") and crypto.mac("payload") == crypto.mac("payload", crypto.current().secret)

    for wrong in ("md4000", "", "shake_128"):

        with pytest.raises(Fault) as refused: crypto.mac("x", "k", wrong)

        assert refused.value.reason == "crypto.algorithm"

    for empty in ("", b""):

        with pytest.raises(Fault) as keyless: crypto.mac("x", empty)

        assert keyless.value.reason == "crypto.secret" and keyless.value.code is Code.INTERNAL

        with pytest.raises(Fault): crypto.verify("x", crypto.sign("x", "k"), empty)

    for work in (lambda: crypto.hash("a\ud800"), lambda: crypto.mac("a\ud800", "k"), lambda: crypto.mac("a", "k\ud800"), lambda: crypto.crc32("\ud800"), lambda: crypto.fingerprint("a", "\ud800"), lambda: crypto.attest("\ud800", bytes(32))):

        with pytest.raises(Fault) as lone: work()

        assert lone.value.reason == "crypto.encoding" and lone.value.code is Code.BAD_REQUEST

    assert crypto.fingerprint("ua", "ip") == crypto.fingerprint("ua", "ip") and len(crypto.fingerprint("x")) == 32
    assert crypto.fingerprint("ua", "ip") == crypto.hash(b"\x00\x00\x00\x02ua\x00\x00\x00\x02ip", "blake3")[:32]
    assert len({ crypto.fingerprint(*parts) for parts in (("a|b", "c"), ("a", "b|c"), ("ab", "c"), ("a", "bc"), ("abc",), ("abc", ""), ("", "abc"), (), ("",)) }) == 9
    assert crypto.crc32("hello") == 907060870 and crypto.crc32(b"hello") == 907060870 and crypto.crc32("") == 0

    pair = crypto.keypair()

    assert pair == Pair(pair.public, pair.private) and len(pair.public) == 32 and len(pair.private) == 32
    assert pair.dump() == { "public": base64.urlsafe_b64encode(pair.public).decode().rstrip("=") } and pair.private.hex() not in repr(pair) and "private" not in repr(pair)

    signature = crypto.attest("payload", pair.private)

    assert crypto.attested("payload", signature, pair.public) and not crypto.attested("other", signature, pair.public) and len(signature) == 86
    assert crypto.attested(b"payload", signature, pair.public) and crypto.attest(b"payload", pair.private) == signature
    assert not crypto.attested("payload", "bad", pair.public) and not crypto.attested("payload", signature, crypto.keypair().public)
    assert not crypto.attested("payload", signature, b"short") and not crypto.attested("payload", "", pair.public)

    for bent in (f"{signature}==", f"{signature}!", f" {signature}", f"{signature}\n", signature[:-1] + "B", signature[:40] + "é" + signature[41:], f"{signature}\ud800", signature.replace("-", "+").replace("_", "/") if "-" in signature or "_" in signature else f"+{signature[1:]}"):

        assert bent == signature or not crypto.attested("payload", bent, pair.public), bent

    with pytest.raises(Fault) as short: crypto.attest("x", b"short")

    assert short.value.reason == "crypto.private"

def test_totp_follows_the_rfc_and_its_bounds () -> None:

    secret = crypto.totp_secret()

    assert len(secret) == 32 and secret != crypto.totp_secret() and len(base64.b32decode(secret)) == 20
    assert crypto.totp(RFC, at=59) == "287082" and crypto.totp(RFC, at=59, digits=8) == "94287082" and crypto.totp(RFC, at=1111111109) == "081804"
    assert crypto.totp(RFC, at=1111111111, digits=8) == "14050471" and crypto.totp(RFC, at=1234567890, digits=8) == "89005924"
    assert crypto.totp(RFC, at=2000000000, digits=8) == "69279037" and crypto.totp(RFC, at=20000000000, digits=8) == "65353130"
    assert crypto.totp(RFC, at=0) == crypto.totp(RFC, at=29.9) != crypto.totp(RFC, at=30) and crypto.totp(RFC, at=59, digits=7) == "4287082"
    assert crypto.totp(RFC.lower(), at=59) == "287082" and crypto.totp(" gezd gnbv gy3t qojq gezd gnbv gy3t qojq\n", at=59) == "287082"
    assert crypto.totp(RFC, at=59, step=60) == crypto.totp(RFC, at=0, step=60) and crypto.totp(RFC, at=3600, step=3600) == crypto.totp(RFC, at=30)
    assert len(crypto.totp(secret)) == 6 and crypto.totp(secret).isdigit() and crypto.totp_verify(secret, crypto.totp(secret))

    code = crypto.totp(secret, at=1000)

    assert crypto.totp_verify(secret, code, at=1000) and crypto.totp_verify(secret, code, at=1029) and crypto.totp_verify(secret, code, at=960)
    assert not crypto.totp_verify(secret, code, at=1100) and not crypto.totp_verify(secret, code, at=1029, window=0)
    assert crypto.totp_match(secret, code, at=1000) == 33 and crypto.totp_match(secret, code, at=1029) == 33 and crypto.totp_match(secret, code, at=1050, window=0) is None
    assert crypto.totp_match(secret, crypto.totp(secret, at=1030), at=1000) == 34 and crypto.totp_match(secret, crypto.totp(secret, at=0), at=0) == 0
    assert crypto.totp_match(secret, crypto.totp(secret, at=1300), at=1000, window=10) == 43 and crypto.totp_match(secret, crypto.totp(secret, at=1330), at=1000, window=10) is None
    assert crypto.totp_verify(secret, f" {code[:3]} {code[3:]}\n", at=1000) and crypto.totp_verify(secret, code.translate(str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")), at=1000)
    assert crypto.totp_verify(secret, code.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")), at=1000)

    wrong = next(guess for guess in ("000000", "111111", "222222", "333333") if guess not in { crypto.totp(secret, at=moment) for moment in (970, 1000, 1030) })

    for bad in (wrong, "", code[:5], f"{code}0", f"0{code}", "abcdef", "\u00b2\u00b3\u00b9\u00b2\u00b3\u00b9", code[:5] + "x", "\ud800", f"{code}{' ' * 512}"):

        assert not crypto.totp_verify(secret, bad, at=1000), bad

    for weak in ("", "A", "GEZDGNBV", "GEZDGNBVGY3TQOJ", "not base32!!", "GEZDGNBVGY3TQOJQ=A", "GEZDGNBVGY3TQOJ1", "\ud800" * 16, "\u00e9" * 16, "A" * 513, "GEZDGNBVGY3TQOJQ" * 13, "\u0131" * 16, "GEZDGNBVGY3TQOJ\u017f", "GEZDGNBVGY3TQOJQ" + " " * 497):

        for work in (lambda weak=weak: crypto.totp(weak), lambda weak=weak: crypto.totp_verify(weak, "000000"), lambda weak=weak: crypto.totp_uri(weak, "a", "b")):

            with pytest.raises(Fault) as broken: work()

            assert broken.value.reason == "crypto.secret" and broken.value.code is Code.BAD_REQUEST, weak

    assert crypto.totp("GEZDGNBVGY3TQOJQ", at=59).isdigit() and len(crypto.totp("GEZDGNBVGY3TQOJQ" * 12 + "GEZDGNBV", at=59)) == 6

    for at, digits, step in PACES:

        with pytest.raises(Fault) as paced: crypto.totp(RFC, at, digits, step)

        assert paced.value.reason == "crypto.totp" and paced.value.code is Code.INTERNAL, (at, digits, step)

    assert len(crypto.totp(RFC, at=(2 ** 63 - 1) * 30, digits=8)) == 8 and not crypto.totp_verify(RFC, "000000", at=-10 ** 6, window=10)
    assert crypto.totp_verify(RFC, crypto.totp(RFC, at=0), at=-30) and not crypto.totp_verify(RFC, crypto.totp(RFC, at=0), at=-60)
    assert crypto.totp_match(RFC, crypto.totp(RFC, at=(2 ** 63 - 1) * 30), at=2 ** 63 * 30) == 2 ** 63 - 1

    for window in WINDOWS:

        with pytest.raises(Fault) as wide: crypto.totp_verify(RFC, "000000", 59, window)

        assert wide.value.reason == "crypto.totp"

    for at, digits, step in ((float("nan"), 6, 30), (59, 9, 30), (59, 6, 0)):

        with pytest.raises(Fault) as checked: crypto.totp_verify(RFC, "000000", at, 1, digits, step)

        assert checked.value.reason == "crypto.totp"

    assert crypto.totp_uri(secret, "ali@x.com", "Acme") == f"otpauth://totp/Acme%3Aali%40x.com?secret={secret}&issuer=Acme&digits=6&period=30&algorithm=SHA1"
    assert crypto.totp_uri(f" {secret.lower()}====", "a&b=c:d/é", "My Co?", 8, 60) == f"otpauth://totp/My%20Co%3F%3Aa%26b%3Dc%3Ad%2F%C3%A9?secret={secret}&issuer=My%20Co%3F&digits=8&period=60&algorithm=SHA1"

    for account, issuer, digits, step, reason in (
        ("", "Acme", 6, 30, "crypto.totp"), ("ali", "", 6, 30, "crypto.totp"), ("ali", "Ac:me", 6, 30, "crypto.totp"), ("ali", "Acme", 9, 30, "crypto.totp"),
        ("ali", "Acme", 6, 0, "crypto.totp"), ("\ud800", "Acme", 6, 30, "crypto.encoding"), ("ali", "\ud800", 6, 30, "crypto.encoding"),
    ):

        with pytest.raises(Fault) as labelled: crypto.totp_uri(secret, account, issuer, digits, step)

        assert labelled.value.reason == reason, (account, issuer)

def test_slow_hashes_preserve_arbitrary_data_and_bound_encoded_costs () -> None:

    quick = crypto.options(time_cost=1, memory_cost=8192, parallelism=1)
    words = ("", "x", "café", "cafe\u0301", "\uff46", "a\x00b", "x" * 4096, b"\xff\x00")

    for plain in words:

        hashed = quick.hash(plain, "argon2id")

        assert hashed.startswith("$argon2id$v=19$m=8192,t=1,p=1$")
        assert quick.check(plain, hashed) and quick.check(plain, hashed, "argon2id")
        assert not quick.check("different", hashed) and not quick.rehash(hashed)
        assert quick.hash(plain, "argon2id") != hashed

    assert not quick.check("cafe\u0301", quick.hash("café", "argon2id"))
    assert not quick.check("f", quick.hash("\uff46", "argon2id"))
    assert quick.check(b"hello", quick.hash("hello", "argon2id"))

    for values in COSTS:

        with pytest.raises(Fault) as invalid: crypto.options(time_cost=values[0], memory_cost=values[1], parallelism=values[2])

        assert invalid.value.reason == "crypto.cost"

    malformed = (
        "", "junk", "lone\ud800", HEAVY,
        "$argon2id$v=19$m=1048576,t=1,p=1$c29tZXNhbHQ$" + "A" * 43,
        "$argon2id$v=19$m=8192,t=16,p=1$c29tZXNhbHQ$" + "A" * 43,
        "$argon2id$v=19$m=8192,t=1,p=16$c29tZXNhbHQ$" + "A" * 43,
        "$argon2id$v=19$m=8192,t=1,p=1$c29tZXNhbHQ$" + "A" * 600,
    )

    for hashed in malformed:

        assert not quick.check("x", hashed, "argon2id") and quick.rehash(hashed)

    for legacy in (Type.I, Type.D, Type.ID):

        hashed = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1, type=legacy).hash(b"legacy data")

        assert quick.check("legacy data", hashed) and quick.rehash(hashed) == (legacy is not Type.ID)

    default = crypto.hash("exact data", "argon2id")

    assert not crypto.rehash(default) and crypto.check("exact data", default)
    assert not quick.check("exact data", default) and quick.rehash(default)

@pytest.mark.parametrize(("algorithm", "factory", "index"), [
    ("aes-gcm", AESGCM, 0), ("chacha20-poly1305", ChaCha20Poly1305, 1), ("aes-gcm-siv", AESGCMSIV, 2),
])
def test_ciphers_interoperate_and_bind_the_header ( algorithm: str, factory: Any, index: int ) -> None:

    key   = Key("current", bytes(range(32)))
    vault = Crypto().options(cipher=algorithm)
    alias = Key("changed", key.secret)

    vault.setup([key, alias])

    for plain in (b"", b"x", "عربي", b"\x00\xff" * 65536):

        raw    = plain.encode() if isinstance(plain, str) else plain
        text   = vault.seal(plain, b"context")
        sealed = Sealed.decode(text)
        frame  = vault.seal_bytes(plain, b"context")
        header = b"E2" + bytes((index, len(key.id))) + key.id.encode()

        assert text.startswith(f"v2.{index}.current.")
        assert sealed.algorithm == algorithm and sealed.version == 2
        assert vault.open(text, b"context") == raw and vault.open_bytes(frame, b"context") == raw
        assert factory(key.secret).decrypt(sealed.nonce, sealed.body, header + b"context") == raw

        external = factory(key.secret).encrypt(bytes(12), raw, header + b"context")
        encoded  = base64.urlsafe_b64encode(bytes(12) + external).rstrip(b"=").decode()

        assert vault.open(f"v2.{index}.current.{encoded}", b"context") == raw
        assert vault.open_bytes(header + bytes(12) + external, b"context") == raw

        for corrupt in (text.replace(".current.", ".changed."), text[:-1] + ("A" if text[-1] != "A" else "B")):

            with pytest.raises(Fault): vault.open(corrupt, b"context")

        with pytest.raises(Fault): vault.open(text, b"different")
        with pytest.raises(Fault): vault.open_bytes(frame[:-1], b"context")
        with pytest.raises(Fault): vault.open_bytes(frame + b"x", b"context")

def test_legacy_ciphertexts_remain_readable_and_upgrade_explicitly () -> None:

    key   = Key("old.key", bytes(range(32)))
    vault = Crypto()

    vault.setup([key])

    nonce  = bytes(range(12))
    body   = AESGCM(key.secret).encrypt(nonce, b"legacy", b"bound")
    text   = "v1.old.key." + base64.urlsafe_b64encode(nonce + body).rstrip(b"=").decode()
    binary = b"E1" + bytes((len(key.id),)) + key.id.encode() + nonce + body

    assert vault.open(text, b"bound") == b"legacy" and vault.open_bytes(binary, b"bound") == b"legacy"
    assert Sealed.decode(text).encode() == text and vault.stale(text)
    assert vault.open(vault.rotate(text, b"bound"), b"bound") == b"legacy"
    assert vault.rotate(text, b"bound").startswith("v2.0.old.key.")

def test_options_are_isolated_and_input_limits_are_bytes () -> None:

    vault = Crypto()
    first = vault.key("first")

    vault.setup([first])

    tiny = vault.options(cipher="chacha20-poly1305", limit=8)

    assert vault.describe()["algorithm"] == "aes-gcm" and tiny.describe()["algorithm"] == "chacha20-poly1305"
    assert tiny.open(tiny.seal("é" * 4)) == ("é" * 4).encode()

    for plain in ("é" * 5, b"x" * 9, "x" * 9):

        for operation in (tiny.seal, tiny.seal_bytes, tiny.hash):

            with pytest.raises(Fault) as limited: operation(plain)

            assert limited.value.reason == "crypto.size"

    with pytest.raises(Fault): tiny.open(vault.seal(b"x" * 9))
    with pytest.raises(Fault): tiny.open_bytes(vault.seal_bytes(b"x" * 9))
    with pytest.raises(Fault): tiny.seal("ok", b"x" * 9)

    vault.setup([vault.key("second")])

    assert tiny.current() == first and vault.current().id == "second"

    for limit in (0, -1, True, 2 ** 31):

        with pytest.raises(Fault): vault.options(limit=limit)

    for algorithm in ("", "aes-cbc", "xor"):

        with pytest.raises(Fault): vault.options(cipher=algorithm)

def test_boundary_failures_are_typed_and_do_not_expand_fixed_inputs () -> None:

    vault = Crypto()

    vault.setup([vault.key("key")])

    inputs: tuple[Any, ...] = (None, 12, [], True)

    for value in inputs:

        for operation in (vault.hash, vault.seal, vault.seal_bytes):

            with pytest.raises(Fault) as refused: operation(value)

            assert refused.value.reason == "crypto.data"

        assert not vault.attested("x", value, bytes(32))
        assert not vault.check("x", value) and not vault.verify("x", value)

    for value in ("x" * 1000000, "k:" + "A" * 1000000):

        with pytest.raises(Fault) as invalid: vault.parse_key(value)

        assert invalid.value.reason == "crypto.key"
        assert not vault.attested("x", value, bytes(32))

    prior = vault.current()

    badkeys: tuple[Any, ...] = ([object()], [prior, prior], [], [prior] * 257)

    for keys in badkeys:

        with pytest.raises(Fault): vault.setup(keys)

        assert vault.current() == prior

def test_streaming_hashes_are_owned_and_copyable () -> None:

    for algorithm in ("sha256", "blake3", "sha512"):

        stream = crypto.hasher(algorithm)
        left   = stream.update("hello ").copy().update("left")
        right  = stream.update("right")

        assert isinstance(stream, Hasher)
        assert left.hexdigest() == crypto.hash("hello left", algorithm)
        assert right.hexdigest() == crypto.hash("hello right", algorithm)
        assert right.digest().hex() == right.hexdigest()
        assert right.hexdigest() == right.hexdigest()
        assert crypto.check("hello left", left.hexdigest(), algorithm)

    stream = crypto.options(limit=4).hasher("sha256")

    for _ in range(1000): stream.update(b"abcd")

    assert stream.hexdigest() == hashlib.sha256(b"abcd" * 1000).hexdigest()

    with pytest.raises(Fault): stream.update(b"abcde")

def test_key_rotation_publishes_one_snapshot_under_concurrency () -> None:

    vault = Crypto()
    left  = Key("left", b"a" * 32)
    right = Key("right", b"b" * 32)
    gate  = Barrier(3)

    vault.setup([left, right])

    def rotate () -> None:

        gate.wait()

        for index in range(400): vault.setup([left, right], "left" if index % 2 else "right")

    def consume () -> None:

        gate.wait()

        for _ in range(1000):

            assert vault.open(vault.seal(b"payload")) == b"payload"
            assert vault.open_bytes(vault.seal_bytes(b"payload")) == b"payload"

    with ThreadPoolExecutor(max_workers=3) as workers:

        futures = [workers.submit(rotate), workers.submit(consume), workers.submit(consume)]

        for future in futures: future.result(timeout=20)

def test_keyring_is_not_published_while_a_provider_is_still_constructing ( monkeypatch: pytest.MonkeyPatch ) -> None:

    vault = Crypto()
    first = Key("first", b"a" * 32)
    second = Key("second", b"b" * 32)
    entered, release = Event(), Event()
    module = importlib.import_module("engine.crypto.cipher")

    vault.setup([first])

    def delayed ( secret: bytes ) -> AESGCM:

        if secret == second.secret:

            entered.set()
            assert release.wait(5)

        return AESGCM(secret)

    monkeypatch.setattr(module, "AESGCM", delayed)

    with ThreadPoolExecutor(max_workers=1) as worker:

        pending = worker.submit(vault.setup, [second])

        try:

            assert entered.wait(5)
            assert vault.current() == first
            assert vault.open(vault.seal("during setup")) == b"during setup"

        finally: release.set()

        pending.result(timeout=5)

    assert vault.current() == second
    assert vault.open(vault.seal("after setup")) == b"after setup"

def test_unsupported_provider_preserves_the_previous_keyring ( monkeypatch: pytest.MonkeyPatch ) -> None:

    module = importlib.import_module("engine.crypto.cipher")
    vault = Crypto()
    key = vault.key("held")

    vault.setup([key])

    def missing ( secret: bytes ) -> AESGCM:

        raise module.UnsupportedAlgorithm("unavailable")

    monkeypatch.setattr(module, "AESGCM", missing)

    with pytest.raises(Fault) as refused: vault.setup([vault.key("replacement")])

    assert refused.value.reason == "crypto.algorithm" and refused.value.code is Code.UNAVAILABLE
    assert vault.current() == key and vault.open(vault.seal("preserved")) == b"preserved"

@pytest.mark.parametrize("algorithm", ["sha256", "sha384", "sha512", "sha3_256", "blake2b"])
@pytest.mark.parametrize("chunks", [[], [b""], [b"a", b"\x00\xff", "عربي"], [b"abcd"] * 40])
def test_streaming_authentication_matches_independent_hmac ( algorithm: str, chunks: list[bytes | str] ) -> None:

    key    = b"k" * 32
    vault  = Crypto()
    signer = vault.signer(key, algorithm)
    raw    = b"".join(chunk.encode() if isinstance(chunk, str) else chunk for chunk in chunks)
    want   = hmac.new(key, raw, algorithm)

    for chunk in chunks: assert signer.update(chunk) is signer

    assert signer.digest() == want.digest() and signer.hexdigest() == want.hexdigest()
    assert signer.check(want.digest()) and signer.check(want.hexdigest())
    assert vault.verify(raw, signer.digest(), key, algorithm)
    assert vault.verify(raw, signer.hexdigest(), key, algorithm)
    assert not signer.check(want.digest() + b"\x00") and not signer.check(want.hexdigest().upper())
    assert not signer.check("") and not signer.check("\ud800") and not signer.check("é")
    assert not signer.check(want.hexdigest() + "0") and not signer.check(b"x" * 513)
    assert not signer.check(bytes([want.digest()[0] ^ 1]) + want.digest()[1:])
    assert not vault.verify(raw + b"x", signer.digest(), key, algorithm)
    assert not vault.verify(raw, signer.digest(), b"other", algorithm)
    assert signer.check(want.digest()) and signer.copy().update(b"tail").check(hmac.digest(key, raw + b"tail", algorithm))

def test_streaming_key_snapshot_and_forks_are_independent () -> None:

    vault = Crypto()
    first = Key("first", b"a" * 32)
    other = Key("other", b"b" * 32)

    vault.setup([first])

    root = vault.signer().update(b"prefix")

    vault.setup([other])

    assert root.check(hmac.digest(first.secret, b"prefix", "sha256"))
    assert not root.check(vault.mac(b"prefix"))

    def branch ( number: int ) -> bytes:

        return root.copy().update(str(number)).digest()

    with ThreadPoolExecutor(max_workers=4) as pool: signed = list(pool.map(branch, range(40)))

    for number, value in enumerate(signed):
        assert value == hmac.digest(first.secret, f"prefix{number}".encode(), "sha256")

    assert root.check(hmac.digest(first.secret, b"prefix", "sha256"))
    assert root.update(b"tail").check(hmac.digest(first.secret, b"prefixtail", "sha256"))

def test_streaming_authentication_bounds_leave_state_unchanged () -> None:

    wrong: Any
    vault = Crypto()

    vault.setup([Key("held", b"k" * 32)])

    tiny   = vault.options(limit=4)
    signer = tiny.signer()
    raw    = b"abcd" * 100

    for _ in range(100): signer.update(b"abcd")

    assert signer.check(hmac.digest(vault.current().secret, raw, "sha256"))

    for wrong, reason in ((b"abcde", "crypto.size"), ("ééé", "crypto.size"), ("\ud800", "crypto.encoding"), (None, "crypto.data")):

        with pytest.raises(Fault) as refused: signer.update(wrong)

        assert refused.value.reason == reason
        assert signer.check(hmac.digest(vault.current().secret, raw, "sha256"))

    for wrong in ("", b""):

        with pytest.raises(Fault) as empty: tiny.signer(wrong)

        assert empty.value.reason == "crypto.secret"

    with pytest.raises(Fault) as secret: tiny.signer(b"12345")

    assert secret.value.reason == "crypto.size"

    for name in NAMES:

        with pytest.raises(Fault) as bad: tiny.signer(b"k", name)

        assert bad.value.reason == "crypto.algorithm"

    for wrong in (None, 1, [], bytearray(b"x")):

        assert not signer.check(wrong) and not tiny.verify(b"a", wrong, b"k")

    for limit in (True, 0, -1, 2 ** 31):

        with pytest.raises(Fault) as bounded: Hasher.keyed(b"k", limit=limit)

        assert bounded.value.reason == "crypto.limit"

def test_digest_checks_do_not_consume_the_stream () -> None:

    for algorithm in ("blake3", "sha256", "sha512", "sha3_256"):

        stream = crypto.hasher(algorithm).update("ab")

        assert stream.check(crypto.hash("ab", algorithm))
        assert stream.check(bytes.fromhex(crypto.hash("ab", algorithm)))
        assert not stream.check("é") and not stream.check("\ud800") and not stream.check("0" * 513)
        assert stream.update("c").check(crypto.hash("abc", algorithm))

@pytest.mark.parametrize("size", [0, 1, 31, 32, 33, 65536])
def test_text_decoding_keeps_public_values_and_legacy_bytes ( size: int ) -> None:

    vault = Crypto()
    key   = Key("dots.in.name", b"k" * 32)
    raw   = b"x" * size
    nonce = bytes(range(12))
    body  = AESGCM(key.secret).encrypt(nonce, raw, b"aad")

    vault.setup([key])

    old = "v1." + key.id + "." + base64.urlsafe_b64encode(nonce + body).decode().rstrip("=")
    new = vault.seal(raw, b"aad")

    for text in (old, new):

        record = Sealed.decode(text, limit=max(1, size))

        assert type(record.nonce) is bytes and type(record.body) is bytes
        assert record.encode() == text and vault.open(text, b"aad") == raw

        with pytest.raises(Fault) as wrong: vault.open(text, b"other")

        assert wrong.value.reason == "crypto.tampered"

        if size > 1:

            with pytest.raises(Fault) as limit: vault.options(limit=size - 1).open(text, b"aad")

            assert limit.value.reason == "crypto.sealed"

def test_seeded_randomness_cannot_repeat_keys_nonces_or_totp_secrets () -> None:

    unit = Crypto()
    unit.setup([unit.key("fixed")])

    try:

        rand.seed(123)
        first = unit.seal("hello")
        rand.seed(123)
        second = unit.seal("hello")

        assert Sealed.decode(first).nonce != Sealed.decode(second).nonce
        assert unit.open(first) == unit.open(second) == b"hello"

        rand.seed(123)
        first_key, first_totp = unit.key().secret, unit.totp_secret()
        rand.seed(123)
        second_key, second_totp = unit.key().secret, unit.totp_secret()

        assert first_key != second_key and first_totp != second_totp

    finally: rand.seed(None)
