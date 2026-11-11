from engine.error import Code, Fault
from engine.video import Preset, Probe, Track
from engine.video.arch import CRF, FASTEST, LEAST, MOST, PIXELS, SPEEDS, WIDEST
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any

EXAMPLES = 1500
WORDS    = st.one_of(st.text(max_size=12), st.sampled_from(["720p", "libx264", "aac", "", "a b", "x" * 65]), st.none(), st.integers())
SIZES    = st.one_of(st.none(), st.integers(-4, WIDEST + 4), st.floats(), st.text(max_size=2), st.booleans())
RATES    = st.one_of(st.none(), st.floats(min_value=-1, max_value=FASTEST + 1), st.integers(-1, 300), st.booleans(), st.text(max_size=2))
INTS     = st.one_of(st.integers(-5, MOST * 11), st.floats(), st.none(), st.text(max_size=2))

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.fixed_dictionaries({
    "name": WORDS, "codec": WORDS, "crf": INTS, "speed": st.one_of(st.sampled_from(sorted(SPEEDS)), WORDS), "profile": WORDS,
    "pixel": st.one_of(st.sampled_from(sorted(PIXELS)), WORDS), "width": SIZES, "height": SIZES, "fps": RATES, "audio": WORDS,
    "bitrate": INTS, "bandwidth": INTS,
}))
def presets ( given: dict[str, Any] ) -> None:

    name = given["name"]
    made = tried(lambda: Preset(**given))

    if isinstance(made, Fault):

        assert made.code is Code.INTERNAL
        assert made.reason == "video.preset"
        assert made.errors is not None and made.errors["preset"][0] in ("name", "crf", "speed", "width", "height", "fps", "bitrate", "bandwidth")

        return

    assert 0 <= made.crf <= CRF and made.speed in SPEEDS and made.pixel in PIXELS
    assert made.width is None or 2 <= made.width <= WIDEST
    assert made.fps is None or 0 < made.fps <= FASTEST
    assert LEAST <= made.bitrate <= MOST and made.dump()["name"] == name

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.lists(st.builds(Track, st.sampled_from(["video", "audio", "data"]), st.text(min_size=1, max_size=6), st.one_of(st.none(), st.integers(1, 4000)), st.one_of(st.none(), st.integers(1, 4000))), max_size=4), st.floats(min_value=0, max_value=1e6), st.integers(0, 1 << 40))
def probes ( tracks: list[Track], duration: float, size: int ) -> None:

    probe = Probe(duration, "mp4", 0, size, tuple(tracks))
    video = probe.video()
    audio = probe.audio()

    assert video is None or (video.kind == "video" and video == next(track for track in tracks if track.kind == "video"))
    assert audio is None or audio.kind == "audio"
    assert probe.dump()["tracks"] == [track.dump() for track in tracks]
    assert probe.dump()["duration"] == round(duration, 3)

presets()
probes()

print(f"fuzz video  examples={EXAMPLES * 2}  ok")
