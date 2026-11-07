from hypothesis import given, settings, strategies as st
from engine.hello import hello

EXAMPLES = 20_000

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.binary(max_size=4096))
def world_is_the_same_for_every_input ( data: bytes ) -> None:

    greeting = hello.world()

    assert greeting == "hello world"
    assert data != greeting.encode() or len(data) == 11

def main () -> None:

    world_is_the_same_for_every_input()

    print(f"fuzz hello.world  examples={EXAMPLES}  ok")

if __name__ == "__main__": main()
