# Rand

Random values, samples, tokens and ordered identifiers behind one small interface.
Uses the standard library and the engine's error package; no external runtime dependency.

## Use

```python
from engine.rand import Rand, rand

secret = rand.token(32)
request_id = rand.quick(8)
receipt = rand.uuid7()
label = rand.reference(10)

selected = rand.sample(range(1_000_000), 5)
batch = rand.choices(["a", "b", "c"], 20, weights=[1, 3, 0])
inventory = rand.sample(["a", "b"], 4, counts=[1_000_000, 2_000_000])

offset = rand.integer(0, 60, step=5)
fraction = rand.uniform(-2.0, 2.0)
fixture = Rand("fixture")
```

## Security

- Unseeded draws use OS entropy, except `quick`, which deliberately uses the process PRNG.
- `quick` is for correlation IDs, not secrets, authentication, uniqueness constraints or authorization.
- `Rand(seed)` creates an isolated, predictable fixture generator. `seed(value)` reseeds that instance;
  `seed(None)` restores OS entropy. Never seed the shared `rand` used by production security code.
- Seeded tokens and passwords are predictable. Ordered IDs disclose time and are not bearer secrets.
- Token size means entropy bytes, not output characters. Alphabet size and output length determine text entropy.
- `constant_equal` delegates to `secrets.compare_digest`; ASCII text pairs compare directly; other text uses UTF-8 with surrogate preservation.
  It reduces content-dependent timing leakage, not differences in input length, encoding work or transport behavior.
- Generation does not replace verification limits, expiry, storage constraints or uniqueness enforcement.

## DSL

| Operation | Contract |
|---|---|
| `bytes(size=32)` | 1–4096 entropy bytes |
| `hex(size=32)` | Two hexadecimal characters per entropy byte |
| `quick(size=8)` | Fast non-secret hexadecimal ID; 1–4096 source bytes |
| `token(size=32)` | URL-safe Base64 without padding; 1–4096 entropy bytes |
| `string(length=16, alphabet=...)` | 1–4096 characters; nonempty string alphabet |
| `code(digits=6)` | 4–12 ASCII digits; leading zero is valid |
| `reference(length=8)` | Text without visually ambiguous characters |
| `password(length=20)` | 8–4096 characters containing lower/upper ASCII, digits and symbols |
| `bits(width)` | Unbiased integer in `[0, 2**width)`; 0–32768 bits |
| `below(stop)` | Unbiased integer in `[0, stop)`; positive integer bound |
| `integer(low, high, step=1)` | Inclusive bounds; positive integer step measured from `low` |
| `number()` | Float in `[0, 1)` |
| `uniform(low, high)` | Finite float in `[low, high)`; equal bounds return that bound |
| `chance(probability)` | Below/equal zero and NaN return false; above/equal one return true |
| `choice(items)` | One value from a nonempty sequence |
| `weighted(items, weights)` | One weighted value; zero weights are never selected |
| `choices(items, count=1, weights=None)` | 0–4096 draws with replacement; optional weights prepared once |
| `sample(items, count, counts=None)` | Without replacement by position; optional integer multiplicities |
| `shuffle(items)` | New shuffled list; input remains unchanged |
| `uuid()` | UUID version 4 |
| `uuid7()` | Time-ordered UUID version 7 |
| `ulid()` | 26-character Crockford Base32 ID with monotonic random increments |
| `pid()` | Current process ID |
| `constant_equal(left, right)` | Compare strings/bytes, including mixed string/bytes inputs |
| `seed(value)` | Configure this instance's fixture stream; `int`, `str` or `None` |

Counts, sizes, steps and integer bounds reject booleans and non-integers.
Weights accept finite nonnegative integers/floats, reject booleans, and require a positive finite total.
Weighted floating-point selection has the resolution of a 53-bit draw; arbitrarily tiny weights
relative to the total cannot receive exact mathematical probabilities.

A sample selects positions, so equal input values may appear more than once. `counts` gives each position
an integer multiplicity without expanding the population. Sequence lengths and totals must fit Python's
population indexing. Empty draws return an empty list when the population specification is valid.
Keep input sequences stable for the duration of a call.

Invalid arguments raise `Fault` with a `rand.*` reason. No product-specific error vocabulary is added.

## Ordering and isolation

- Ordered allocation is synchronized across threads. Monotonicity belongs to one generator in one process,
  in allocation order; completion order of overlapping calls is not guaranteed.
- A backwards clock keeps the previous logical timestamp. UUID7 counter exhaustion advances that timestamp;
  ULID random-field exhaustion raises `rand.overflow`. Out-of-range timestamps raise `rand.clock`.
- On supported POSIX fork, the ID lock is coordinated around fork and inherited counters reset on the
  child's first ID call. This protects this package's state, not arbitrary libraries in a multithreaded parent.
- Fork inherits an explicitly seeded fixture stream. Use unseeded instances for independent production entropy.
- Reseeding does not rewind ordered IDs. Reproducible UUID7/ULID fixtures also need the same clock and
  allocation history. Configure fixture generators before concurrent use; do not reseed active producers.
- Linux, macOS and Windows use the same API. Fork-specific behavior is conditional on platform support.

## Cost and ownership

- `sample` passes sequences directly to the standard library; a small sample from a large range does
  not first materialize that range. `choices` prepares weights once for the whole batch.
- Common alphabets use native byte translation with rejection before mapping. Custom alphabets use
  unbiased rejection sampling, with batched 8/16-bit entropy where applicable. Unweighted secure choices share
  this sampler rather than reading fresh OS entropy for each element. Rejected tail values never use modulo.
  Seeded choices retain their existing integer-draw sequence; weighted choices retain their weighted path.
  Batch entropy uses temporary storage in exchange for fewer OS calls; no entropy is cached between calls.
- Passwords reject complete candidates that miss a required class; they do not overwrite chosen characters
  afterward, which would change the distribution.
- Secure shuffling uses unbiased Fisher–Yates selection with entropy blocks at most 4096 bytes each.
  Its returned list still necessarily scales with the input.
- General encoding, parsing, hashing and application policies remain with their owners.
- Generation methods are synchronous. Bounded small draws need no async wrapper; very large caller-owned
  populations should be handled outside a latency-sensitive event-loop path.

## Proof

The package owns `tests/test_rand.py`, `benches/bench_rand.py` and `fuzz/fuzz_rand.py`.
They cover valid and invalid inputs, reproducible fixtures, unbiased selection boundaries, large sparse
populations, Unicode alphabets, clock rollback, counter exhaustion, concurrent allocation and POSIX fork.
Fuzz properties must distinguish valid inputs that must succeed from invalid inputs that must fail.
Benchmark numbers describe their specific workloads and machine; they are not an HTTP throughput claim.
