# Tutor

The arsenal's contract: five product-free engines (`rust python go bun infra`), every project as a product over them, one governance, and this folder, which teaches both.

This folder outranks habit, tool conventions, training memory and prior assumptions. The code is the truth about today; this folder is the truth about how the code is written, verified and shipped; the owner's word is the truth above both and is written down after it is given.

Every folder below is a module with one `index.md` as its facade, the way `mod.rs` fronts a crate: a reader is sent to the folder's `index.md` and never deeper.

```
tutor/
├── index.md                 this router: boot, route, rank, vocabulary, how a skill is written
├── global/                  what every session reads, whatever it owns
│   ├── vision/              what the arsenal is: the scale, layers, engines and their laws, products, training, ToolX, the house product, roles
│   ├── arch/                toolchain policy, contracts, services, gates, root governance, workflows, release, the root gate, direction
│   ├── work/                the creed, loop, truth, research, decisions, sessions, git, machine, style, reply
│   └── memory/              how an agent's memory is split, read, written, kept thin and recovered
├── language/                how a language is written here: toolchain, hand style, tests
│   └── {rust, python, go, typescript, bash}/
├── library/                 how one library is used here: owner, laws, traps
│   └── {hyper, sanic, next, expo, electro}/
└── stack/                   one unit of the tree each: layout, laws, domains, gate, how to add, direction
    ├── engine/{rust, python, go, bun, infra}/
    ├── fragment/{api, infra, web, mobile, desktop}/
    └── product/<project>/   the business and preferences of one product, nothing else; optional
```

## Boot

The first minutes of every session, in this order, every time, including after a compaction:

1. Memory, in the reading order of `global/memory`.
2. `global/` whole: `vision → arch → work → memory`.
3. The route rows below that match the work, in order; a product's `stack/product/<project>/` closes every list.
4. The code of the area: manifests, lockfiles, the facade, the tests; what exists, what is missing, what is duplicated, what sits in the wrong layer. Never plan from memory.
5. The opening line of the lap, as `global/work` words it, before the first edit.

## Route

| Working on                        | Then read, in order                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `engine/rust`                     | `language/rust` · `library/hyper` · `stack/engine/rust`                                   |
| `engine/python`                   | `language/python` · `library/sanic` · `stack/engine/python`                               |
| `engine/go`                       | `language/go` · `stack/engine/go`                                                         |
| `engine/bun`                      | `language/typescript` · `stack/engine/bun`                                                |
| `engine/infra`                    | `language/bash` · `stack/engine/infra`                                                    |
| `product/<p>/api` in Rust         | `language/rust` · `library/hyper` · `stack/engine/rust` · `stack/fragment/api`            |
| `product/<p>/api` in Python       | `language/python` · `library/sanic` · `stack/engine/python` · `stack/fragment/api`        |
| `product/<p>/web`                 | `language/typescript` · `stack/engine/bun` · `library/next` · `stack/fragment/web`        |
| `product/<p>/mobile`              | `language/typescript` · `stack/engine/bun` · `library/expo` · `stack/fragment/mobile`     |
| `product/<p>/desktop`             | `language/typescript` · `stack/engine/bun` · `library/electro` · `stack/fragment/desktop` |
| `product/<p>/infra`               | `language/bash` · `stack/engine/infra` · `stack/fragment/infra`                           |
| a business feature of a product   | the fragment's row · `stack/product/<p>` · the research law of `global/work`              |
| a design, a screen, an element    | the surface's row · the design bar of `stack/fragment/web`                                |
| the root, `.github/`, this folder | `global/arch` (governance, workflows) · `global/work` (git, reply)                        |
| a release, a sync, an extraction  | `global/arch` (release) · `stack/engine/infra` (sync)                                     |
| a bug, a red gate, a regression   | the part's row · **Redo the lap** in `global/work`                                        |
| a question with no code to touch  | `global/work` (decisions, reply)                                                          |

## Rank

The owner's word, then `global/`, then the matching `language/`, `library/` and `stack/` files, then the product's folder, then the code and its law tests, then nothing: not a tutorial, not a habit, not a model's memory of a framework. A conflict between two files is a defect reported in the same lap and resolved by the owner. A law test is never weakened.

## Vocabulary

| Word     | Meaning                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| engine   | a general, product-free library for one language under `engine/`; the final wrapper over every library and integration         |
| product  | one project under `product/<project>`, a consumer of the engines, a source of needs                                            |
| fragment | one workspace of a product: `api infra web mobile desktop`                                                                     |
| part     | any unit with one owner and one gate: an engine, a fragment, this folder or the root                                           |
| domain   | one member of an engine owning one concern (`log cache queue …`), importable alone; each engine owns its ladder                |
| member   | a domain of `engine/bun`, reached as `import * as <member> from "engine/<member>"`                                             |
| facade   | the member named `engine` that re-exports every domain by name and that no domain imports                                      |
| verb     | one public operation of a domain; it lives in exactly one place and means the same thing everywhere                            |
| service  | one application inside `product/<p>/api`, the owner of one business domain and its tables (DOMA)                               |
| spec     | the data that turns a surface into one role's product: `specs/<role>/{config, schema, brand}`                                  |
| gravity  | logic sinks to the lowest layer able to carry it; everything above is a pipeline                                               |
| training | growing an engine's verbs, correcting them and hardening their interfaces from real use; engineering, never machine learning   |
| proof    | the five of every engine: `tests benches fuzz audit lint`, each in the language's own tool                                     |
| gate     | the commands of a part that must all exit 0, observed, before a change is done                                                 |
| tool     | a ToolX repository: a read-only mirror of one engine, one fragment or this folder, extracted from the arsenal on a release tag |
| tutor    | this folder: the one contract of every session                                                                                 |
| session  | one agent owning one part of one product for one goal, with no human in the loop                                               |
| lap      | one slice of work from **Place** to **Reply** in the loop of `global/work`                                                     |

## How a skill is written

- **One responsibility per file:** `global/` what is true of every session; `language/` how a language is written and mastered; `library/` how one library is used; `stack/engine` and `stack/fragment` one unit of the tree (its layout, paths, names, gate, direction); `stack/product/<p>` one product's business and preferences. A file explains its own subject and leaves every other side to the file that owns it: the agent reads the whole tree.
- **No bias above `stack/`:** `global/`, `language/` and `library/` name no link, no path inside a part, no product, no tool and no brand; the arsenal's own layers (`engine/`, `product/`, `tutor/`, the root) are vocabulary, not bias. The first time a part's path or a product's name is needed, the subject has crossed into `stack/`.
- **One fact, one home:** a law, layout, gate, command or number is written once, in the file that owns it, and never restated; a second file that needs it names the owning layer in a word, or says nothing, because the reader has read it.
- **The least words for the most value:** no filler, no restatement of the code, no sentence a reader skips; Markdown in the universal style of `global/work`; one hand-style sample per language; a file is as short as its subject allows and never passes 300 lines.
- **True today:** a skill describes the code as it is; what the owner wants it to become sits under **Direction**; a library file whose library has not entered the code says so in its first line. A lying skill is a bug fixed in the same lap as the code.
- **Self-contained:** a skill names nothing outside the repository; inspiration sources, rigs and the owner's pending words live in memory.
- **Harsher only:** a law may become harsher; a weakening is the owner's decision, written down after it is given.
- **Growth:** a new law goes into the file that owns its layer, naming the test, lint or workflow that enforces it; a new unit of the tree is a folder under `stack/`, a row in the route above and a gate in its own file.
- **Reach:** this folder travels whole into every product repository minus the other products' folders under `stack/product/`, and ships as the tool `skillx` minus every `stack/product/*`, never inside another tool.
