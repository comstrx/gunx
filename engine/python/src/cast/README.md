# Cast

Explicit conversions at value boundaries. One stateless facade, no provider registry, global settings or I/O.
String owns text splitting; Array owns mapping; Json owns decoding; Number owns Decimal and Money.
There are no dependencies from those domains back to Cast.

## DSL

~~~python
from engine.cast import cast

count = cast.integer("12", low=1, high=100)
ratio = cast.number("1.25")
exact = cast.decimal("123.456")
enabled = cast.boolean("false")
ids = cast.list("1, 2, 3", using=cast.integer)
fields = cast.dict('{"enabled": true}')
encoded = cast.bytes("مرحبا")
decoded = cast.text(encoded)
price = cast.money("19.99", "USD")
same = cast.money(price.dump())
minor = cast.minor(price)
major = cast.major(price)
~~~

integer accepts integer text, ints and exactly integral finite floats/Decimals; fractional values, booleans
and malformed separators fail. It never silently truncates. number produces a finite binary float;
use decimal or money when binary rounding is unacceptable. Optional bounds are inclusive and valid numeric bounds
are required. integer bounds are integers, excluding bool.

decimal delegates Number's limits and optional quantization places.
boolean accepts bool, integer 0/1 and explicit true/false tokens; it does not apply arbitrary Python truthiness.
text decodes bytes strictly and uses Money's exact display. bytes accepts text or byte buffers, never a number as a size.
Encoding errors become typed faults.

## Containers

list accepts a finite iterable, a separated string, None (empty), or a scalar (one item).
Mappings/byte buffers are refused because their intended element interpretation is ambiguous.
Strings use String's trim/remove-blank semantics. using maps the collected values through a caller-supplied converter;
callback errors propagate. No arbitrary class is instantiated.

dict accepts JSON text, a mapping, or iterable pairs. Keys must be unique strings; duplicate keys in a pair iterable fail.
JSON text uses Json's decoder, whose duplicate-key behavior remains last-wins.
Returned list/dict containers are new, while their elements remain borrowed.

Container limit defaults to 100000 and can be reduced to zero. Iterables consume at most limit+1 entries before refusal.
Text container inputs are bounded to 100000 characters/bytes before parsing. Scalar numeric text is capped at 4096
characters; integer results at 4096 bits. These are conversion bounds, not a sandbox for arbitrary caller iterators.

## Money and inference

money accepts exact numeric text/Decimal/int plus a currency, existing Money, or its {minor, currency} representation.
With no currency, text must contain a supported currency marker. minor=True explicitly interprets numeric input
as minor units; default input is major units. Floats are refused at this boundary.
An existing Money retains identity and cannot be relabeled to another currency. Use Number.exchange with an explicit
rate for conversion. Currency precision, rounding and arithmetic have one owner: Number.

minor returns integer minor units; major returns Decimal major units. These never infer an exchange rate.
auto recognizes null/boolean/numeric text; other values and unrecognized text are preserved.
Overflowing/nonfinite inferred numbers remain text. Use explicit conversions for financial and validation boundaries.

Fault reasons are cast.* and do not echo rejected input. The package's tests, fuzz properties and benchmarks cover
precision, type refusal, bounded generators, currency identity and single-owner delegation.

## Container conversion costs

Exact built-in lists/tuples use a sized path: check the limit, then snapshot before any callback.
Mapping also validates its copied snapshot. Callback mutation of the source cannot extend conversion work.
Other iterables retain bounded limit+1 consumption. Mapping conversion validates string keys and copies the outer mapping;
nested values remain borrowed. Iterable pairs still reject duplicate keys.
Encoding selectors must be strings. The money minor selector must be an actual bool, never a truthy string or integer.
