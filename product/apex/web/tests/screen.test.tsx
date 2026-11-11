import { beforeEach, describe, expect, test as it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Nav } from "../src/app/nav.tsx";
import { Screen } from "../src/app/screen.tsx";
import { toneOf } from "../src/features/hello/hooks/use-hello.ts";
import { answer, ask } from "../src/specs/runtime.ts";
import { faults } from "../src/stores/preferences.ts";

beforeEach(() => {

    faults.set(undefined);

});

describe("screen", () => {

    it("the screen renders its blocks and places the hello feature", () => {

        const markup = renderToStaticMarkup(<Screen path="/" />);

        expect(markup).toStartWith('<title>أهلاً · أكمي</title><div data-ui="block" data-direction="column" data-gap="md" data-align="center" data-justify="center" data-padding="md" data-surface="plain" data-width="auto" data-height="screen"');
        expect(markup).toContain('class="flex min-w-0 flex-col gap-4 items-center justify-center p-5 grow flex-nowrap"');
        expect(markup).toContain('<section aria-labelledby');
        expect(markup).toContain("جارٍ تحضير التحية");
        expect(markup).toEndWith("></dialog>");
        expect(markup).not.toContain("هذه الصفحة خارج صلاحياتك");
        expect(renderToStaticMarkup(<Screen path="/nope" />)).toBe("");

    });
    it("an open screen carries the confirmation and shows the question once one is asked", async () => {

        const closed = renderToStaticMarkup(<Screen path="/" />);

        expect(closed).toContain('<dialog role="alertdialog" aria-labelledby="');
        expect(closed).not.toContain(">نعم</span>");

        const asked = ask("hello.refresh");
        const open = renderToStaticMarkup(<Screen path="/" />);

        expect(open).toContain(">تأكيد</p>");
        expect(open).toContain(">تحية جديدة</h2>");
        expect(open).toContain(">لا</span>");
        expect(open).toContain('data-look="danger"');
        expect(open).toContain(">نعم</span>");
        answer(false);
        expect(await asked).toBe(false);
        expect(renderToStaticMarkup(<Screen path="/" />)).not.toContain(">نعم</span>");

    });
    it("the nav lists the menu from the spec with the current screen marked", () => {

        const markup = renderToStaticMarkup(<Nav path="/" />);

        expect(markup).toStartWith('<nav aria-label="القائمة" data-ui="block"');
        expect(markup).toContain('<a href="/" aria-current="page" data-ui="link" data-look="button" data-current=""');
        expect(markup).toContain(">أهلاً</a>");
        expect(markup).toContain('aria-label="الثيم"');
        expect(markup).toContain(">English</span>");

    });
    it("the feature reads its tone from the spec and refuses unknown tones", () => {

        expect(toneOf({ tone: "warm" })).toBe("warm");
        expect(toneOf({ tone: "loud" })).toBe("plain");
        expect(toneOf({})).toBe("plain");

    });

});
