# Number

Decimal values, money in integer minor units, rounding, allocation and numeric display.
Number owns arithmetic; String owns digit normalization; Error owns the failure contract.
No I/O, background tasks, global decimal settings or external numeric dependency.

## DSL

~~~python
from engine.number import Decimal, Money, number

price = number.money("19.99", "USD")
parts = price.split(3)
allocated = price.allocate([70, 20, 10])
discounted = number.discount(price, "12.5")
tax = number.tax(price, 1400)
total = number.total(item for item in parts)
display = number.currency(total)
rounded = number.round_to("123.456", "0.05")
ratio = number.divide(1, 3, places=4)
~~~

Money is immutable and slotted. Number is stateless. The shared number facade has no mutable configuration.
Existing public names remain; total accepts any iterable and consumes it once.

## Exactness

- Money stores integer minor units and an uppercase three-letter ASCII code.
  Construction rejects booleans and fractional/string minor units. Builders normalize lowercase currency codes.
- major and text retain every minor unit, including values beyond ordinary Decimal context precision.
- Converting a major amount to Money rounds half away from zero at the final minor unit.
- multiply, Money.percent and tax round ties to even. Factors accept Decimal, int or text; float and bool factors are refused.
  Use decimal strings for exact external amounts. Number.decimal accepts finite floats through their text representation;
  it cannot recover precision already lost before the call.
- Monetary scaling, basis-point arithmetic and quantized ratios use exact integer ratios before the final rounding.
  Changing the caller's Decimal precision, rounding, traps, exponent bounds or flags does not alter these operations.
- quantize uses half away from zero, or ties to even with banker=True. It retains a 34-significant-digit output ceiling.
- divide with places and percent/change compute the final quantized ratio without an intermediate rounded quotient.
  A rounded zero in these ratio operations is canonical positive zero.
- divide without places returns a quotient rounded to 34 significant digits, ties to even, under an isolated context.
  Nonterminating decimal fractions are necessarily rounded.
- round_to rounds to the nearest multiple of a positive step, ties away from zero; the resulting step multiple is exact.
- trim removes trailing fractional zeros without rounding significant digits. Whole values use exponent zero.
- No operation modifies the caller's Decimal context or uses a shared mutable context for arithmetic.

## Money

- add/subtract/compare and all ordering operators require identical currencies; mixing currencies raises number.currency.
  Equality/hash include both amount and currency; different currencies can coexist as distinct dictionary/set keys.
- split uses integer quotient/remainder and gives extra units to earlier entries. It preserves the signed total.
  For negative amounts its floor-division distribution need not be the negation of the positive split.
- allocate uses largest fractional remainders, ties by input order. Zero weights receive zero.
  Negative allocations mirror positive allocations exactly. All weights must be nonnegative integers with a positive total.
- total checks every currency and constructs one result. It accepts generators; an empty iterable is number.empty.
- tax receives nonnegative integer basis points, not a regional tax policy. Products own rates, exemptions and business rules.
  discount subtracts Money.percent. Neither operation performs foreign-exchange conversion.
- Money minor construction/addition remain arbitrary-precision integer operations.
  multiply/percent/tax refuse rounded results with 35 or more minor-unit digits.
- Currency minor-unit overrides follow the numeric entries of the official ISO 4217 maintenance list.
  Non-two-decimal currencies include zero, three and four decimal places.
  Unlisted three-letter codes retain the existing two-decimal fallback; acceptance is not ISO-code validation.
  ISO minor units are not cash-rounding increments or a provider-specific settlement contract.

## Parsing and display

- decimal accepts finite Decimal/int values and numeric text, removing commas/underscores as existing delimiter semantics.
  It does not infer regional decimal separators. Use canonical decimal text at an external boundary.
- parse_money delegates Eastern digit normalization to String and requires an amount plus one currency marker,
  or an explicit default currency. It is a bounded convenience parser, not a general currency-language parser.
- currency formats a Money value directly from its exact minor units.
  Symbols and Arabic abbreviations are display data; use symbol=False for an explicit code.
- format supports explicit grouping/decimal separators, including empty separators, without sentinel-character collisions.
- compact and bytes are approximate float-based displays, not arithmetic or persistence formats.
  compact respects places through the final Q suffix; bytes uses IEC units and preserves the sign.
- spell uses bounded English/Arabic number words, not jurisdiction-specific legal wording.
  Roman input must be canonical after case/outer-space normalization.
- clamp/between reject nonfinite inputs and reversed bounds. sign rejects nonfinite values.
- divide with zero divisor keeps its explicit default (zero when omitted); percent with zero base returns zero;
  change from zero returns None. Invalid operands are still refused before these fallbacks.

## Bounds and faults

- Nonzero Number.decimal inputs retain adjusted-exponent bounds -400 through 27.
- Parsed text is limited to 4096 characters before normalization; supplied Decimal coefficients are bounded to 4096 digits.
  The shared reader also bounds adjusted exponents to ±4096 and integer input bit length to 4096.
- Quantization places range from -400 to 400; display places range from 0 to 400.
  The 34-digit quantized-output limit can reject a result even inside the places range.
- pad width, split count, allocation entry count and materialized pairs count are capped at 100000.
  These cap those operations, not arbitrary caller-owned objects or an unlimited total iterable.
- pairs preserves its existing offset semantics: offset adjusts each start; upper bounds remain clipped at total.
- Invalid boundary values use typed number.* faults. Refusal details are bounded.
  Invalid money comparisons use CONFLICT; numeric-input refusals use BAD_REQUEST.
- New stricter refusals include bool counts/weights/factors, nonfinite predicates, excessive output requests and
  malformed zero-divisor operands. Callers needing unbounded streaming should compose bounded batches.

## Ownership and proof

- arch owns currency tables, bounds, exact arithmetic helpers and isolated-context construction data.
  Money owns monetary invariants; Number owns the numeric facade and composition.
- Tests cover changed caller contexts, traps/flags, halfway neighbors, large integer amounts, currency ordering,
  iterable consumption, malformed input and output bounds.
- Fuzz uses independent Fraction/high-precision Decimal references for scaling and quotients, and allocation invariants
  for unit conservation, signs, zero weights, remainder priority and stable ties.
- Benchmarks cover parsing, formatting, money, aggregation and predicates. CPU time, Python allocation peaks and
  application throughput are different measurements; none substitutes for the others.
- Code uses the standard numeric implementation across operating systems. This round was exercised on Ubuntu WSL;
  it does not establish native Windows/macOS or free-threaded-runtime performance.

## References

- [Decimal arithmetic and context semantics](https://docs.python.org/3.15/library/decimal.html)
- [Exact rational reference arithmetic](https://docs.python.org/3.15/library/fractions.html)
- [ISO 4217 maintenance agency](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html)
- [Currency list used: published 2026-09-17](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml)

## Explicit exchange

~~~python
converted = number.exchange(number.money("12.50", "USD"), "JPY", "150.25")
~~~

The caller supplies a positive exact rate: destination major units per one source major unit.
The operation uses integer ratios, currency minor-unit scales and one final ties-to-even rounding.
Decimal, int and numeric text are accepted; floats and booleans are refused. Rounded results remain below the
34-digit minor-unit ceiling. The engine supplies no live rates, spread, tax or settlement policy.
Cast delegates monetary construction to this package; it does not implement a second money representation.

## Money display

Money.text formats integer minor units directly without Decimal arithmetic or caller-context changes.
Zero-, two-, three- and four-place currencies retain exact signs and trailing zeroes.
Very large integers retain the Decimal formatting fallback when the runtime's integer-to-text limit applies.
