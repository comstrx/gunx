# Python engine

## Contract

An async-first, high-throughput Web/API engine with independently reusable capabilities. Optimize complete service paths for latency, throughput, safety and memory while keeping the consumer DSL predictable and comprehensive. Support monolithic and microservice applications without prescribing their business layout or deployment topology; command-line capabilities support operation of the engine.

## Structure

- `engine/python/pyproject.toml` is the uv workspace root, owns the version and external constraints and resolves `src/*` through one `uv.lock`.
- Use one uv environment and workspace lock; Hatchling builds the member distributions.
- The workspace contains domain distributions and the `engine` facade. Each `src/<domain>` distribution ships its own namespace portion at `src/engine/<domain>` with `py.typed`.
- Member manifests name what they import and read their version dynamically from the root. The facade’s namespace root extends the path and re-exports the domain packages.
- A domain has a flat package: `__init__.py` imports and exports without defining classes/functions; `arch.py` owns constants, patterns, dataclasses and loose helpers. Every other source file owns one class whose lowercase name matches its stem; no loose function lives there. `py.typed` is the declared non-source package marker.
- Read `tests/test_laws.py` and the domain tests before changing members or exports. Add or update the corresponding `benches/bench_<domain>.py` and `fuzz/fuzz_<domain>.py` coverage when the domain changes.
- The normal stage lives in `engine.test`; use the relevant service or exact wire fake. Keep fixtures independent of products.

## Rules

### Domain ownership

- Apply the selected language's hand style. Preserve the engine source law against print, eval and exec in ordinary sources; the existing test-member exception is scoped. Keep organizational laws distinct from formatter preferences.
- Keep explicit exports ordered as constants, classes, then other names, sorted within each group. The facade depends on all members; members never import it.
- Read the existing tested ladder. The foundation is error/context/log. Typed values and mechanics support I/O and state. Data, messaging and HTTP feed provider-facing integrations; fake and test live above.
- Each third-party entry point has one domain owner. Current examples are Sanic in `http`, aiohttp/yarl in `net`, orjson in `json`, msgspec in `validate`, Redis/hiredis in `cache`, broker drivers in `broker` and SQL/document drivers in `database`.
- Use the owning domain's parser, encoder, hash, identity, date, I/O or retry operation. Filesystem/path semantics remain with files; reusable text transformations belong to text. Improve the owning operation or its batching/preparation when delegation is costly, rather than copying its implementation into a caller.
- Keep expensive provider imports on the path that uses them when cold-start measurements justify it. Verify startup without the unused provider and surface errors at the owner.
- Reuse `Fault` and the closed `Code` set; normalize and report through `exception`, correlate through `context`, and emit structured diagnostics through `log`. Keep reason, source, retryability and unknown outcome semantics explicit; provider replacement must preserve this path.
- Record deliberate provider-type exposure at its owning public boundary. Add missing capabilities to the owner before extending that exposure.

### Lifecycle and production paths

- `http.App` composes routes, guards, middleware and lifecycle; `http.Response` owns the application envelope. Product handlers use the engine contract and do not bypass the response owner.
- Route outbound HTTP through `net`, with bounded bodies, checked destinations/redirects, pooled lifecycle and caller deadlines. Keep admission and transport-level limits separate.
- Route blocking work through `thread.offload`, real compute through the appropriate `thread.compute` mode, and owned background work through the tracked task lifecycle. Reuse the engine’s bounded fan-out and admission utilities.
- Verify the execution owner's admission, queue and completion accounting for the selected mode. Per-call worker limits and process-local pools do not establish a service-wide ceiling; compose budgets across calls, workers and replicas. Apply the language's cancellation semantics to the underlying worker, not only its awaiting task.
- Keep worker initialization and readiness within the service lifetime. Count all workers when budgeting memory, connections, outstanding tasks and compute capacity.
- Use `database` for dialect rendering, pool/session lifecycle, migrations, outbox and adapter capability checks. Services supply every table/ledger identity and definition, including schema blueprints supplied by a capability; the engine owns no implicit product table.
- Preserve reliable delivery under an unknown external outcome. Test idempotent replay, recovery, typed unavailability and rollback before adding automatic retries or backoff.
- Preserve stage wire facts for headers, envelope, retries, errors and product-specific inputs. Match wire behavior before comparing optimized internals.

### HTTP integration

- App owns server binding, request construction and registration of routes, channels, public files and docs. Seal prepares this composition before traffic; no second registration mechanism is needed above the engine.
- Product consumers register the engine's Route, Group, Channel and lifecycle objects. Binder builds signature-based path/query/body binding at registration.
- Edge owns trace, down/preflight, actor, throttle, guards, handler, rendering and stamping, including early returns. Give each policy one execution point; cover alternate HTTP/upgrade paths before removing an apparently duplicate framework hook.
- Response owns envelopes, plain data, redirects, files, streaming and SSE; preserve the consuming part's wire contract.
- Keep request/response and server-access compatibility explicit in the HTTP facade. Consumers use its declared DSL; framework exposure and changes to it require deliberate compatibility treatment.
- App.serve owns worker/process and loop selection through the chosen language/library contracts. Verify the selected target and startup path instead of teaching one process context as universal.
- App.lifecycle owns worker-local acquisition, readiness and reverse teardown, including partial startup. The library skill owns listener mechanics.
- App.ready, App.down and in-memory settings are process-local; cross-worker coordination needs a declared mechanism.
- App.listen is the embedded real-wire fixture and owns its endpoint lifecycle. The library's serving-mode evidence rules still apply.
- Limits owns supported request/response and connection controls. Map each control to its effective framework boundary; account separately for handler admission, long-lived streams and upgraded connections.
- Preserve hidden docs/probe behavior and upgrade guards; neither framework registration nor its internal Blueprint replaces engine policy.

### Consumer capability review

- Apply the shared engine evolution contract to a complete service use case. Classify required behavior as supported, partial, absent or deliberately unsupported from callable behavior, not exported-name counts or a framework checklist.
- Walk representative journeys through the relevant HTTP, validation, identity, data, cache, durable work and integration owners. Select only the capabilities the use case requires; product rules remain outside the engine.
- Check whether the ordinary task is concise and the demanding case remains expressible: defaults, optional values, bulk/streamed data, failure handling and recovery must compose through the public DSL. Requiring SDK access or repeated caller plumbing can expose a missing capability.
- Map each gap to its owner and consumer consequence. Extend an existing verb, parameter, prepared plan or adapter when sufficient; create a member for a distinct responsibility, never to meet a count.
- Judge facade ease and runtime cost together: compare consumer steps with calls, allocations, copies and I/O beneath them. Internal complexity must solve an identified problem and stay behind a stable boundary.

### Integration selection

- Apply root's dependency policy and the language's build/ABI requirements. Compare candidate Python libraries through the same engine operation, including normalization and error mapping; native implementation or popularity alone does not establish a win.
- Examine callback frequency, object conversion, per-call setup and available bulk/streaming operations before replacing a library. The bottleneck may be the adapter's use of it.
- Keep orchestration, lifecycle and public values at their engine owner. Provider capabilities and substitution semantics follow the shared engine contract; SDK convenience must not redefine the DSL.
- Keep the current adapter when no alternative demonstrates a meaningful advantage under required behavior. An unresolved comparison stays unresolved; do not turn an untested recommendation into a dependency decision.

### Boundary enforcement

- Value objects and settings reject invalid construction through the owning fault contract; strict shape parsing names unknown fields and preserves fillable/hidden-field controls. Reject Boolean inputs where the contract requires an integer; bool being an int subclass is not permission to accept it.
- The owning egress mechanism validates both resolved and dialed destinations, every redirect and credential forwarding. Private targets require explicit integration policy; a checked URL string alone is insufficient.
- Lease/lock renewal and release use ownership tokens; a stale owner cannot release its successor. OTP consumption and attempt accounting retain atomic, subject-scoped semantics.
- Preserve the existing password, token, relay-signature, encryption/key-rotation and production-setting checks. Caller headers cannot substitute for verified actor/tenant/request context; production cannot silently inherit laboratory secrets or endpoints.

### Transaction and isolation edges

- A serialization/deadlock retry restarts the complete transaction with a bounded budget; do not retry an isolated failed statement in an aborted transaction.
- Treat commit-time disconnect as an unknown outcome; reconcile by operation identity before repeating side effects.
- Reset tenant/session state on pooled return. Validate RLS using non-owner roles; owners, superusers and BYPASSRLS are not isolation proof.
- Separate publisher confirmation from consumer acknowledgement and business completion. Reconnect restores declared topology/subscriptions once and tolerates redelivery.

### Capability map

| Concern                               | Existing owner family to inspect                             |
| ------------------------------------- | ------------------------------------------------------------ |
| Faults, trace context, diagnostics    | error, exception, context, log, metric, health               |
| Bounded work and temporal execution   | thread, queue, schedule, stream                              |
| Transport and live communication      | net, http, socket, broadcast                                 |
| Durable state and delivery            | database, cache, broker, event                               |
| Files, blobs and provider integration | fs, storage, mail, sms, notify, gateway                      |
| Identity and untrusted values         | auth, token, crypto, validate, parse                         |
| Domain and external intelligence      | domain, search, ai, rag and their existing provider adapters |

This is an ownership index, not a dependency ladder or claim that every provider is complete. Read the domain's actual exports and law tests.

### Packaging and target evidence

- Keep namespace portions and their declared dependency closure independently installable. Check built distributions and consumer imports, not only editable workspace paths. Confirm which installed module a packaging test imports; a working-directory or path injection can accidentally test checkout code.
- Resolve optional provider wheels and extras for each supported Linux/macOS/Windows interpreter target. A skipped provider is unavailable evidence, not a passing integration.
- Keep process/event-loop differences at the execution or HTTP owner using the selected language/library contracts. Public DSL semantics must remain stable.
- Fixtures own their ports, temporary paths, credentials, clients and teardown. Random order exposes leaked state; repeating until green does not repair it.
- Test providers and real integrations share the public error, cancellation and lifecycle contract. Use exact wire/real service evidence where a mock cannot represent provider behavior.

## Proof

- Use pytest with the workspace's randomized order, warnings policy and time limits.
- Cover independent namespace imports, shared metadata, explicit exports, responsibility ownership and directed dependencies.
- Behavioral coverage includes public contracts, typed failures, timeouts, cancellation, cleanup, disabled capabilities and interrupted delivery.
- Prove composed consumer journeys as well as individual members: typed input through binding, provider access, output and cleanup. Exercise retry, cancellation and failure across the member boundary where their guarantees interact.
- Apply the shared engine's evidence design and root measurement contract. Select adversarial cases that can expose the claimed defect; test, benchmark and fuzz file counts are inventory, not an adequacy score.
- Compare representative workloads with equivalent behavior, recording latency, throughput, memory and CPU across workers and pools. A component improvement must be re-evaluated in the complete service path before claiming an engine-wide gain.
- Keep tests, measurements and failure exploration with their capability; choose appropriate methods within the owner's task and timing.

## Sources

- Repository evidence lives in `engine/python/pyproject.toml`, `engine/python/tests/test_laws.py`.
- [CPython releases](https://www.python.org/downloads/) · [uv workspace contract](https://docs.astral.sh/uv/concepts/projects/workspaces/) · [PEP 420](https://peps.python.org/pep-0420/)

[Flaky-test causes](https://docs.pytest.org/en/stable/explanation/flaky.html) · [Installed-package tests](https://docs.pytest.org/en/stable/explanation/goodpractices.html).

## Routing

For HTTP lifecycle, routing, inbound wire or serving work, read the [library dispatcher](../../lib/index.md) with Sanic selected. For work that has no Sanic boundary, read the [language dispatcher](../../lang/index.md) with Python selected. Return here for package ownership and inspect the relevant code and proofs.
