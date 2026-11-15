# String

Text search, slicing, replacement, casing, normalization, escaping and fuzzy matching.
The facade owns text semantics; func selects native/pure byte-search providers and error owns faults.
String operations are synchronous; they do not schedule work or manage files, sessions or application policy.

## DSL

~~~python
from engine.string import string

label = string.of("  Crème brûlée  ").squish().slug().get()
part = string.substr("abcdef", -2, 1)
edited = string.splice("abcdef", "X", -2, 1)
swapped = string.replace_many("abc ab a", {"abc": "x", "ab": "y", "a": "z"})
best = string.closest("creme", ("Crème", "other"), floor=0.8)
ranked = string.rank("creme", ("Crème", "CREME", "other"), limit=5, floor=0.8)
label = string.truncate("a👩🏽‍💻b🇪🇬", 3, graphemes=True)
valid = string.test("item-123", r"item-\d+", full=True)
~~~

## Search and cuts

- str/str find returns Python codepoint offsets. If either argument is bytes, strings are encoded as UTF-8
  and offsets are byte offsets. Invalid text encoding raises a typed fault. Native and pure byte search
  obey the same offset, empty-needle and not-found contracts.
- position uses original-string offsets, including case-insensitive regex matching; it does not return
  offsets into a separately casefolded string. contains allows an empty needle; count returns zero for it.
- substr and splice share start/length semantics. Negative start counts from the end and clamps at zero.
  Positive length selects that many codepoints; None selects through the end; negative length leaves that
  many trailing codepoints. A range ending before start is empty. Splice inserts into an empty range.
  Out-of-range starts and lengths cannot duplicate the source suffix.
- before/after and their last variants use literal delimiters. between returns empty if opening is absent
  and the remaining tail if closing is absent. between_first preserves the input when either delimiter is absent.
- chunk returns a list and rejects nonpositive chunk sizes. take, truncate, shorten and excerpt retain their
  separate character/word/context meanings; callers choose the appropriate operation.
  Shortening keeps native splitting; discarded pieces are released before joining the selected words.
  Native splitting can still copy a long remaining suffix; it is not a streaming text-reader API.

## Replacement and patterns

- replace_many is simultaneous, literal and longest-key-first. Replacements are never matched again.
  Empty keys are ignored. One-key replacement uses the builtin; multiple keys retain nonoverlapping order.
- test searches by default; full=True requires the entire input to match, including any trailing newline.
- replace_array consumes replacement values in order; remaining occurrences stay unchanged.
- match returns the first capture when present, otherwise the entire match. No match or an unmatched first
  capture returns None; a participating empty capture returns an empty string.
- matches returns one string per match using the same group selection; an unmatched capture becomes an empty string.
- Patterns use Python re syntax. Invalid patterns/templates become string.pattern faults. A replacement callback's
  own exception is not disguised as a pattern error. Patterns are trusted developer input: no regex execution
  timeout or protection against arbitrary catastrophic expressions is promised.

## Fuzzy matching

- ratio normalizes both inputs with fold and returns a score in 0..1. distance is exact codepoint Levenshtein
  distance without normalization. closest/rank use normalized WRatio, not ratio's scoring algorithm.
- closest accepts an iterable and stops at a perfect match. rank consumes finite choices, returns original values,
  preserves duplicates and resolves equal scores by input order. Nonpositive limit returns an empty result without
  consuming choices; arbitrarily large positive limits are bounded by the number of choices.
- floor is inclusive in 0..1; nonfinite or out-of-range values raise string.floor. Threshold comparison uses the
  facade's normalized score. Empty strings follow the scorer's WRatio score of zero.
- No corpus or normalized strings are retained between calls. A list/tuple/sequence can be reused by the caller;
  iterators are consumed and must not be reused as though they were persistent collections.

## Unicode and rendering

- fold removes supported combining marks, applies compatibility decomposition and casefolds. It is intentionally
  lossy and is not an identity, authorization or cryptographic canonicalization primitive.
- direction returns the first strong L/R/AL character's direction, defaulting to ltr; numbers and combining marks
  alone do not establish direction. It does not implement bidirectional layout or isolation processing.
- Word/case/slug and English inflection helpers are heuristics, not locale-aware linguistic segmentation.
  word_count counts Unicode regex word runs; initials takes whitespace-delimited initials without scanning the
  remaining words after reaching the limit. Nonpositive initials limits return empty.
- char_count, substr and splice count codepoints. width estimates codepoint display width, not terminal layout.
- graphemes lazily yields strings for extended grapheme clusters, without materializing the whole input.
  truncate keeps its codepoint default; graphemes=True counts complete clusters in both text and ellipsis.
  The limit includes the ellipsis. Nonpositive limits yield empty; uncut input is unchanged. Trailing body
  clusters are removed only when the entire cluster is whitespace. Only the required prefix is materialized,
  but a single cluster may itself contain many codepoints.
- reverse reverses the original extended grapheme clusters using Python's Unicode segmentation, preserving
  emoji sequences, flags, combining marks and CRLF. Joining reordered clusters can create new boundaries;
  reversing twice is therefore not guaranteed to restore every Unicode string.
- slug keeps the existing character policy and whole separators while bounding token construction by limit.
  Normalization still examines the input; a short output limit is not a limit on input-reading cost.
- escape is for HTML text/quoted attributes. plain removes tag-shaped text for presentation; highlight wraps
  existing text. Neither is an HTML sanitizer, and neither makes untrusted HTML safe to render.
- base64/unbase64 support standard and URL-safe forms with typed decoding failures; mixed alphabets are rejected.

## Fluent

String-returning forwarded verbs return a new Fluent; nonstring results leave the chain.
get returns the text; pipe has typed string/value overloads; when/unless may return the callback result;
tap observes without replacing the value. Chains do not mutate earlier Fluent values.
The direct String facade is statically typed. Dynamic forwarded verbs remain a dynamic typing boundary;
no duplicate forwarding API or generated wrapper layer is maintained.

## Verification

tests/test_string.py checks contracts, faults, lazy consumption and Unicode boundaries.
fuzz/fuzz_string.py uses independent character-selection and replacement models, scorer comparisons,
Unicode inputs and native/pure agreement. benches/bench_string.py covers short/long inputs, match placement,
selective thresholds and fluent overhead. Compare time and peak allocations separately on equivalent outputs;
correctness fixes are not performance wins merely because they change a result.

## References

- [Python regex matching](https://docs.python.org/3/library/re.html)
- [RapidFuzz extraction and scoring](https://rapidfuzz.github.io/RapidFuzz/Usage/process.html)
- [Unicode bidirectional character classes](https://www.unicode.org/reports/tr9/)
- [Python Unicode segmentation](https://docs.python.org/3/library/unicodedata.html#unicodedata.iter_graphemes)
- [Unicode grapheme boundaries](https://www.unicode.org/reports/tr29/)

## Literal templates

~~~python
text = string.template("Hello {user.name}", {"user": {"name": "Ada"}})
text = string.template("__name__", {"name": "{later}"}, delimiters=("__", "__"))
names = string.keys("{user.name} {port} {port}")
parts = string.split(" a, ,b ")
~~~

Templates replace mapping keys and dotted mapping paths once. Inserted text is never evaluated or expanded again.
Custom markers scan to the first literal closer; malformed markers stay literal and are not nested expressions.
Delimiters are literal strings, not regexes; names use ASCII letters, digits, underscores and dots, starting with a letter
or underscore. Missing values fail unless strict=False, which preserves the placeholder. This is substitution, not
HTML/shell/SQL escaping; use the destination encoder. Document rendering belongs to Parse.
Input/output are capped at 8 Mi characters; custom delimiters must each contain 1–32 characters.
split defaults to trimming and removing blank pieces; strip=False and empty=True preserve them.

## Template markers

Literal placeholders accept spaces/tabs around the mapping path, including { name }, __ name __ and custom delimiter pairs.
Inserted text is never interpreted again. Missing values retain their original marker under strict=False.
Split's strip/empty options preserve their independent meanings without an intermediate stripped list.

## Canonical Base64

unbase64(text) retains automatic alphabet detection and omitted-padding compatibility.
unbase64(text, url=True, canonical=True) accepts only unpadded URL-safe text with zero unused bits;
url=False selects padded standard Base64. Native decoding enforces alphabet and canonical bits.
base64(data, url=True) emits the unpadded representation without translation copies.
