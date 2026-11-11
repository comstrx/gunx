from argon2 import PasswordHasher, Type
from engine.crypto import Crypto, Key, Pair, Password, Sealed, crypto, password
from engine.error import Code, Fault
from typing import Any
import base64, pytest

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

    assert sealed.startswith("v1.k1.") and crypto.open_text(sealed, b"ctx") == "hello" and not crypto.stale(sealed)
    assert crypto.open(crypto.seal(b"\x00\x01")) == b"\x00\x01" and crypto.open(crypto.seal("")) == b""
    assert crypto.ready() and crypto.current() is first and crypto.names() == ("k1",) and crypto.describe()["current"] == "k1"
    assert crypto.seal("hello", b"ctx") != sealed and Sealed.decode(sealed).encode() == sealed

    with pytest.raises(Fault) as tampered: crypto.open(sealed[:-2] + "zz", b"ctx")

    assert tampered.value.reason == "crypto.tampered" and tampered.value.code is Code.BAD_REQUEST

    with pytest.raises(Fault) as aad: crypto.open(sealed, b"other")

    assert aad.value.reason == "crypto.tampered"

    crypto.setup([second, first], current="k2")

    assert crypto.stale(sealed) and crypto.rotate(sealed, b"ctx").startswith("v1.k2.") and crypto.names() == ("k1", "k2")
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

    assert blob.startswith(b"E1\x02k1") and crypto.open_bytes(blob, b"file") == b"\x00" * 1000 and len(blob) == 5 + 12 + 1000 + 16

    for bad in (b"", b"E1", b"E2" + blob[2:], b"E1\x02k1short", b"E1\x02zz" + b"\x00" * 40, blob[:-1] + b"\xff", b"E1\xff" + blob[3:], blob[:32]):

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

    assert files.id == "k1.files" and sealed.startswith("v1.k1.files.") and vault.open_text(sealed, b"aad") == "report" and not vault.stale(sealed)
    assert vault.open_bytes(vault.seal_bytes(b"frame")) == b"frame" and vault.seal_bytes(b"frame").startswith(b"E1\x08k1.files")
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

    assert crypto.totp_uri(secret, "ali@x.com", "GunX") == f"otpauth://totp/GunX%3Aali%40x.com?secret={secret}&issuer=GunX&digits=6&period=30&algorithm=SHA1"
    assert crypto.totp_uri(f" {secret.lower()}====", "a&b=c:d/é", "My Co?", 8, 60) == f"otpauth://totp/My%20Co%3F%3Aa%26b%3Dc%3Ad%2F%C3%A9?secret={secret}&issuer=My%20Co%3F&digits=8&period=60&algorithm=SHA1"

    for account, issuer, digits, step, reason in (
        ("", "GunX", 6, 30, "crypto.totp"), ("ali", "", 6, 30, "crypto.totp"), ("ali", "Gun:X", 6, 30, "crypto.totp"), ("ali", "GunX", 9, 30, "crypto.totp"),
        ("ali", "GunX", 6, 0, "crypto.totp"), ("\ud800", "GunX", 6, 30, "crypto.encoding"), ("ali", "\ud800", 6, 30, "crypto.encoding"),
    ):

        with pytest.raises(Fault) as labelled: crypto.totp_uri(secret, account, issuer, digits, step)

        assert labelled.value.reason == reason, (account, issuer)

def test_passwords_use_argon2id () -> None:

    hashed = password.hash("correct horse battery")

    assert hashed.startswith("$argon2id$v=19$m=65536,t=3,p=2$") and password.verify(hashed, "correct horse battery")
    assert not password.verify(hashed, "wrong") and not password.verify("", "x") and not password.verify(hashed, "")
    assert not password.stale(hashed) and password.stale("$argon2id$v=19$m=8,t=1,p=1$c2FsdHNhbHQ$aGFzaA") and password.stale("junk") and password.stale("")
    assert password.hash("correct horse battery") != hashed and not password.verify(hashed, "correct horse batterY")

    with pytest.raises(Fault) as short: password.hash("short")

    assert short.value.code is Code.VALIDATION and short.value.reason == "password.short" and "short" not in str(short.value.errors)

    with pytest.raises(Fault) as long_: password.hash("x" * 600)

    assert long_.value.reason == "password.long" and not password.verify(hashed, "x" * 600)

    for plain, reason in (("e\u0301" * 4, "password.short"), ("\ufdfa" * 200, "password.long"), ("", "password.short"), ("\ud800" * 600, "password.long")):

        with pytest.raises(Fault) as counted: password.hash(plain)

        assert counted.value.reason == reason and counted.value.code is Code.VALIDATION, ascii(plain[:8])

    with pytest.raises(Fault) as lone: password.hash("lone\ud800surrogate")

    assert lone.value.reason == "password.encoding" and lone.value.code is Code.VALIDATION and lone.value.errors == { "password": ["is not valid text"] }
    assert not password.verify(hashed, "lone\ud800surrogate") and not password.verify("lone\ud800surrogate", "correct horse battery")

    quick = Password(1, 8, 1)
    typed = quick.hash("café au lait")
    bound = quick.hash("a\x00bcdefgh")

    assert quick.verify(typed, "cafe\u0301 au lait") and quick.verify(quick.hash("\uff46\uff55\uff4c\uff4c\uff57\uff49\uff44\uff54\uff48"), "fullwidth") and not quick.verify(typed, "cafe au lait")
    assert quick.verify(bound, "a\x00bcdefgh") and not quick.verify(bound, "a\x00bcdefgX") and not quick.verify(bound, "a")
    assert quick.verify(quick.hash("x" * 512), "x" * 512) and quick.verify(quick.hash("كلمة السر"), "كلمة السر") and quick.stale(hashed)
    assert not quick.verify(HEAVY, "correct horse battery") and quick.stale(HEAVY) and not password.verify(HEAVY, "x")
    assert not quick.verify(f"{typed}{'A' * 512}", "café au lait") and not quick.verify("$argon2id$v=19$m=8,t=1,p=1$c2FsdA$", "password")
    assert not quick.verify("$argon2id$v=19$m=8,t=17,p=1$c29tZXNhbHQ$" + "A" * 43, "x") and not quick.verify("$argon2id$v=19$m=8,t=1,p=17$c29tZXNhbHQ$" + "A" * 43, "x")
    assert not quick.verify("$argon2id$v=19$m=1048577,t=1,p=1$c29tZXNhbHQ$" + "A" * 43, "x") and not quick.verify("$argon2id$v=19$m=7,t=1,p=1$c29tZXNhbHQ$" + "A" * 43, "x")

    older = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1, type=Type.I).hash("legacy password")

    assert older.startswith("$argon2i$") and quick.verify(older, "legacy password") and quick.stale(older) and not quick.verify(older, "legacy passw0rd")

    wide = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1, hash_len=400).hash("legacy password")

    assert len(wide) > 512 and not quick.verify(wide, "legacy password") and quick.stale(wide)

    for cost in COSTS:

        with pytest.raises(Fault) as costly: Password(*cost)

        assert costly.value.reason == "password.cost" and costly.value.code is Code.INTERNAL, cost

        with pytest.raises(Fault): quick.setup(*cost)

    assert quick.verify(typed, "café au lait") and not quick.stale(typed)

    password.setup(time_cost=1, memory_cost=8192, parallelism=1)

    assert password.verify(password.hash("another password"), "another password") and password.stale(hashed) and password.verify(hashed, "correct horse battery")

    password.setup()

    assert not password.stale(hashed)
