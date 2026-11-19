# Infrastructure part

## Contract

A product infrastructure part owns operational configuration and product-specific composition. It consumes the selected engine's general mechanisms without copying their implementation.
The product owns environment values, identity and operational choices; the engine owns reusable infrastructure and distribution capabilities.

## Structure

| Location                  | Responsibility                                                           |
| ------------------------- | ------------------------------------------------------------------------ |
| Product manifest          | Product metadata, supported stack choices and distribution configuration |
| .env.example              | Setting names and neutral examples                                       |
| Selected environment file | Private values for that environment                                      |
| src/main.sh               | Optional consumer entry                                                  |
| src/app                   | Optional product-specific composition over engine capabilities           |
| tests, benches            | Relevant consumer contracts and measurements                             |

Manifest spelling and schema belong to the selected engine; the product owns its actual environment values.
Application concerns follow the framework's flat structure; a product does not define another framework.

## Rules

### Configuration and composition

- Start with supported configuration. Add source for genuine product composition; put missing general mechanisms in the responsible engine.
- Use the engine's public DSL and registry. Do not patch or duplicate core, config or module implementations.
- Keep secrets private and out of arguments, logs, distributable artifacts and documentation. Inject required runtime secrets through the supported restricted channel; any private generated credential file retains explicit ownership, access and cleanup. Examples contain neutral values.
- Environment selection is explicit. Product settings do not silently replace framework identity, dependency ownership or unrelated product state.
- Keep orchestration reusable and product policy local. A new environment or target is normally data, not a copied command tree.
- Extend manifest capabilities coherently before relying on new fields; do not pretend an unsupported field is implemented.
- Preserve root governance and the selected engine's naming, structure and dependency contracts.

### Application integration

- Maintain the supported application-to-deployment contract with the consuming part: setting name/type, required or conditional status, source, destination and build-time versus runtime availability. Introduce a required production setting and its provisioning path together.
- Use the framework's configuration/derivation and rendering semantics. The product supplies values and integration choices, not a second precedence chain; undeclared overrides must not replace engine-owned or derived settings.
- Give optional integrations an explicit enabled/disabled policy. A credential's accidental presence or absence must not silently turn a required feature into an optional one.
- Choose service profiles, network exposure, background-worker and scheduler ownership explicitly. Count each process's resource budget and avoid duplicate recurring work when both embedded and standalone execution are available.
- Declare public client configuration separately from server secrets. The selected surface library owns when values become fixed in an artifact; deployment must honor that boundary.
- Map edge-to-service trust deliberately: trusted proxy identities, forwarded client metadata and direct-ingress exposure must agree. An untrusted forwarded header cannot establish client identity; no universal first-hop rule fits every proxy chain.
- Product policy selects retention, backup destinations, recovery objectives, readiness criteria and rollout constraints. The engine implements the mechanisms; a product-specific requirement cannot be inferred from a generic template.

### Operation and distribution

- Describe the actual environment, intended change, failure behavior and recovery path before a consequential operation.
- Respect shared services and other sessions. A product task does not authorize restarting unrelated infrastructure.
- Migration, deployment, publication and Git writes retain their owner-defined authority.
- Target names, repositories and extraction choices come from product configuration.
- Exclude unrelated products and private environment values from distribution; retain required shared contracts and specifications.
- Separate preparation, verification, placement and publication. State destination changes and uncertain outcomes honestly.
- Do not weaken checks to make packaging succeed. Preserve recovery information until the relevant operation is complete.
- A successful build does not establish operational readiness, deployment success or restoration capability.

### Development environment

- Resolve configured service endpoints and available native/remote providers for the assigned host. Do not assume localhost services or add containers, emulators or replacement infrastructure as incidental work.
- Test resources are explicitly owned and isolated by database/schema, Redis namespace/database and broker queue. Customer data is not a fixture.
- Apply work's ownership policy and IPC's collaboration contract when a needed engine capability is outside the assignment.

## Proof

Cover accepted settings, environment separation, missing and hostile values, package boundaries and failure recovery.
Operational conclusions name what actually happened; code inspection and intended configuration do not substitute for it.

## Sources

The selected product's manifests and the engine's public configuration, composition and distribution contracts.

[Proxy identity boundaries](https://nginx.org/en/docs/http/ngx_http_realip_module.html). This is one integration reference, not a required edge provider.

## Routing

Continue through [engines](../../engine/index.md) with this part and the inherited product preferences and implementation context.
