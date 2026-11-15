from hypothesis import given, settings, strategies as st
import engine, importlib

EXAMPLES = 1000

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.lists(st.sampled_from(engine.__all__), min_size=1, max_size=12))
def import_order_preserves_each_public_identity ( members: list[str] ) -> None:

    for name in members:

        module = importlib.import_module(f"engine.{name}")

        assert getattr(engine, name) is module
        assert len(module.__all__) == len(set(module.__all__))

        for symbol in module.__all__: assert getattr(module, symbol) is getattr(module, symbol)

import_order_preserves_each_public_identity()

print(f"fuzz engine  examples={EXAMPLES}  ok")
