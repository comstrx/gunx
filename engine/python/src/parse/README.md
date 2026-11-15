# Parse

Document and protocol interpretation. One document DSL over JSON, TOML and YAML.
Json owns JSON encoding/tree operations; String owns literal substitution; Cast owns value conversions.
Parse owns format selection, document limits, safe YAML construction and document composition.
Physical file reads/writes stay with Fs; Parse has no filesystem dependency.

## DSL

~~~python
from engine.parse import parse

value = parse.loads('{"port": 80}', "json")
text = parse.dumps({"port": 80}, "toml")
converted = parse.convert("port = 80", "toml", "yaml")

doc = parse.document("service:\n  host: '{host}'\n  port: 80", "yaml")
doc.set("service.port", 8080).update({"service.enabled": True})
doc.render({"host": "localhost"}).remove("debug")
value = doc.dict()
paths = doc.keys()
selected = doc.match("service.*")
text = doc.text("toml")
~~~

loads/dumps work on text/UTF-8 bytes and document values. json/toml/yaml are direct format conveniences.
of creates a Document from a value; document parses text first. yml and .yaml are accepted format names.
JSON/YAML may have object, list or scalar roots; TOML emission requires a mapping.

## Files and templates

~~~python
from engine.fs import file
from engine.parse import parse

source = await file.read("template.yaml")
doc = parse.document(source, "yaml")
doc.render({"name": "worker"}, delimiters=("__", "__"))
await file.write("generated.toml", doc.text("toml"))
~~~

Use the format of the input, not the output filename, when reading. Rendering substitutes string leaves;
it does not infer types from placeholder text. set/update inject typed values explicitly.
Mapping-path placeholders such as {service.host} and custom literal pairs such as __name__ are supported.
strict=False preserves unresolved placeholders. keys=True also renders keys and refuses collisions.
No expressions, imports, environment lookup, recursive expansion or application policy execute during rendering.
String owns placeholder grammar and expansion bounds. Render also bounds total generated string content to 8 Mi characters before publication. Serialization escapes values for the selected format.

## Paths and ownership

Document owns a deep snapshot. value/get/dict/list/match return detached values.
set/update/remove/map/render mutate that one Document and return it for chaining; earlier references to the same
Document observe subsequent successful changes. Separate documents are independent.
Failed edits/rendering do not publish a partial value or mutate the input.
map transforms leaves; returned callback objects are detached before publication.

Paths use dots and list indices, with separator configurable at construction.
A key containing dots can use separator="/". keys/match refuse ambiguous paths, including empty keys.
JSON Pointer patch remains available through Json for arbitrary key names.
keys returns leaf paths, including nested empty containers; match uses String's glob rules.
Use update for multiple assignments to avoid repeated whole-document copies.
A mutable Document is caller-owned; concurrent mutations of the same instance are not a transaction API.

## Formats and safety

- JSON uses orjson through Json. Its integer limits, nonfinite-float output and duplicate-key behavior are preserved.
- TOML reads with standard tomllib and writes with Tomli-W. Unsupported TOML values (including None) fail.
  TOML input support follows the runtime; the writer's supported format may be narrower.
- YAML uses PyYAML SafeLoader/SafeDumper, preferring the LibYAML variants when available.
  Python object tags are refused. Mapping keys must be unique strings; explicit overrides of merged defaults are allowed.
  Aliases are checked for cycles and expanded traversal cost before construction, preventing merge expansion bombs.
  Loader customizations are instance-local and do not modify third-party global constructors.
  PyYAML's implicit scalar resolver semantics remain in effect; quote values such as yes/on when they must be strings.
- These are data round trips: comments, formatting, anchors, source positions and scalar spellings are not preserved.
  Cross-format conversion only preserves values representable by the target; it is not a lossless syntax editor.
- Documents are limited to 8 Mi characters for str / 8 MiB for byte input, 128 levels and 100000 traversal visits.
  YAML additionally caps scanner tokens at 100000 and alias tokens at 1000. Output is bounded after encoding.
  Generic document edits validate before publication. A caller-supplied huge object can still cost memory to inspect/copy.
- Parse failures use typed parse.* faults and do not include rejected credentials or document content.

Parsing/serialization are synchronous CPU work. Use the engine's scheduling facilities for large documents on an
async request path; Parse does not silently create threads, processes or queues.

## Other interpretation

Duration/size, URLs/IP networks, identities, MIME/Accept and authorization readers remain available.
Sizes compute exact integer bytes and floor fractional bytes. Negative/nonfinite numeric durations are refused.
IPv6 origins retain brackets; URL control characters fail. Quoted header separators remain inside their value.
SemVer refuses empty identifiers and leading-zero numeric prereleases.
These helpers interpret syntax, not ownership, DNS reachability, authentication or authorization policy.

Legacy integer/number/boolean/auto/list methods delegate to Cast; legacy template/keys delegate to String.
Existing conversion fault names and narrow numeric-text limits remain at those compatibility entry points.
New conversion code should use Cast directly.

## Runtime and verification

PyYAML works without its C extension; native availability depends on platform/wheels/build prerequisites.
On this round's Python 3.15 environment, LibYAML support was built and verified locally; that is not a promise
that every fresh installation includes it. No native Windows/macOS run was performed in this round.
The implementation has no platform-specific document logic.

Tests cover all three formats, native/fallback YAML, malicious tags, aliases, duplicate keys, ownership,
atomic failures and literal templates. Fuzz adds common-data-model round trips; benchmarks distinguish parsing,
validation and document-copy costs.

## References

- [Python tomllib](https://docs.python.org/3/library/tomllib.html)
- [Tomli-W](https://github.com/hukkin/tomli-w)
- [PyYAML safe constructors and LibYAML](https://pyyaml.org/wiki/PyYAMLDocumentation)
- [SemVer](https://semver.org/)
- [HTTP field syntax](https://www.rfc-editor.org/rfc/rfc9110.html#name-field-values)

## Transformation execution

Rendering keys and values uses Json's single traversal. It retains atomic publication and the total expansion bound,
including collision failures, and reaches values nested in tuples. Numbered paths and scalar conversion semantics remain unchanged.
Document syntax/format/selector errors are typed faults. Primitive document values use a cheaper validation path;
node/depth/cycle and mapping-key checks remain active.
