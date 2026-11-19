# Tree

## Contract

Own the project's structural map, path vocabulary and the meaning of each level.
Vision explains purpose; architecture explains relationships and laws. This map explains where things belong.

## Structure

### Project

```text
<project>/
├── AGENTS.md                 entry to approved knowledge
├── engine/                   shared, product-independent engines
│   └── <engine>/             engine workspace and its owned capabilities
├── product/                  independent consumers
│   └── <product>/
│       ├── api/              backend part
│       ├── web/              browser and desktop part
│       ├── mobile/           mobile part
│       └── infra/            operational configuration and composition
├── tutor/                    approved knowledge and collaboration spaces
├── .github/                  repository automation and governance
└── <root files>              repository-wide metadata and policies
```

The source directory is `product/`, singular. A product includes only its applicable parts.
This is a structural map, not an approved product list, member inventory or package count.

### Engine coordinates

All code paths are relative to the project root; knowledge paths are relative to Tutor.

| Engine identity | Current source       | Knowledge specialization           |
| --------------- | -------------------- | ---------------------------------- |
| bash            | `engine/bash/`       | `stack/engine/bash/index.md`       |
| typescript      | `engine/typescript/` | `stack/engine/typescript/index.md` |
| go              | `engine/go/`         | `stack/engine/go/index.md`         |
| python          | `engine/python/`     | `stack/engine/python/index.md`     |
| rust            | `engine/rust/`       | `stack/engine/rust/index.md`       |

Each engine identity names its directory. Reading this map does not rename code.
Names identify implementations; language mechanics and library behavior are taught by their own skills.

### Tutor

```text
tutor/
├── index.md                  entry and learning protocol
├── root/
│   ├── index.md              mandatory foundations and activity routing
│   ├── vision/index.md       purpose and strategic intent
│   ├── tree/index.md         this map, paths and vocabulary
│   ├── arch/index.md         ownership and architectural relationships
│   ├── work/index.md         assignments, authority and communication
│   └── memory/index.md       thin memory wrapper
├── stack/
│   ├── index.md              engineering-family dispatcher
│   ├── product/              brand, business and optional preferences
│   ├── part/                 product-independent part architecture
│   ├── engine/               engine composition and capability ownership
│   ├── lib/                  library-specific knowledge
│   └── lang/                 language knowledge and hand style
├── mcp/index.md              semantic commands and focus
├── ipc/index.md              live collaboration contract
└── history/
    ├── index.md              historical writing conventions
    ├── report/index.md       meaningful lessons reports
    └── track/index.md        completed IPC archives
```

Each knowledge directory exposes its own `index.md`; IPC arenas and historical record folders follow their respective writing contracts. Category dispatchers register their direct children; this map does not duplicate their catalogues.

### Product knowledge

```text
stack/product/<product>/
├── index.md                  product entry
├── brand/index.md            identity and presentation decisions
├── business/index.md         actors, workflows and business requirements
└── fragment/                 optional product-specific preferences
    ├── index.md              customization dispatcher
    └── <part>/index.md       optional specialization of a general part
```

Code `product/<product>/<part>/` and knowledge `stack/product/<product>/fragment/<part>/` serve different purposes.
A code part may exist without a fragment skill: the product can use general part knowledge unchanged.
The product and fragment dispatchers own the actual selection rules; this diagram does not replace their routes.

### Vocabulary

| Term           | Meaning                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| project        | The repository containing engines, product implementations and their governance.                                                            |
| engine         | Reusable technical capability, independent of product business and identity.                                                                |
| member         | A responsibility owned within an engine workspace, with a public contract and directed dependencies.                                        |
| domain         | A coherent responsibility; an engine domain owns a general mechanism, while a product domain owns business rules.                           |
| service        | A runtime/application boundary for a product domain; it is not synonymous with a table, package or engine member.                           |
| package        | An ecosystem's import, build or distribution unit. A member may use one or more packages; the terms are not interchangeable.                |
| facade         | An outward public composition of owned capabilities; it is not a second implementation.                                                     |
| adapter / port | An implementation of an integration boundary / the contract that boundary must satisfy.                                                     |
| DSL            | The consumer-facing vocabulary for expressing supported work predictably.                                                                   |
| product        | An independent business consumer that owns its identity, decisions and data.                                                                |
| part           | A general product capability category and its shared architecture; also the corresponding implementation area within a product.             |
| fragment       | Product-specific knowledge that refines a part with actual preferences or exceptions allowed by its contract. Optional when there are none. |
| spec           | Declarative product or role behavior interpreted through the relevant part and engine contracts.                                            |
| language       | Syntax, semantics, hand style and language/runtime fundamentals owned by `stack/lang`.                                                      |
| library        | A selected implementation's API, lifecycle, conventions and integration constraints owned by `stack/lib`.                                   |
| skill          | Approved knowledge for one responsibility; its owning guide is the authoritative definition.                                                |
| router         | An entry that selects its immediate children or the next stage's dispatcher using task context.                                             |
| arena          | An assigned live collaboration scope; its actual addressing and files belong to IPC's guide.                                                |
| history        | Preserved records and lessons, separate from approved knowledge; naming belongs to its writing guides.                                      |

## Rules

- Keep the structural map independent of member counts, downstream catalogues and product roadmaps.
- Update a coordinate here when its source location changes; registries own knowledge selection, not a second source-path map.
- Technical manifests remain the installed implementation state. A map or directory name does not establish behavior or completeness.
- Apply the ownership law from architecture and the access policy from work.

## Proof

A reader can distinguish code from knowledge, locate the responsible level and name the next dispatcher without learning unrelated implementation details.

## Sources

Owner-approved topology and observed repository directories.

## Routing

Return to root after study.
Paths below are coordinates, not shortcuts around the routing graph. Enter each selected stage through its dispatcher.
