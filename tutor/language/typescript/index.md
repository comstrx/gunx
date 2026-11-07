# TypeScript

How TypeScript and CSS are written here, in `engine/bun` and in every `web`, `mobile` and `desktop`. The hand style is the format: Biome's formatter is off; its lint wall and `tsc` strict check rules, the hand writes the shape, the reviewer reads it.

## Toolchain

- Bun as manager, test runner and tooling runtime; TypeScript strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; Biome with recommended plus correctness, style, suspicious, a11y and security as errors.
- The wall: no `any`, no `!`, no unused, no console, `import type`, at most 6 parameters, no parameter reassignment, no `as` outside a validated boundary (`satisfies` for literals). A lint exception lives in `biome.json`, scoped, with a reason in the commit.
- Runtime-agnostic by law in the engine: `Bun process Buffer require node:* bun:*` are refused in `src/` except the members that run at build or test time or reach the disk on purpose (`stack/engine/bun`).

## Hand style

```ts
import * as json from "engine/json";
import type * as translate from "engine/translate";
import { securityHeaders } from "./security.ts";

export type Served = { path: string; status: number } | null;

const fresh = "no-cache";

export function locate ( folder: string, pathname: string ): Served {

    for ( const candidate of candidates(pathname) ) {

        const path = resolve(folder, `.${candidate}`);

        if ( !path.startsWith(folder + sep) ) return null;
        if ( file(path) ) return { path, status: 200 };

    }

    return null;

}
```

- 4-space indent, double quotes, semicolons, trailing commas on multi-line literals, `.ts`/`.tsx` on relative imports, `import type`, `@/…` for a part's own source, `engine/<member>` for the engine. Columns 150.
- Definitions and conditions spaced inside parentheses (`function f ( a )`, `if ( x )`, `for ( const … )`); calls tight. Every multi-line body breathes; statements in paragraphs (declarations, guards, side effects, exit); one blank after imports; no blank at the end of a file.
- `const` by default; exported types first, then constants, helpers, exported functions last; a file is a concern of 100–300 lines.
- Imports: engine first, then the part's own layers in order, then relative; a relative import never crosses into another member or layer; no default exports except where a framework demands them (a Next page, an Expo route).
- Errors: one typed fault per part over the engine's; no swallowed promise; every `await` inside a boundary that maps the failure.
- A component is a function with a typed `Props`; hooks are `use<Name>`; a store binding exposes `useSelect`, never `use`; no hook reads a browser global at render.

## CSS

- Tailwind through PostCSS on the web and the desktop; `styles/tokens.css` is the only file with raw values: scales (breakpoints, spacing, containers, type, radius by category, easing, motion), the palette with its tints and shadows, redefined for dark. Every other stylesheet uses tokens.
- Tailwind utilities appear only inside `elements/` and `icons/`, built from `engine/style` variants over the tokens; states through `data-*` and `aria-*`; one class per element; no inline styles except computed custom properties; logical properties keep RTL exact; motion tokens drop to zero under reduced motion.
- React Native has no CSS: tokens live in `styles/` (theme, palette, font) and elements build `StyleSheet` objects from them; the same semantic props as the web.
- Light and dark are separate art directions sharing the tokens' names; RTL, reduced motion and keyboard focus are designed from the first line.

## Tests and benches

- Flat `tests/<unit>.test.ts` on `bun test`, real elements rendered in every state with exact classes and roles, a real compiled spec, a real served folder; the engine's members are tested in the engine, never re-asserted by a surface.
- Flat `benches/<unit>.bench.ts` ending in `test.run()`: numbers, never a verdict.
- Flat `fuzz/<unit>.test.ts` on fast-check (`fc.assert(fc.property(…))`, `numRuns` in the tens of thousands) run by `bun run fuzz`, apart from `bun run test`; a parser or decoder gets a property the day it lands.
- The analyzer (`bun run check`) checks import boundaries only: layers, member doors, vendor homes, `@spec/*` owners. Nothing in tests or tools judges size, lines, syntax, markup, style or a number.
