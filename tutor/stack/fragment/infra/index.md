# infra

`product/<project>/infra` is the product's customization of the infrastructure engine: its data always, its own DSL when it needs one. Nothing here duplicates the engine; a capability the product lacks is built in the engine with its test, then used here.

## Layout

```
product/<project>/infra/
├── infra.toml        [meta] with the product's `repo`, its parts (kind, image, port, health), data services, domains, model roles, digests; Infra.toml as the fallback name
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
- **One entry:** `src/main.sh` sources the engine's `src/main.sh` as a library (`INFRA_ENTRY=library`) and never copies, patches or re-implements a core, config or module verb; it adds `app/` folders of its own and dispatches through the engine's registry.
- **Ownership:** the product owns its env values, its images and its stack choices; the engine owns the mechanics; a product never names another product.
- **Sync:** `[meta] repo` names the product's repository; the engine's `push product/<project>` reads it and writes the product's tree there.

## Gate

Gated with the root: `infra gate --part root` scans and formats this folder with everything else that has no part of its own.

## How to add

- **An environment:** an env file. **A part:** a row in `infra.toml` and its key block in `.env.example`. **A product DSL:** `src/main.sh` + `src/app/<name>/index.sh` registering its commands over `app:<name>:*` verbs, a `<name>.test.sh` or `#cfg[test]` functions.

## Direction

A gate of its own: `check` and `test` through the product's entry when `src/` exists, otherwise the engine's check of this folder's manifest and env files.
