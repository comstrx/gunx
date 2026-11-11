import { beforeEach, describe, expect, test as it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/app/index.tsx";
import { Screen } from "../src/app/screen.tsx";
import { toneOf } from "../src/features/hello/hooks/use-hello.ts";
import { answer, ask } from "../src/specs/runtime.ts";
import { faults } from "../src/stores/preferences.ts";

beforeEach(() => {

    faults.set(undefined);

});

describe("screen", () => {

    it("the app frames the nav and the hello screen from the compiled spec", () => {

        const markup = renderToStaticMarkup(<App />);

        expect(markup).toContain('role="navigation"');
        expect(markup).toContain('data-testid="link-button"');
        expect(markup).toContain('data-testid="block-column-plain"');
        expect(markup).toContain('data-testid="block-column-raised"');
        expect(markup).toContain("جارٍ تحضير التحية");
        expect(markup).not.toContain('role="alertdialog"');
        expect(markup).not.toContain("هذه الصفحة خارج صلاحياتك");
        expect(renderToStaticMarkup(<Screen path="/nope" />)).toBe("");

    });
    it("an open screen carries the confirmation and shows the question once one is asked", async () => {

        expect(renderToStaticMarkup(<Screen path="/" />)).not.toContain('data-testid="dialog-alert"');

        const asked = ask("hello.refresh");
        const open = renderToStaticMarkup(<Screen path="/" />);

        expect(open).toContain('aria-modal="true" role="alertdialog"');
        expect(open).toContain('data-testid="dialog-alert"');
        expect(open).toContain(">تأكيد</div>");
        expect(open).toContain('data-testid="heading-section"');
        expect(open).toContain(">تحية جديدة</h2>");
        expect(open).toContain(">لا</div>");
        expect(open).toContain('data-testid="button-danger-md"');
        expect(open).toContain(">نعم</div>");
        answer(false);
        expect(await asked).toBe(false);
        expect(renderToStaticMarkup(<Screen path="/" />)).not.toContain('data-testid="dialog-alert"');

    });
    it("the feature reads its tone from the spec and refuses unknown tones", () => {

        expect(toneOf({ tone: "warm" })).toBe("warm");
        expect(toneOf({ tone: "loud" })).toBe("plain");
        expect(toneOf({})).toBe("plain");

    });

});
