from engine.crypto import Crypto, Key, Password, Sealed
from engine.error import Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from collections.abc import Callable
from functools import partial
import base64, blake3, hashlib, hmac, re, struct, unicodedata, zlib

EXAMPLES = 800
LETTERS  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
BASE     = re.compile(r"[A-Za-z0-9_-]*")
NAME     = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
BASE32   = re.compile(r"[A-Za-z2-7]*")
REFUSED  = ("crypto.sealed", "crypto.tampered", "crypto.unknown_key")
OPENED   = 28
SIZED    = 32
LEAST    = 8
MOST     = 512
WILD     = st.text(st.characters(exclude_categories=()), max_size=48)
TEXT     = st.text(max_size=48)
BLOB     = st.binary(max_size=96)
SECRET   = st.binary(min_size=32, max_size=32)
NAMES    = st.from_regex(r"[A-Za-z0-9][A-Za-z0-9._-]{0,15}", fullmatch=True)
ALGOS    = st.sampled_from(("sha256", "sha512", "sha384", "sha1", "md5", "sha3_256", "blake2b", "blake2s"))
LOOSE    = st.text(alphabet=LETTERS + "=+/ \n.", max_size=64)
HEADS    = st.sampled_from(("v1", "v1", "v1", "v2", "V1", "", "v1 ", "v"))
SPANS    = st.one_of(st.integers(min_value=-2, max_value=96), st.integers(min_value=8150, max_value=8170), st.integers())
MOMENTS  = st.one_of(st.integers(min_value=0, max_value=2 ** 40), st.floats(min_value=0, max_value=2.0 ** 40))
DIGITS   = st.text(alphabet="0123456789\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u06f0\u06f1\u06f2\u06f3 \n", max_size=10)
SEEDS    = st.text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz234567=01 \u0131\u017f", max_size=40)
WORDS    = st.one_of(WILD, st.builds(str.__mul__, st.sampled_from(("x", "\ufdfa", "e\u0301", "\uff46")), st.integers(min_value=0, max_value=520)))
COSTS    = st.one_of(st.integers(min_value=0, max_value=3), st.integers(min_value=17, max_value=40), st.integers(min_value=1 << 20, max_value=1 << 40))
SIZES    = st.one_of(st.integers(min_value=0, max_value=64), st.integers(min_value=(1 << 20) + 1, max_value=1 << 40))
STORED   = st.one_of(WILD, st.builds("$argon2{}$v=19$m={},t={},p={}${}${}".format, st.sampled_from(("id", "i", "d", "x")), SIZES, COSTS, COSTS, LOOSE, LOOSE))
VAULT    = Crypto()
QUICK    = Password(1, 8, 1)

VAULT.setup([Key("k1", bytes(range(32)))])

PAIR = VAULT.keypair()

def reason ( work: Callable[[], object] ) -> str | None:

    try: work()
    except Fault as fault: return fault.reason

    return None

def raw_of ( data: bytes | str ) -> bytes | None:

    if isinstance(data, bytes): return data

    try: return data.encode()
    except UnicodeEncodeError: return None

def canonical ( text: str ) -> bytes | None:

    if not BASE.fullmatch(text) or len(text) % 4 == 1: return None

    value = 0
    spare = len(text) * 6 % 8

    for letter in text: value = value << 6 | LETTERS.index(letter)

    return None if value & ((1 << spare) - 1) else (value >> spare).to_bytes(len(text) * 6 // 8)

def expand ( secret: bytes, salt: bytes | None, info: bytes, length: int ) -> bytes:

    key   = hmac.new(salt or bytes(32), secret, "sha256").digest()
    block = b""
    made  = b""
    index = 0

    while len(made) < length:

        index += 1
        block  = hmac.new(key, block + info + bytes([index]), "sha256").digest()
        made  += block

    return made[:length]

def hotp ( key: bytes, counter: int, digits: int ) -> str:

    mac    = hmac.new(key, struct.pack(">Q", counter), "sha1").digest()
    offset = mac[19] & 15
    code   = struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF

    return f"{code % 10 ** digits:0{digits}d}"

def folded ( code: str ) -> str:

    return "".join(str(unicodedata.decimal(mark, mark)) for mark in "".join(code.split()))

def seeded ( text: str ) -> bytes | None:

    bare = "".join(text.split()).rstrip("=")

    if len(text) > MOST or not bare.isascii() or not BASE32.fullmatch(bare) or len(bare) % 8 in (1, 3, 6): return None

    raw = base64.b32decode(bare.upper() + "=" * (-len(bare) % 8))

    return raw if 10 <= len(raw) <= 128 else None

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, SECRET, st.one_of(BLOB, TEXT), BLOB, BLOB, st.data())
def seals_open_only_as_sealed ( name: str, secret: bytes, plain: bytes | str, aad: bytes, other: bytes, drawn: st.DataObject ) -> None:

    vault = Crypto()

    vault.setup([Key(name, secret)])

    sealed = vault.seal(plain, aad)
    raw    = plain.encode() if isinstance(plain, str) else plain
    index  = drawn.draw(st.integers(min_value=0, max_value=len(sealed) - 1))
    mark   = drawn.draw(st.one_of(st.sampled_from(LETTERS + ".=+/"), st.characters(exclude_categories=())))
    bent   = sealed[:index] + mark + sealed[index + 1:]

    assert vault.open(sealed, aad) == raw
    assert not vault.stale(sealed)
    assert Sealed.decode(sealed).encode() == sealed
    assert vault.open(vault.rotate(sealed, aad), aad) == raw
    assert vault.seal(plain, aad) != sealed
    assert reason(partial(vault.open, sealed, other)) == (None if other == aad else "crypto.tampered")
    assert reason(partial(vault.open, bent, aad)) in ((None,) if bent == sealed else REFUSED)
    assert reason(partial(vault.open, sealed + mark, aad)) in REFUSED
    assert reason(partial(vault.open, sealed[:index], aad)) in REFUSED
    assert reason(partial(VAULT.open, sealed, aad)) in ((None,) if (name, secret) == ("k1", bytes(range(32))) else REFUSED)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(HEADS, st.one_of(NAMES, WILD), st.one_of(LOOSE, st.binary(max_size=64).map(base64.urlsafe_b64encode).map(bytes.decode)), WILD, BLOB, BLOB)
def sealed_texts_decode_only_when_canonical ( head: str, name: str, body: str, wild: str, blob: bytes, aad: bytes ) -> None:

    text  = f"{head}.{name}.{body}"
    plain = None if "." in body else canonical(body)
    whole = head == "v1" and NAME.fullmatch(name) is not None and plain is not None and len(plain) >= OPENED

    if whole and plain is not None:

        found = Sealed.decode(text)

        assert (found.key, found.nonce + found.body) == (name, plain)
        assert found.encode() == text
        assert VAULT.stale(text) == (name != "k1")
        assert reason(partial(VAULT.open, text, aad)) in ("crypto.unknown_key", "crypto.tampered")

    if not whole and "." not in body:

        assert reason(partial(Sealed.decode, text)) == "crypto.sealed"
        assert reason(partial(VAULT.stale, text)) == "crypto.sealed"

    for work in (VAULT.open, VAULT.open_text, VAULT.rotate):

        assert reason(partial(work, text, aad)) in REFUSED
        assert reason(partial(work, wild, aad)) in REFUSED

    assert reason(partial(VAULT.stale, wild)) in ("crypto.sealed", None)
    assert reason(partial(VAULT.open_bytes, blob, aad)) in REFUSED
    assert reason(partial(VAULT.open_bytes, b"E1" + blob, aad)) in REFUSED

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, SECRET, BLOB, BLOB, st.binary(min_size=1, max_size=8), st.data())
def frames_open_only_as_sealed ( name: str, secret: bytes, plain: bytes, aad: bytes, junk: bytes, drawn: st.DataObject ) -> None:

    vault = Crypto()

    vault.setup([Key(name, secret)])

    frame = vault.seal_bytes(plain, aad)
    index = drawn.draw(st.integers(min_value=0, max_value=len(frame) - 1))
    flip  = drawn.draw(st.integers(min_value=1, max_value=255))
    bent  = frame[:index] + bytes([frame[index] ^ flip]) + frame[index + 1:]

    assert vault.open_bytes(frame, aad) == plain
    assert len(frame) == 3 + len(name) + 12 + len(plain) + 16
    assert vault.seal_bytes(plain, aad) != frame
    assert reason(partial(vault.open_bytes, bent, aad)) in REFUSED
    assert reason(partial(vault.open_bytes, frame[:index], aad)) in REFUSED
    assert reason(partial(vault.open_bytes, frame + junk, aad)) in REFUSED
    assert reason(partial(vault.open_bytes, frame, aad + junk)) == "crypto.tampered"

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(BLOB, WILD), st.one_of(BLOB, WILD), ALGOS, WILD)
def macs_agree_with_the_standard ( data: bytes | str, secret: bytes | str, algorithm: str, signature: str ) -> None:

    raw = raw_of(data)
    key = raw_of(secret)

    if raw is None or key is None or not key:

        wanted = "crypto.secret" if raw is not None and key is not None else "crypto.encoding"

        assert reason(partial(VAULT.mac, data, secret, algorithm)) == wanted
        assert reason(partial(VAULT.sign, data, secret)) == wanted
        assert reason(partial(VAULT.verify, data, signature, secret)) == wanted

        return

    signed = VAULT.sign(data, secret)

    assert VAULT.mac(data, secret, algorithm) == hmac.new(key, raw, algorithm).digest()
    assert signed == hmac.new(key, raw, "sha256").hexdigest()
    assert VAULT.verify(data, signed, secret)
    assert VAULT.verify(data, signature, secret) == (signature == signed)
    assert VAULT.verify(raw, signed, key)
    assert reason(partial(VAULT.mac, data, secret, signature)) in ("crypto.algorithm", None)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(BLOB, WILD), ALGOS, st.lists(BLOB, max_size=4), WILD)
def hashes_agree_with_the_standard ( data: bytes | str, algorithm: str, chunks: list[bytes], wild: str ) -> None:

    raw    = raw_of(data)
    stream = VAULT.hasher(algorithm)
    fast   = VAULT.hasher()

    for chunk in chunks:

        stream.update(chunk)
        fast.update(chunk)

    assert stream.hexdigest() == hashlib.new(algorithm, b"".join(chunks)).hexdigest()
    assert fast.hexdigest() == VAULT.digest(b"".join(chunks))
    assert reason(partial(VAULT.hash, b"", wild)) in ("crypto.algorithm", None)
    assert reason(partial(VAULT.hasher, wild)) in ("crypto.algorithm", None)

    if raw is None:

        assert reason(partial(VAULT.hash, data, algorithm)) == "crypto.encoding"
        assert reason(partial(VAULT.digest, data)) == "crypto.encoding"
        assert reason(partial(VAULT.crc32, data)) == "crypto.encoding"

        return

    assert VAULT.hash(data, algorithm) == hashlib.new(algorithm, raw).hexdigest()
    assert VAULT.digest(data) == blake3.blake3(raw).hexdigest()
    assert VAULT.crc32(data) == zlib.crc32(raw)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.binary(max_size=64), TEXT), st.one_of(BLOB, TEXT), SPANS, st.one_of(st.none(), BLOB))
def derived_bytes_follow_the_rfc ( secret: bytes | str, info: bytes | str, length: int, salt: bytes | None ) -> None:

    raw   = secret.encode() if isinstance(secret, str) else secret
    label = info.encode() if isinstance(info, str) else info

    if not 1 <= length <= 8160 or not raw:

        wanted = "crypto.secret" if 1 <= length <= 8160 else "crypto.length"

        assert reason(partial(VAULT.hkdf, secret, info, length, salt)) == wanted

        return

    assert VAULT.hkdf(secret, info, length, salt) == expand(raw, salt, label, length)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(
    st.binary(min_size=10, max_size=128), MOMENTS, st.integers(min_value=6, max_value=8), st.integers(min_value=1, max_value=3600),
    st.integers(min_value=-12, max_value=12), st.integers(min_value=0, max_value=10), st.booleans(), DIGITS,
)
def totp_follows_the_rfc ( key: bytes, at: float, digits: int, step: int, shift: int, window: int, lower: bool, wild: str ) -> None:

    plain   = base64.b32encode(key).decode()
    secret  = f" {plain.lower().rstrip('=')}\n" if lower else plain
    counter = int(at // step)
    target  = max(counter + shift, 0)
    code    = hotp(key, target, digits)
    near    = { hotp(key, moment, digits): moment for moment in range(max(counter - window, 0), counter + window + 1) }
    marks   = code.translate(str.maketrans("0123456789", "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669"))

    assert VAULT.totp(secret, at, digits, step) == hotp(key, counter, digits)
    assert VAULT.totp_match(secret, code, at, window, digits, step) == near.get(code)
    assert VAULT.totp_match(secret, f" {marks[:3]} {marks[3:]} ", at, window, digits, step) == near.get(code)
    assert VAULT.totp_verify(secret, code, at, window, digits, step) == (code in near)
    assert VAULT.totp_match(secret, wild, at, window, digits, step) == near.get(folded(wild))
    assert VAULT.totp_uri(secret, "a", "b", digits, step).split("secret=")[1].split("&")[0] == plain.rstrip("=")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(SEEDS, WILD), WILD)
def totp_secrets_decode_or_are_refused ( secret: str, code: str ) -> None:

    key = seeded(secret)

    if key is None:

        assert reason(partial(VAULT.totp, secret, 59)) == "crypto.secret"
        assert reason(partial(VAULT.totp_verify, secret, code, 59)) == "crypto.secret"
        assert reason(partial(VAULT.totp_uri, secret, "a", "b")) == "crypto.secret"

        return

    assert VAULT.totp(secret, 59) == hotp(key, 1, 6)
    assert VAULT.totp_verify(secret, code, 59) == (folded(code) in { hotp(key, moment, 6) for moment in (0, 1, 2) })

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.text(alphabet="ab|\x00", max_size=4), max_size=4), st.lists(st.text(alphabet="ab|\x00", max_size=4), max_size=4), WILD)
def fingerprints_tell_parts_apart ( left: list[str], right: list[str], wild: str ) -> None:

    assert (VAULT.fingerprint(*left) == VAULT.fingerprint(*right)) == (left == right)
    assert len(VAULT.fingerprint(*left)) == SIZED
    assert reason(partial(VAULT.fingerprint, *left, wild)) == (None if raw_of(wild) is not None else "crypto.encoding")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, SECRET, st.one_of(WILD, LOOSE), BLOB)
def keys_parse_or_are_refused ( name: str, secret: bytes, wild: str, blob: bytes ) -> None:

    key      = Key(name, secret)
    standard = base64.b64encode(secret).decode()

    assert VAULT.parse_key(VAULT.export_key(key)) == key
    assert VAULT.parse_key(f"{name}:{standard}") == key
    assert VAULT.parse_key(f"{name}:{standard.rstrip('=')}") == key
    assert VAULT.parse_key(f"{name}:{base64.urlsafe_b64encode(secret).decode()}") == key
    assert VAULT.parse_key(standard) == Key("k1", secret)
    assert secret.hex() not in repr(key)
    assert repr(secret) not in repr(key)
    assert reason(partial(Key, wild, secret)) == (None if NAME.fullmatch(wild) else "crypto.key")
    assert reason(partial(Key, name, blob)) == (None if len(blob) == SIZED else "crypto.key")
    assert reason(partial(VAULT.parse_key, f"{name}:{standard}{wild}")) == (None if not wild else "crypto.key")

    wrong = reason(partial(VAULT.parse_key, wild))

    assert wrong in ("crypto.key", None)

    if wrong is None: assert VAULT.parse_key(VAULT.export_key(VAULT.parse_key(wild))) == VAULT.parse_key(wild)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(BLOB, TEXT), BLOB, st.one_of(WILD, LOOSE), st.data())
def attestations_bind_the_data ( data: bytes | str, other: bytes, wild: str, drawn: st.DataObject ) -> None:

    signature = VAULT.attest(data, PAIR.private)
    raw       = data.encode() if isinstance(data, str) else data
    index     = drawn.draw(st.integers(min_value=0, max_value=len(signature) - 1))
    mark      = drawn.draw(st.one_of(st.sampled_from(LETTERS + "=+/"), st.characters(exclude_categories=())))
    bent      = signature[:index] + mark + signature[index + 1:]

    assert VAULT.attested(data, signature, PAIR.public)
    assert VAULT.attested(raw, signature, PAIR.public)
    assert VAULT.attested(other, signature, PAIR.public) == (other == raw)
    assert VAULT.attested(data, bent, PAIR.public) == (bent == signature)
    assert not VAULT.attested(data, wild, PAIR.public)
    assert not VAULT.attested(data, signature + mark, PAIR.public)
    assert not VAULT.attested(data, signature, other)
    assert reason(partial(VAULT.attest, data, other)) == (None if len(other) == SIZED else "crypto.private")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WORDS, WORDS, STORED)
def passwords_verify_only_their_own ( plain: str, other: str, stored: str ) -> None:

    worded = unicodedata.normalize("NFKC", plain) if len(plain) <= MOST else plain
    wrong  = "short" if len(worded) < LEAST else "long" if len(worded) > MOST else "encoding" if raw_of(worded) is None else None

    assert not QUICK.verify(stored, plain)
    assert not QUICK.verify(stored, "correct horse battery")
    assert QUICK.stale(stored)

    if wrong is not None:

        assert reason(partial(QUICK.hash, plain)) == f"password.{wrong}"

        return

    hashed = QUICK.hash(plain)

    assert hashed.startswith("$argon2id$v=19$m=8,t=1,p=1$")
    assert QUICK.verify(hashed, plain)
    assert QUICK.verify(hashed, worded)
    assert not QUICK.stale(hashed)
    assert QUICK.verify(hashed, other) == (0 < len(other) <= MOST and unicodedata.normalize("NFKC", other) == worded)
    assert not QUICK.verify(hashed[:-1], plain)

seals_open_only_as_sealed()
sealed_texts_decode_only_when_canonical()
frames_open_only_as_sealed()
macs_agree_with_the_standard()
hashes_agree_with_the_standard()
derived_bytes_follow_the_rfc()
totp_follows_the_rfc()
totp_secrets_decode_or_are_refused()
fingerprints_tell_parts_apart()
keys_parse_or_are_refused()
attestations_bind_the_data()
passwords_verify_only_their_own()

print(f"fuzz crypto  examples={EXAMPLES * 12}  ok")
