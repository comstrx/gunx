from engine.error import Code, Fault
from engine.storage import Policy, Storage
from engine.storage.arch import BLOCKED, DOCUMENTS, IMAGES, KEY, keyed
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any
import re

EXAMPLES = 1500
SHAPE    = re.compile(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/[0-9a-z]{26}-[^/\s]{1,48}(?:\.[^/\s.]+)?")
NAMES    = st.one_of(st.text(max_size=24), st.sampled_from(["Photo of Me.PNG", "../../etc/passwd", "run.exe", "a.PhP", "noext", ".hidden", "x" * 300 + ".png", "ملف.pdf", "a/b.txt"]))
HEADS    = st.one_of(st.binary(max_size=8), st.sampled_from([b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff\xe0", b"%PDF-1.7", b"PK\x03\x04", b"GIF89a", b"RIFF"]))
KEYS     = st.one_of(st.text(max_size=24), st.sampled_from(["a/b.png", "/abs", "a//b", "a/../b", ".", "..", "a\\b", "", "x" * (KEY + 1), "a\x00b"]), st.none(), st.integers())
FOLDERS  = st.one_of(st.sampled_from(["uploads", "a/b", "/uploads/", "", "a b", "../x", "a/" * 9 + "b"]), st.text(max_size=8))
storage  = Storage()
policy   = Policy(max_size=1000)

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, st.integers(-5, 1200), HEADS)
def checked ( name: Any, size: int, head: bytes ) -> None:

    made = tried(lambda: policy.check(name, size, head))

    if isinstance(made, Fault):

        assert made.code in (Code.VALIDATION, Code.TOO_LARGE)
        assert made.reason in ("storage.type", "storage.size", "storage.mismatch")

        return

    assert made in IMAGES | DOCUMENTS and made not in BLOCKED and 0 <= size <= 1000
    assert name.lower().endswith("." + made)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, FOLDERS)
def keyed_well ( name: Any, folder: Any ) -> None:

    made = tried(lambda: storage.key(name, folder))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason in ("storage.type", "storage.folder")

        return

    assert SHAPE.fullmatch(made), made
    assert keyed(made) == made

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(KEYS)
def keys_stay_inside ( key: Any ) -> None:

    made = tried(lambda: keyed(key))

    if isinstance(made, Fault):

        assert (made.code, made.reason) == (Code.VALIDATION, "storage.key")

        return

    assert type(made) is str and 0 < len(made) <= KEY
    assert not made.startswith("/") and ".." not in made.split("/") and "" not in made.split("/") and "\\" not in made

checked()
keyed_well()
keys_stay_inside()

print(f"fuzz storage  examples={EXAMPLES * 3}  ok")
