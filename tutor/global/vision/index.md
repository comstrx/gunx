# Vision

The arsenal: general, reusable, product-free engines and every project built over them, in one repository under one governance and one tutor. The name says it: a gun kills complexity; the X is the house mark of org tools. Its purpose is accumulated engineering capability: every real need in a product reveals a missing general capability; it is built once in the right engine, proven there, and every other product has it from then on. No project starts from zero; each starts above the one before it.

## The scale

This is not a side project and not a framework for demos. The arsenal is the invention the owner builds his company on: the engines will carry banks, exchanges, marketplaces and institutions whose balance sheets count in billions, products that run for years with hundreds of thousands of users, audited by people who read every line. The bar is set there and nowhere lower: a design is enterprise when it is the simplest thing that survives that scale, that audit and those years. Every session works as if its output ships to that client tomorrow.

## Layout

| Layer      | Folder                                                 | Owns                                                                                                                                                                        |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| engines    | `engine/{rust, python, go, bun, infra}`                | every technical capability, integration and shared mechanism, and the infrastructure framework; one engine per language; no client, business, brand, endpoint or UI library |
| tutor      | `tutor/`                                               | the contract of every agent and engineer, and the business of each product under `tutor/stack/product/<project>`                                                            |
| products   | `product/<project>/{api, infra, web, mobile, desktop}` | one folder per project: thin wrappers over the engines, its own business, data, identity and decisions inside its border                                                    |
| governance | the root                                               | ignore and scanner lists, workflows, docs, changelog, release and extraction                                                                                                |

Dependencies flow one way: a product imports its engines and is carried by `engine/infra`; an engine imports itself and its pinned libraries; no engine imports a product; fragments meet only through contracts (OpenAPI, env names, image tags, the desktop's native contract). A cycle is refused by a test.

## Engines

- **`engine/rust`**: the end goal, the fastest, broadest and easiest engine with a huge std DSL. It grows by reverse-engineering what proved itself.
- **`engine/python`**: the creative path and the answer for clients who refuse Rust: Sanic at the center, native cores (C, Rust, Zig, C++) wherever the lifecycle allows, measured to the fastest Python possible.
- **`engine/go`**: the cloud-native path, built for the future beside Rust: the language of operators, controllers, OpenTofu providers and CLIs. It owes no other engine its domains; its tool is `gox`.
- **`engine/bun`**: the TypeScript stdlib of every surface, runtime-agnostic (browser, Bun, Node, Hermes). It never imports Next, Expo or Electrobun: those belong to the surfaces.
- **`engine/infra`**: the infrastructure framework, not scripts: a Bash 5 bundle that takes a box from nothing to a running, monitored, backed-up stack and deploys without downtime; it also owns the kits: the distribution (`sync`) and the DSL the workflows call. Written once; a product customizes it with an `infra.toml` and env files in `product/<project>/infra`, and may extend it there with its own `src/` over the engine's entry.

**The workspace law.** Every engine is one workspace of pure members (crates, packages, modules) under `src/`, each importable alone, with one artifact at its root where the toolchain writes one (`target/`, `.venv`, `node_modules`; Go writes nothing into the tree), one lockfile, versions written only in the root manifest, and one facade member named `engine` under `src/engine` that re-exports every member and that no member imports; a member declares its dependencies by name and never a number. Beside `src/` every engine carries the same five proofs: `tests/`, `benches/`, `fuzz/`, an audit and a lint, each in the language's own tool (criterion and libFuzzer, hypothesis and pip-audit, fast-check and `bun audit`, Go's testing and govulncheck, the Bash harness), never a judgment in code. The shape is the same in every engine; Go's workspace is `go.work`.

**No mirror law.** Python is the engine in use today; Rust and Go are built for the future, each at its own pace with its own domains, verbs and faults. A domain proven in one engine is ported to another when a consumer there needs it, as a decision per domain, never as an obligation. What the engines share is the workspace law, purity, the adapter law and the security law, not their ladders.

**Engine purity.** No business, brand, contract, tenant, role, endpoint or product word, in sources or tests. No bias to a UI framework or a fragment's library. The bar: a stdlib easier than Laravel and broader than it, proven by measurement, never by words. Every engine carries adapters for database, cache, broker, queue, schedule, realtime, storage, mail, sms, gateway, domain and model families: every product is enterprise and uses the whole lifecycle.

## Tutor

`tutor/` is this folder: the contract of every agent and engineer, product-free in every file but `stack/product/<project>/`, where a product keeps its business and its preferences, when it needs to. It is not an engine: it travels whole into every product repository, and ships as the tool `skillx` minus every `stack/product/*`.

## Products

- Every project of his and of any company lives under `product/<project>` and develops only inside the arsenal. A project may have its own repository on any account: it receives a sync of all of the arsenal minus the other `product/*` and the other `tutor/stack/product/*`, nothing else; workflows are generic over `product/*`, so the same files run unchanged there on the one product left. One repository develops ten projects; any push runs every gate of every project.
- Every line under `product/` is a thin wrapper over the engines. A loop, retry, parser, format, protocol or provider call above an engine is a missing engine verb.
- `api/` is microservices by default: a `gateway`, an `iam`, and one service per business domain (DOMA: a domain owns every table that serves one business logic, never a service per table), a workspace with one unified contract and a gathered OpenAPI. A monolith only when the client asks for it in so many words. The language is Rust or Python per client; everything else about a product is the same.
- `web`, `mobile`, `desktop` are spec engines: one project per fragment emits every role as an independent product from `specs/<role>` (schema, config, brand) over `engine/bun` and the fragment's `src/`. Each product owns its own elements, components, features and `api/` contracts; sharing them across products is a loss of freedom, not a saving; repeating them is not duplication.
- `infra/` is the product's customization of `engine/infra`: its `infra.toml` and env files, and when the product needs more, its own `src/`, `tests/` and `benches/` whose `src/main.sh` sources the engine's entry and extends its DSL; never a second framework. The product's business lives in `tutor/stack/product/<project>/`, optional.

## The training loop

Real need → the owner of the mechanism (which engine, which domain) → the smallest general verb built there with its test → proven in use → every consumer benefits. "Training an engine" means exactly this engineering; no machine learning, no data shared between products. Ten products are ten production experiences, ten expert clients and ten business logics training the engines by calculation; a success in one product lifts all its siblings. The first round is the reverse: each engine is filled with every domain the owner names for it, so no product starts on an empty engine.

## ToolX

ToolX is the dream of years: the complete picture of building systems, extracted from real production rather than designed in a vacuum. Ten tools, read-only mirrors extracted and updated from the arsenal only: `rustx pyx gox bunx infrax` (the engines), `apix webx mobilex deskx` (the fragments of the house product), `skillx` (this folder minus `stack/product/*`). Issues and discussions on a tool come back as training of the engine; nothing is edited in a tool. One version `vX.Y.Z` across engines and products; one tag distributes the tools and the client products together, so every engine advance reaches every client; one sync DSL in `engine/infra` places a tool or a product locally or pushes it from CI (`global/arch`, `stack/engine/infra`).

## The house product

The owner's own product and the strongest one, named under `stack/product/`: a multi-tenant, multi-role, multi-product-type SaaS with `super admin vendor delivery client` on web, mobile and desktop, the living proof of one design system and one brand across every surface. The fragment tools are extracted from it whole, `specs/` included: it is the laboratory built for the tools, so nothing is held back. `apix` is in the language of its `api` (Python first, Rust when RustX is ready for production), proof of the engines before anything else. Its business lives in its own folder under `stack/product/`.

## Roles

The owner writes the laws, the skills, the contracts and the style, decides, and reviews every line without mercy. Agents write the code, the tests and the benches, inside these laws, as sessions with no human in the loop (`global/work`). Nothing here is a first attempt: one engine with many products, root governance, spec-driven surfaces and the audits, lints, tests, benches and workflows all went to production before; the arsenal gathers them in one place and replaces what came before it.

## Settled

Everything here is settled, and settled means fierce: a session defends these laws against habit, fashion and shortcuts, including its own. A change needs evidence that a decision is unsafe, impossible or inferior, raised as a question, never executed. Open items settle at implementation and are recorded in the part's memory.
