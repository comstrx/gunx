# JSON

Json owns JSON encoding, decoding, tree operations, streaming arrays and JSON Patch.
It exports Json, the ready json instance and JsonValue; runtime dependencies are engine-error and orjson.

## Encoding

encode returns UTF-8 bytes; dumps returns text. decode accepts text or a contiguous byte buffer.
pretty sorts and indents; stable sorts keys without indentation.
canonical is this codec's sorted encoding, not RFC 8785 canonicalization or a portable signing format.
valid checks parseability; it does not validate a schema.

Native orjson representations remain in effect, including finite-width integer limits,
nonfinite floats encoded as null, and automatic datetime/dataclass handling.
Non-string keys remain supported for compatibility. Inputs such as integer 1 and string "1"
in the same object encode to duplicate keys; callers needing unambiguous wire objects supply string keys.
Neither decoding nor ordinary encoding promises duplicate-key rejection.
No automatic redaction is performed by encoding.

The fallback supports read-only mapping views, sets, UTF-8 bytes, an object's dump method and general mappings,
then the configured default. Read-only views use their native copy when available.
An object's dump protocol is read once per fallback invocation and takes precedence over general mapping conversion.
Invalid UTF-8 bytes fail instead of being silently replaced.
use configures one instance; use(None) clears its custom fallback.
Json instances have fixed slots rather than a dynamic attribute dictionary.
Configure the shared instance at startup. Use a separate Json instance for a different policy.
A fallback returning None means unsupported, preserving the existing protocol.

lines/unlines materialize newline-delimited JSON. lines consumes its iterable once into a binary buffer,
avoiding retention of every encoded row until the final join; the returned payload still occupies memory proportional
to its total size. Source and encoding failures propagate without returning partial output.
encode_stream emits an array incrementally,
reads one source item at a time, and closes a source supporting aclose when consumed or explicitly closed.
Close an abandoned stream or use an async closing scope; simply forgetting an iterator is not deterministic cleanup.
Cancellation and encoding failures propagate. Already transmitted bytes cannot be rolled back.

## Trees and ownership

get/has use separated paths; an empty path addresses the root. List indices are bounded ASCII decimals.
A different separator can address literal dots in keys. Invalid indices are missing, not Python conversion errors.
get/has reject empty separators with json.path.
Path-based tree helpers work on finite, acyclic JSON-shaped data within the interpreter's traversal limits.

get and a pulled value are borrowed. add on an existing path returns the original object.
put with an empty path returns the supplied replacement directly, without copying a discarded document.
Other put calls detach the source and inserted value. forget, pick and omit detach their selected result.
pick constructs that result once rather than repeatedly copying everything already selected.
Omitting no paths still returns an independently editable copy.

merge combines mappings recursively and replaces arrays; untouched values may remain shared.
flatten/unflatten, prefix, flip and shallow rename also retain leaf references.
Flattened names must be unambiguous for the chosen separator; literal separator characters are not escaped.
Overlapping paths are processed in order. These operations do not imply a deep snapshot.
walk transforms leaves; prune removes matching empty values after visiting children and preserves false and zero.

## Diff and patch

diff produces add/remove/replace operations; operation values borrow from the target tree.
patch supports add, remove, replace, move, copy and test with JSON Pointer paths.
An empty pointer addresses the whole document; "/" addresses its empty-string member.
Escapes are ~0 for "~" and ~1 for "/"; dot-path tree syntax is a separate convenience API.

Patch array indices forbid negatives, leading zeroes and non-ASCII digits.
"-" is valid only as an array insertion destination.
Remove/replace/source targets must exist. Move cannot put an ancestor inside its own descendant.
Test compares JSON values, distinguishing booleans from numbers while accepting numerically equal int/float values.
An unknown or malformed operation fails with json.patch; failed test uses conflict/json.test.

Operations apply sequentially to one detached copy. Inserted/copied values are detached from operation inputs.
Failure exposes no partial result and changes neither the source nor operation values.
Removing the root returns None; internally it stays absent until add creates a new root.
Excessive recursion in diff/patch becomes json.depth/json.patch instead of leaking a raw recursion error.

## Verification

The package owns test_json.py, bench_json.py and fuzz_json.py under the workspace proof directories.
They cover pointer escapes, empty keys, operation failures, ownership, Unicode paths, stream cancellation,
whole-tree diff/patch properties, sequential moves/copies and the CPU/allocation costs of common operations.

## Batch editing and entries

~~~python
changed = json.edit(value, {"service.port": 8080, "service.enabled": True}, remove=("debug",))
leaves = dict(json.entries(changed))
~~~

edit makes one source copy for a batch, detaches inserted values, and applies changes in mapping order.
Invalid traversal/index targets fail with json.path; source and inserted values remain unchanged on failure.
Legacy put retains its original root-alias and invalid-index no-op contracts.
entries lazily traverses dictionary/list leaves, including nested empty containers.
It detects ancestor cycles and caps depth at 128 and visits at 100000. It borrows emitted values.
A key containing the separator, or an empty key, cannot form an unambiguous convenience path and raises json.path.
Choose another separator for literal dots; use JSON Pointer patch for arbitrary/empty keys.
rename refuses destination-key collisions instead of silently overwriting values.

## Existing NumPy values

encode directly supports orjson-compatible NumPy arrays/scalars when NumPy is installed by the application.
NumPy is not an engine dependency and ordinary collections are not converted to it.
Native array serialization requires the shapes/dtypes/layouts supported by orjson, including native-endian,
C-contiguous data. Unsupported values raise json.encode unless an explicit instance fallback handles them.
Float32 native output can differ from converting elements to Python float first; no binary-float exactness promise is added.
See [orjson NumPy support](https://github.com/ijl/orjson#numpy).

## Single-pass transformations

walk(value, change, keys=rename) transforms leaf values and mapping keys together. rename remains the key-only entry point.
Lists and tuples are traversed; tuple shape is preserved. Shared acyclic branches are allowed; active cycles fail.
Key collisions and non-string callback-produced keys fail. Traversal is bounded to 128 levels and 100000 input nodes.
Callbacks run once per leaf occurrence and their exceptions propagate; callback-produced values are not recursively revisited.
The result owns new containers, while an unchanged mutable leaf or an object returned by the callback remains borrowed.
A callback owns its side effects; this is not a transaction wrapper for arbitrary user code.
The traversal retains no callback cycle after returning, including with cyclic garbage collection disabled.
