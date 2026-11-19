# API part

## Contract

A product-owned backend over the selected engine. Product domains own business behavior and data; this guide owns backend composition and transport contracts, not one mandatory deployment topology.

## Structure

Select the topology from product requirements and the existing deployment contract: a modular monolith or domain-oriented services. Separate domain responsibility from process/deployment boundaries. A gateway or identity service exists when that topology needs it; neither is a prerequisite for every backend.
The selected ecosystem owns manifests and package layout. The part composes domain behavior, persistence, transport binding, startup and teardown over engine capabilities.

## Rules

- For microservices, use DOMA: a service owns a cohesive business domain, not one table. For a monolith, preserve domain ownership without inventing network boundaries. The product owns the topology decision; preserve an existing topology during unrelated work.
- Calls follow the declared dependency DAG. Separately deployed services do not import each other’s internals or query each other’s private data. Define actor, scope, input, output, revision, idempotency and failure semantics at their contracts. Within a monolith, domain imports and database constraints follow its explicitly owned boundaries.
- Where a gateway is selected, it owns ingress and verified identity propagation. Every protected operation still authorizes access at its data owner; database isolation complements that check.
- Keep domain behavior, query ownership, transport validation, presentation and bootstrap distinct. The selected implementation defines their files and allowed edges; avoid layers that merely forward calls. Complex business decisions remain product-owned.
- Validate requests and carry trusted context. Repositories own queries, resources shape output, services coordinate business, and controllers and routes bind the contracts.
- Bind implementations and provider choices at explicit composition roots. The engine must not discover product folders or infer models, routes and policies from private naming; changing product organization should not require changing general capabilities.
- Keep model predicates, multi-step business decisions and domain-specific validation with the product. A repository may need several queries; coordinate their atomicity through the transaction owner rather than forcing one-chain methods or bypassing the engine.
- For callbacks/webhooks, supply the required untouched input to the engine's verifier and normalizer, then apply product transitions to verified values. Acknowledge only at the chosen acceptance boundary; duplicate handling and recovery use the engine's provider contract.
- Use forward migrations and enforce actual invariants in the database. Bound lists, avoid N+1 and keep transactions short. When a mutation requires durable external delivery, commit its delivery intent atomically through the selected outbox or equivalent mechanism; an ordinary local change does not automatically need an event.
- Handle duplicate and reordered events, timeouts and safe retries. Keep remote business-service calls outside local database transactions; coordinate required delivery through the owned durable-intent mechanism. Verify identity, TLS and internal boundaries for the deployment.
- The API producer owns its authoritative contract: status, media, schemas, failure representation, authentication, authorization context, pagination, correlation and compatibility. Preserve the selected engine response/client integration; do not duplicate its encoder or impose a new envelope.
- Authentication is selected by the actual trust boundary. A bearer header, session cookie, signed request or mutually authenticated transport has different lifecycle and threat assumptions; none is universal. Retain authorization, credential protection and anti-forgery requirements for the selected mechanism.
- Respect HTTP method/status semantics: HEAD and no-content responses do not gain a JSON body; files, streams and negotiated media retain their representation. Problem Details is an optional error format, not an automatic migration from an existing contract.
- Generate truthful API descriptions where that transport supports them; match schema and response behavior, including early errors and streaming. Localization belongs to the selected consumer contract, not a mandatory bilingual payload.
- Product business determines monetary and temporal policy; prove race-sensitive uniqueness, allocation and effects. Examples stay neutral and providers remain explicit choices.

### Operational lifecycle

- Declare startup dependencies and unwind only acquired resources on failure. Worker-local resources, one-time release actions and recurring jobs have distinct owners; adding a worker must not silently repeat migrations, seeding or scheduled work.
- Keep migration and seed execution explicit under the release contract. Warm only selected safe paths within startup budgets; required warmup gates readiness, while optional warmup cannot hide dependency failure or trigger business mutations.
- Keep engine proofs beside their capability and product journey proofs beside business behavior. A reusable engine test helper must not import product fixtures or encode a product's response policy.
- In message-driven services, selected outbox, inbox and idempotency mechanisms make commit and delivery explicit; one request does not imply a cross-service transaction.
- For an idempotent guarded mutation, validate actor/scope, check the required revision and coordinate local effects at the owning transaction boundary. Reuse its request identity on retry. Ordinary reads and local mutations do not acquire unrelated messaging or revision requirements.
- Health and readiness reflect dependencies without leaking secrets. Bound body reads and lists, redact credentials and propagate request IDs. Generate contracts from actual routes.
- Actual services, transitions, providers and journeys are product decisions; unknown policies stay unknown.
- Define the service’s aggregate connection, request, body and downstream capacity budgets; the selected engine and transport library implement their protocol-specific controls.
- State the client-to-edge and edge-to-service protocols separately. Verify negotiated HTTP/2 at the required hop; native HTTP/3 remains demand-led, never inferred from an edge advertising it.
- Declare permitted outbound services and redirect policy through the engine’s egress contract. Include private/internal targets only where the intended integration authorizes them; a blanket private-network ban must not break legitimate service composition.

## Proof

Cover relevant journeys through the actual ingress, malformed inputs, authorization, tenant isolation, duplicate delivery and recovery. Preserve truthful contracts and representative performance expectations without prescribing an execution command.

## Sources

[HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html) · [Optional problem details](https://www.rfc-editor.org/rfc/rfc9457.html) · [HTTP/2](https://www.rfc-editor.org/rfc/rfc9113.html) · [SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) · [OpenAPI](https://spec.openapis.org/oas/latest.html) · [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Routing

Continue through [engines](../../engine/index.md) with this part and the inherited product preferences and implementation context.
