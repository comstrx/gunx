# Vision

The arsenal: general, reusable, product-free engines and every project built over them, in one repository under one governance and one tutor. The name says it: a gun kills complexity; the X is the house mark. Its purpose is accumulated engineering capability: every real need in a product reveals a missing general capability; it is built once in the right engine, proven there, and every other product has it from then on. No project starts from zero; each starts above the one before it.

## The scale

This is not a side project and not a framework for demos. The arsenal is the invention the owner builds his company on: the engines will carry banks, exchanges, marketplaces and institutions whose balance sheets count in billions, products that run for years with hundreds of thousands of users, audited by people who read every line. The bar is set there and nowhere lower: a design is enterprise when it is the simplest thing that survives that scale, that audit and those years. Every session works as if its output ships to that client tomorrow.

## Layout

| Layer      | Folder                                                 | Owns                                                                                                                     |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| engines    | `engine/{rust, python, go, bun, infra}`                | every technical capability, integration and shared mechanism, and the infrastructure framework; one engine per language  |
| tutor      | `tutor/`                                               | the contract of every agent and engineer, and the business of each product under `stack/product/<project>`               |
| products   | `product/<project>/{api, infra, web, mobile, desktop}` | one folder per project: thin wrappers over the engines, its own business, data, identity and decisions inside its border |
| governance | the root                                               | ignore and scanner lists, workflows, docs, changelog, release and extraction                                             |

Dependencies flow one way: a product imports its engines and is carried by the infrastructure engine; an engine imports itself and its pinned libraries; no engine imports a product; fragments meet only through contracts (OpenAPI, env names, image tags, the desktop's native contract). A cycle is refused by a test.

## Engines

- **Rust**: the end goal, the fastest, broadest and easiest engine with a huge std DSL.
- **Python**: the engine in production use today, the creative path and the answer for clients who refuse Rust, measured to the fastest Python possible.
- **Go**: the cloud-native path, built for the future beside Rust: operators, controllers, OpenTofu providers and CLIs. It owes no other engine its domains.
- **Bun**: the TypeScript stdlib of every surface, runtime-agnostic (browser, Bun, Node, Hermes). It never imports a surface framework: those belong to the surfaces.
- **Infra**: the infrastructure framework and the tool of the repository: a Bash 5 bundle that owns the gate of every part, the distribution and, tomorrow, the box from nothing to a running stack; a product customizes it with data.

**The workspace law.** Every engine is one workspace of pure members (crates, packages, modules) under `src/`, each importable alone, with one artifact at its root where the toolchain writes one, one lockfile, versions written only in the root manifest, and one facade member named `engine` under `src/engine` that re-exports every member and that no member imports; a member declares its dependencies by name and never a number. Beside `src/` every engine carries the same five proofs, each in the language's own tool, never a judgment in code.

**No mirror law.** Python is the engine in use today; Rust and Go are built for the future, each at its own pace with its own domains, verbs and faults. A domain proven in one engine is ported to another when a consumer there needs it, as a decision per domain, never as an obligation. What the engines share are the laws below, not their ladders.

**The engine laws**, the same in every language:

- **Purity:** no business, brand, contract, tenant, role, endpoint or product word, in sources or tests; no bias to a UI framework or a fragment's library; no configuration inside the engine. A test asks "would this survive deleting every product?".
- **Final wrapper:** every library and every network, file, process, database, broker and model access lives in the engine; no library type crosses a facade. Hiding a library means owning its semantics, errors and options, never re-exporting aliases.
- **One fault:** `Fault(code, reason, message, errors)` over a closed code set, raised by the engine alone; reasons unique across the engine; a part reuses engine faults and declares its own.
- **Layers:** the domains form a DAG with the log and the fault at the floor; a cycle is refused by a test. A verb lives in exactly one domain; a second retry, slug, encoder, client or cache is a defect.
- **Visibility:** narrower than public by default; every public item has a caller or a contract test; the public surface is recorded and a change to it is a decision.
- **Worth:** a verb is judged by its own correctness, proof and design, never by how many parts call it; an export no product uses yet is not a burden, a risk or a candidate for removal.
- **Adapters:** everything with more than one provider is one DSL per family (`database cache broker queue schedule socket storage mail sms gateway domain model`) with an adapter per provider chosen in code and declared capabilities; an unsupported capability is a fault before any I/O, never a silent skip; a log, memory or mock provider for tests, the real one proven against the service or its exact wire; a new provider is one more file.
- **Outbox and recovery:** a side effect that must survive the request is written in its transaction and delivered at least once by a relay; dead pooled connections are replaced at checkout; an outage is a typed unavailable fault; the stage can cut a real service mid-operation.
- **Security:** input validated at the boundary, secrets redacted in every log, paths confined, uploads policed, archive bombs bounded, SSRF-safe egress, timeouts on every I/O, bounded readers on every body, tenant isolation as a second wall in the database.
- **Stage:** the engine carries its own reference application, provisioning, clients, samples and bench, so tests and benches need no product.

The bar: a stdlib easier than Laravel and broader than it, proven by measurement, never by words. Every product is enterprise and uses the whole lifecycle.

## Products

- Every project of his and of any company lives under `product/<project>` and develops only inside the arsenal. A project may have its own repository on any account: it receives a sync of the whole arsenal minus the other `product/*`; workflows are generic over `product/*`, so the same files run unchanged there. One repository develops ten projects; a push gates what moved and everything built on it.
- Every line under `product/` is a thin wrapper over the engines. A loop, retry, parser, format, protocol or provider call above an engine is a missing engine verb.
- `api/` is a workspace of services in the client's language, Rust or Python; everything else about a product is the same. `web`, `mobile` and `desktop` are spec engines: one project per fragment emits every role as an independent product from its spec over the Bun engine. `infra/` is the product's data over the infrastructure engine. A fragment owns its elements, components, features and contracts outright; sharing them across products is a loss of freedom, not a saving; repeating them is not duplication.

## The training loop

Real need → the owner of the mechanism (which engine, which domain) → the smallest general verb built there with its test → proven in use → every consumer benefits. Ten products are ten production experiences, ten expert clients and ten business logics training the engines by calculation; a success in one product lifts all its siblings. The first round is the reverse: each engine is filled with every domain the owner names for it, so no product starts on an empty engine.

## ToolX

ToolX is the dream of years: the complete picture of building systems, extracted from real production rather than designed in a vacuum. Ten tools, read-only mirrors extracted and updated from the arsenal only: `rustx pyx gox bunx infrax` (the engines), `apix webx mobilex deskx` (the fragments of the house product), `skillx` (this folder). Issues and discussions on a tool come back as training of the engine; nothing is edited in a tool. One version `vX.Y.Z` across engines and products; one tag distributes the tools and the client products together, so every engine advance reaches every client.

## The house product

The owner's own product and the strongest one, named under `stack/product/`: a multi-tenant, multi-role, multi-product-type SaaS with `super admin vendor delivery client` on web, mobile and desktop, the living proof of one design system and one brand across every surface. The fragment tools are extracted from it whole, `specs/` included: it is the laboratory built for the tools, so nothing is held back. `apix` is in the language of its `api` (Python first, Rust when the Rust engine is ready for production), proof of the engines before anything else.

## Roles

The owner writes the laws, the skills, the contracts and the style, decides, and reviews every line without mercy. Agents write the code, the tests and the benches, inside these laws, as sessions with no human in the loop. Nothing here is a first attempt: one engine with many products, root governance, spec-driven surfaces and the audits, lints, tests, benches and workflows all went to production before; the arsenal gathers them in one place.

## Settled

Everything here is settled, and settled means fierce: a session defends these laws against habit, fashion and shortcuts, including its own. Open items settle at implementation and are recorded in the part's memory.
