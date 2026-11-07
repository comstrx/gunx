from api import hello

def test_world_is_exactly_the_greeting () -> None:

    assert hello.world() == "hello world"
