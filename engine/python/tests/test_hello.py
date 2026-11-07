from engine.hello import Hello, hello
import engine

def test_world_is_exactly_the_greeting () -> None:

    assert hello.world() == "hello world"
    assert len(hello.world()) == 11

def test_world_is_the_same_from_every_instance_and_door () -> None:

    assert Hello().world() == hello.world()
    assert engine.hello.hello.world() == hello.world()
