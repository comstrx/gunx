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
const go = "Go";
const wait = "Wait";
const label = "t";
const row = "row";

describe("elements", () => {

    it("a block lays out from the same semantic props as the web", () => {

        const card = renderToStaticMarkup(<Block as="section" surface="raised" padding="lg" gap="lg" width="reading" labelledBy={label} busy><Text>{word}</Text></Block>);

        expect(card).toContain('role="region"');
        expect(card).toContain('aria-labelledby="t"');
        expect(card).toContain('aria-busy="true"');
        expect(card).toContain('data-testid="block-column-raised"');
        expect(renderToStaticMarkup(<Block direction="row" wrap id={row}><Text>{word}</Text></Block>)).toContain('data-testid="block-row-plain"');
        expect(renderToStaticMarkup(<Block direction="row" wrap id={row}><Text>{word}</Text></Block>)).toContain('id="row"');

    });
    it("headings carry their level and text its tone", () => {

        expect(renderToStaticMarkup(<Heading level={1}>{word}</Heading>)).toContain('aria-level="1"');
        expect(renderToStaticMarkup(<Heading level={1}>{word}</Heading>)).toContain('data-testid="heading-display"');
        expect(renderToStaticMarkup(<Heading level={2} look="eyebrow" id={word}>{word}</Heading>)).toContain('id="x"');
        expect(renderToStaticMarkup(<Heading level={3}>{word}</Heading>)).toContain('data-testid="heading-section"');
        expect(renderToStaticMarkup(<Text tone="muted" size="sm" live="polite">{word}</Text>)).toContain('aria-live="polite"');
        expect(renderToStaticMarkup(<Text tone="danger">{word}</Text>)).toContain('data-testid="text-danger-md"');

    });
    it("a button is a pressable with its state, and a skeleton keeps its shape", () => {

        const solid = renderToStaticMarkup(<Button onPress={noop}>{go}</Button>);

        expect(solid).toContain('role="button"');
        expect(solid).toContain('data-testid="button-solid-md"');
        expect(solid).toContain("Go");
        expect(solid).not.toContain('aria-busy');

        const pending = renderToStaticMarkup(<Button look="soft" size="sm" pending>{wait}</Button>);

        expect(pending).toContain('aria-busy="true"');
        expect(pending).toContain('aria-disabled="true"');
        expect(pending).toContain('role="progressbar"');
        expect(renderToStaticMarkup(<Button look="ghost" disabled label="Close">{word}</Button>)).toContain('aria-label="Close"');
        expect(renderToStaticMarkup(<Skeleton size="display" width="most" />)).toContain('data-testid="skeleton-display-most"');

    });
    it("a link tells its look and the current page, and a solid one is filled with the brand", () => {

        const text = renderToStaticMarkup(<Link href="/a">{word}</Link>);
        const solid = renderToStaticMarkup(<Link href="/a" look="solid">{word}</Link>);
        const current = renderToStaticMarkup(<Link href="/a" look="button" current>{word}</Link>);

        expect(text).toStartWith('<div role="link" tabindex="0"');
        expect(text).toContain('data-testid="link-text"');
        expect(text).toContain("text-decoration-line:underline");
        expect(text).not.toContain("background-color");
        expect(solid).toContain('style="background-color:rgba(202,52,0,1.00)" data-testid="link-solid"');
        expect(solid).toContain("color:rgba(255,255,255,1.00);text-decoration-line:none");
        expect(current).toStartWith('<div aria-current="page" role="link"');
        expect(current).toContain('style="background-color:rgba(255,242,238,1.00)" data-testid="link-button"');
        expect(renderToStaticMarkup(<Link href="/a" look="button">{word}</Link>)).not.toContain("aria-current");

    });
    it("a dialog is modal, an alert takes its role, and a closed one holds nothing", () => {

        const alert = renderToStaticMarkup(<Dialog open kind="alert" labelledBy={label}><Text>{word}</Text></Dialog>);
        const plain = renderToStaticMarkup(<Dialog open label="Close account"><Text>{word}</Text></Dialog>);

        expect(renderToStaticMarkup(<Dialog open={false} label="Close account"><Text>{word}</Text></Dialog>)).toBe("");
        expect(alert).toContain('aria-labelledby="t" aria-modal="true" role="alertdialog"');
        expect(alert).toContain('data-testid="dialog-alert"');
        expect(alert).toContain('data-testid="text-default-md">x</div>');
        expect(plain).toContain('aria-label="Close account" aria-modal="true" role="dialog"');
        expect(plain).toContain('data-testid="dialog-plain"');

    });

});
