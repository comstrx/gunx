# infra

`product/<project>/infra` is the product's customization of `engine/infra`: its data always, its own DSL when it needs one. Nothing here duplicates the engine; a capability the product lacks is built in the engine with its test, then used here. Gate: `bash src/main.sh test --check` when `src/` exists, otherwise the engine's `test --check` against this folder.

## Layout

```
product/<project>/infra/
├── infra.toml        the product's parts (kind, image, port, health), data services, domains, model roles, digests, [sync] (repository, moment); Infra.toml as the fallback name
├── .env.example      the product's schema over the engine's: every key with its default in owner blocks
├── .env.production   the release values; .env.local the local lab; both ignored
├── image/            one Dockerfile per part kind only when the engine's templates are not enough
├── src/              optional: main.sh sources the engine's entry as a library, then app/<domain>/ folders of the product's own, under the engine's laws
├── tests/            optional: the product's offline tests, <name>.test.sh, run by its own check and test
└── benches/          optional: lab evidence of the product's stack
```

A new environment is an env file; a new part is a row; a new product is this folder. A product without `src/` is data only, and most products are.

## Laws

- **Data first:** everything the engine can be told through `infra.toml` and env files is told there; `src/` exists only for a DSL the engine does not have and the product truly needs, and it is a candidate for the engine the day a second product wants it.
- **One entry:** `src/main.sh` sources `engine/infra/src/main.sh` as a library (`INFRA_ENTRY=library`) and never copies, patches or re-implements a core, config or module verb; it adds `app/` folders of its own and dispatches through the engine's ui.
- **Same laws:** the engine's `check` runs on the product's `src/` and `tests/` with the same layer, naming, secret and value laws; `language/bash` is the style.
- **Ownership:** the product owns its env values, its images and its stack choices; the engine owns the mechanics; a product never names another product.
- **Sync:** `[meta] repo` names the product's repository; the engine's `extract` module reads it and the product receives all of the arsenal minus the other `product/*` and the other `tutor/stack/product/*`.

## How to add

- **An environment:** an env file. **A part:** a row in `infra.toml` and its key block in `.env.example`. **A product DSL:** `src/main.sh` + `src/app/<name>/index.sh` registering its commands (`core:ui:usage`) over `app:<name>:*` verbs, a `<name>.test.sh` or `#cfg[test]` functions.
