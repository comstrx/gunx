# Array

Iterable transformations, grouping, selection, set operations, reductions and pagination.
Array delegates paths to Json, native-provider selection to Func, and faults to Error.
It does not parse documents or own general conversions. Cast consumes this package, never the reverse.

## DSL

~~~python
from engine.array import array

totals = array.sum(rows, "amount")
grouped = array.group(rows, "team")
selected = array.where_in(rows, "id", wanted)
mapped = array.map(range(10), lambda value: value * 2)
for batch in array.batch(source, 100):
    consume(batch)
~~~

map returns a list. batch consumes at most size values per emitted list and supports one-shot iterables;
it rejects nonpositive/noninteger sizes. chunk keeps its existing sequence-slice contract.
Most selection/transformation methods materialize their result; an Iterable annotation is not a streaming-output promise.

## Reductions and ownership

sum/min/max skip None and consume the source once without an intermediate values list.
Empty sum is zero; empty min/max are None. Values retain their original numeric types and Python arithmetic semantics.
numbers keeps its existing list-returning selection contract; it does not cast values.
median/average retain the storage their algorithms require.

group owns the output lists and borrows the original elements.
where_in/where_not_in build membership sets for hashable choices and fall back to equality scans for unhashable ones.
Large hashable choice sets trade additional membership storage for faster repeated lookups.

sole returns exactly one match; otherwise its Fault retains the exact count. Unfiltered sequences use len;
filtered or one-shot iterables must be consumed to establish that count. They must be finite.
No early refusal discards the established count contract.

## Nested data and sets

flatten uses an explicit traversal stack, allowing deep nesting without Python recursion.
Positive depth flattens that many container levels; zero preserves immediate items; negative depth flattens all levels.
It refuses ancestor cycles while accepting repeated shared branches. It returns a new list and borrows leaf values.

splice clamps negative/out-of-range starts to the sequence and treats negative lengths as zero.
window requires a positive integer size. Pagination computes page counts with exact integer division.

combine accepts and/or/sub. The native bitmap path is restricted to exact integer inputs;
unsupported native ranges fall back to the Python reference. Floats and booleans are not coerced into bitmap integers.
Generic collections are not automatically converted to NumPy: conversion, dtype restrictions and overflow would
change the cost and semantics. Specialized numeric workloads should use an explicit representation.

## Verification

test_array.py covers ownership, exact sole counts, negative slicing, one-shot consumption, cycles,
large page totals and native/pure type agreement. fuzz_array.py compares independent built-in models.
bench_array.py measures grouping, selection, traversal and streaming reductions.

## Aggregate allocation

Median sorts the value stream directly; mode counts it directly. Both skip None and consume an iterable once.
Median still requires storage for sorting; mode still requires storage for distinct values.
Membership accepts frozen sets without rebuilding them. Unhashable row values use equality when a hash lookup fails,
so where_not_in does not incorrectly discard a list/dict-valued row merely because it cannot be hashed.
