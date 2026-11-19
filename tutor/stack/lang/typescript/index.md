# TypeScript

## Contract

Own TypeScript semantics, typing, hand style and JavaScript runtime fundamentals. Workspace and library choices belong to their responsible guides.

## Structure

The owning engine or part defines workspace layout, runtime targets and build boundaries. Manifests and lockfiles carry installed versions; this guide defines source and type-system behavior.

## Rules

- Use strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and verbatimModuleSyntax. Validate unknown inputs at boundaries; assertions are not validation.
- No any, non-null assertion, unused binding, parameter reassignment or unvalidated cast. Direct console access is confined to the owning integration’s approved logging boundary. Use import type and satisfies; lint exceptions are scoped and explained. Prefer an explicit options type when the existing contract warrants it.
- Hand style: four-space indentation, double quotes, semicolons, trailing commas on multiline literals, 150-column target and extensions on relative imports. No formatter replaces it.
- Space definitions and conditions inside parentheses; calls are tight. Group statements into paragraphs. Export types, then constants and helpers, then functions. Relative imports do not cross a member or layer.
- Prefer const and precise public types. Map failures to the owning contract and never swallow rejected promises.

### Boundaries and runtime

- Model input as unknown, then validate wire, URL, environment, storage and RPC at their boundaries. Optional and present undefined are different; indexed access may be absent. Casts and generics do not validate runtime values.
- Model exclusive states and closed faults as discriminated unions; keep the owning capability’s operation and failure contract visible in the types.
- Ambient types do not establish runtime availability. Use the actual target's module and global contracts.
- Untrusted property names must not traverse or mutate prototypes during lookup, assignment or recursive merge. Use own-property checks and a suitable key container; parsed JSON and static object types do not make a later merge safe.
- Do not invoke an object's potentially replaced hasOwnProperty method to establish ownership. Preserve deliberate absent, undefined, null and inherited-property distinctions at the boundary.

### Hand style

```ts
import type { Input } from "./input.ts";

export type Answer = { value: string };

export function read ( input: Input ): Answer {

    if ( !input.value ) return { value: "" };

    return { value: input.value };

}
```

### Text and numeric domains

- String length and indexing count UTF-16 code units; iteration yields code points, not user-perceived graphemes. For grapheme contracts use supported segmentation and preserve whole clusters, including in suffixes and intermediate boundaries.
- Later transformations can invalidate an earlier safe boundary. trim/trimEnd operate on whitespace code points and may split a mixed cluster containing whitespace; a whole-grapheme contract trims only complete qualifying clusters. Resolve any resulting compatibility change explicitly.
- Intl.Segmenter behavior follows the runtime’s supported locale/Unicode data. An absent segmenter must not silently turn a grapheme promise into code-point splitting; select an explicit supported fallback or unavailable contract.
- Record runtime Unicode/ICU data when claiming segmentation conformance. A hand-maintained fast path must preserve the selected segmentation contract across its supported input domain; a few emoji examples do not establish equivalence. Grapheme counts do not measure rendered pixel or terminal-cell width.
- A display-length limit does not bound encoded bytes: one cluster can contain many code points. Apply byte/input ceilings separately through the owning contract.
- Public numeric parameters define finite/non-finite values, integer conversion, bounds and units. Type number alone excludes none of NaN, infinities or fractions; normalize before early returns and dependent allocations.

### Incremental text processing

- A lazy iterator avoids collecting all matches only while its consumer remains incremental; spreading it or normalizing the entire source first defeats that bound. Inspect both producer and consumer costs. When only the existence of another token matters, avoid consuming its full contents merely to decide truncation.
- Global or sticky regular expressions carry lastIndex state. Native matchAll clones the matcher but starts from its current lastIndex; reuse must not make one call depend on an earlier call.
- Match records and iterators retain their input. Keep only needed values and release iteration state after completion; a word budget alone does not cap a single word or the input bytes.

### Scheduling

- Promise.all aggregates supplied work without a concurrency limit. Calls that create promises may already start it; bound production before collecting an unbounded input. Rejection does not cancel sibling operations.
- AbortController signals cancellation only to cooperating operations. Remove listeners and settle owned promises on teardown.

### Compiler and platform boundaries

- Verify the latest stable compiler's migration notes before updating a pin; match editor and build checker semantics. A newer compiler may change defaults or remove options.
- Select module/moduleResolution for the actual consumer: bundler resolution and Node-style resolution have different extension and export behavior. A development alias is not automatically valid in emitted JavaScript or declarations.
- Match target and lib declarations to supported runtimes. Type declarations describe APIs; they do not install polyfills or make a host API available.
- Keep import casing exact across Linux, macOS and Windows. Use consistent-casing diagnostics and avoid filenames that collide on case-insensitive filesystems.
- Isolate host filesystem paths and process invocation from portable values and URLs. Do not infer permissions, signals or executable availability from successful type checking.
- Ensure published declaration imports resolve in supported consumer configurations; validate emitted artifact contracts rather than only workspace source imports.

### Cost and asynchronous behavior

- Cancellation requested, timeout reported and operation settled are different states. Keep an owner for outstanding work and its possible effects after the caller stops waiting.
- Watch retained ArrayBuffer backing stores, closures, listeners and caches; fewer allocations can still retain more memory.
- Profile repeated real interactions on the target engine. Warm JIT behavior, cold startup and deoptimized paths answer different questions; preserve error and validation semantics in comparisons.

### Type-level cost

- Include checker/editor time and declaration size when assessing a public DSL. Deep conditional recursion, huge unions and repeated intersections can make a short call site expensive to compile.
- Name reusable complex types and public return contracts where this improves diagnostics and avoids repeated inference. Choose interfaces or aliases for their actual semantics and measured checker behavior, not a universal speed claim.
- Reduce accidental source inclusion and ambient type packages before weakening checks. Keep runtime, test and tooling environments distinct without hiding consumer errors.
- Profile the installed compiler: performance advice for an older compiler may not hold for a new implementation. Runtime throughput and type-checking throughput are separate results.

### Declaration build choices

- isolatedDeclarations requires sufficiently annotated exports for independent declaration generation. It does not change runtime behavior or make an emitter a type checker. Adopt it when the declaration pipeline benefits, accounting for annotation effort, supported syntax and consumer resolution.

### Explicit disposal

- using and await using bind cleanup to lexical lifetime; await using awaits asynchronous disposal. They do not cancel unrelated work or make resources safe to use after scope exit. Do not return a handle whose owning scope is about to dispose it.
- Acquisitions dispose in reverse order, including on abrupt exit. When both work and cleanup fail, preserve the SuppressedError chain rather than replacing the original failure with a generic cleanup message.
- Syntax support, type declarations and runtime disposal symbols/helpers are separate requirements. Check every selected browser/native/server runtime and emitted code path; choose an equivalent explicit lifecycle when the target cannot support the feature.

## Proof

Separate type checking from runtime behavior. Isolate shared fixtures and examine malformed inputs; execution follows the assigned work. Consider project references only for measured build or editor pressure and account for composite declarations and build order.

## Sources

[Text segmentation](https://tc39.es/ecma402/#sec-intl.segmenter) · [Grapheme boundaries](https://www.unicode.org/reports/tr29/).

[Strict](https://www.typescriptlang.org/tsconfig/strict) · [Project references](https://www.typescriptlang.org/docs/handbook/project-references).

[Compiler release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) · [Module resolution](https://www.typescriptlang.org/tsconfig/moduleResolution) · [Consumer compiler options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options) · [Import casing](https://www.typescriptlang.org/tsconfig/forceConsistentCasingInFileNames.html).

[TypeScript compiler performance](https://github.com/microsoft/TypeScript/wiki/Performance) · [Promise aggregation semantics](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.all) · [JavaScript prototype hazards](https://nodejs.org/en/learn/getting-started/security-best-practices#prototype-pollution-attacks-cwe-1321).

[RegExp iteration semantics](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp-prototype-matchall).

[Whitespace trimming semantics](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.trimend).

[Isolated declarations](https://www.typescriptlang.org/tsconfig/isolatedDeclarations.html) · [Tradeoffs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#isolated-declarations).

[Explicit resource management](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html).

## Routing

Arrive through the language dispatcher after the selected library or direct framework-free engine work. Return to the caller after study. A reading route grants no code import.
