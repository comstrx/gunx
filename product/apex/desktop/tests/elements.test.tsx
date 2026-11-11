import { describe, expect, test as it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Block } from "../src/elements/block.tsx";
import { Button } from "../src/elements/button.tsx";
import { Dialog } from "../src/elements/dialog.tsx";
import { Heading } from "../src/elements/heading.tsx";
import { Link } from "../src/elements/link.tsx";
import { Skeleton } from "../src/elements/skeleton.tsx";
import { Text } from "../src/elements/text.tsx";

const noop = (): void => undefined;
const word = "x";

describe("elements", () => {

    it("a block lays out from semantic props and tells its states", () => {

        const card = renderToStaticMarkup(<Block as="section" surface="raised" padding="lg" gap="lg" width="reading" labelledBy="t" busy><Text>{word}</Text></Block>);

        expect(card).toStartWith('<section aria-labelledby="t" aria-busy="true" data-ui="block" data-direction="column" data-gap="lg" data-padding="lg" data-surface="raised" data-width="reading" data-height="auto"');
        expect(card).toContain("bg-surface-raised");
        expect(card).toContain("max-w-[42rem]");
        expect(renderToStaticMarkup(<Block direction="row" wrap height="screen"><Text>{word}</Text></Block>)).toContain('data-wrap="" class="flex min-w-0 flex-row gap-4 p-0 grow flex-wrap"');

    });
    it("headings carry their level and look, text its tone", () => {

        expect(renderToStaticMarkup(<Heading level={1}>{word}</Heading>)).toStartWith('<h1 data-ui="heading" data-look="display"');
        expect(renderToStaticMarkup(<Heading level={2} look="eyebrow" id={word}>{word}</Heading>)).toContain('<h2 id="x" data-ui="heading" data-look="eyebrow"');
        expect(renderToStaticMarkup(<Heading level={3}>{word}</Heading>)).toContain('data-look="section"');
        expect(renderToStaticMarkup(<Text tone="muted" size="sm" live="polite">{word}</Text>)).toBe('<p aria-live="polite" data-ui="text" data-tone="muted" data-size="sm" data-weight="regular" class="m-0 text-pretty text-ink-muted text-sm leading-6 font-normal">x</p>');

    });
    it("a button tells pending and look, a skeleton keeps its shape", () => {

        expect(renderToStaticMarkup(<Button onPress={noop}>Go</Button>)).toContain('<button type="button" data-ui="button" data-look="solid" data-size="md" data-width="auto"');
        expect(renderToStaticMarkup(<Button look="soft" size="sm" pending>Wait</Button>)).toContain('aria-busy="true" disabled="" data-ui="button" data-look="soft" data-size="sm" data-width="auto" data-pending=""');
        expect(renderToStaticMarkup(<Button look="soft" size="sm" pending>Wait</Button>)).toContain('data-ui="spinner"');
        expect(renderToStaticMarkup(<Button look="ghost" disabled label="Close">{word}</Button>)).toContain('aria-label="Close"');
        expect(renderToStaticMarkup(<Skeleton size="display" width="most" />)).toBe('<div aria-hidden="true" data-ui="skeleton" data-size="display" data-width="most" class="animate-pulse rounded-[var(--radius-md)] bg-surface-sunken motion-reduce:animate-none h-11 w-2/3"></div>');

    });
    it("a link tells its look, the current page and where an external one opens", () => {

        expect(renderToStaticMarkup(<Link href="/a">{word}</Link>)).toStartWith('<a href="/a" data-ui="link" data-look="text" class="');
        expect(renderToStaticMarkup(<Link href="/a">{word}</Link>)).toEndWith('text-brand-strong underline-offset-4 hover:underline">x</a>');
        expect(renderToStaticMarkup(<Link href="/a" look="solid">{word}</Link>)).toEndWith('data-look="solid" class="inline-flex items-center rounded-[var(--radius-md)] font-medium no-underline transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface h-11 px-4 text-sm bg-brand text-on-brand hover:bg-brand-strong">x</a>');
        expect(renderToStaticMarkup(<Link href="/a" look="button" current>{word}</Link>)).toStartWith('<a href="/a" aria-current="page" data-ui="link" data-look="button" data-current="" class="');
        expect(renderToStaticMarkup(<Link href="/a" look="button" current>{word}</Link>)).toEndWith('hover:bg-brand-soft bg-brand-soft">x</a>');
        expect(renderToStaticMarkup(<Link href="https://example.com" external>{word}</Link>)).toStartWith('<a href="https://example.com" target="_blank" rel="noreferrer" data-ui="link" data-look="text" data-external="" class="');

    });
    it("a dialog names itself, an alert takes its role, and a closed one holds nothing", () => {

        const closed = renderToStaticMarkup(<Dialog open={false} label="Close account"><Text>{word}</Text></Dialog>);
        const alert = renderToStaticMarkup(<Dialog open kind="alert" labelledBy="t"><Text>{word}</Text></Dialog>);

        expect(closed).toStartWith('<dialog aria-label="Close account" data-ui="dialog" data-kind="plain" class="');
        expect(closed).toEndWith('backdrop:bg-scrim open:backdrop:transition-opacity open:backdrop:duration-[var(--motion-fast)] starting:open:backdrop:opacity-0"></dialog>');
        expect(closed).not.toContain(" open=");
        expect(closed).not.toContain("<p");
        expect(alert).toStartWith('<dialog role="alertdialog" aria-labelledby="t" data-ui="dialog" data-kind="alert" class="');
        expect(alert).toContain("bg-surface-raised");
        expect(alert).toContain("duration-[var(--motion-fast)]");
        expect(alert).toEndWith(">x</p></dialog>");

    });

});
