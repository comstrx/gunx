from engine import hello
import engine

SURFACE = {
    "engine"       : ["hello"],
    "engine.hello" : ["Hello", "hello"],
}

def test_every_package_exports_exactly_its_recorded_surface () -> None:

    assert sorted(engine.__all__) == SURFACE["engine"]
    assert sorted(hello.__all__) == SURFACE["engine.hello"]

def test_the_facade_reaches_every_recorded_member () -> None:

    for name in SURFACE["engine"]: assert getattr(engine, name) is not None
