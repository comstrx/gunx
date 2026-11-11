import { afterEach, describe, expect, test as it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Confirm } from "../src/components/confirm.tsx";
import { Denied } from "../src/components/denied.tsx";
import { Greeting } from "../src/components/greeting.tsx";
import { answer, ask } from "../src/specs/runtime.ts";
import { instance } from "../src/stores/preferences.ts";

const noop = (): void => undefined;

afterEach(() => instance.getState().setLocale("ar"));

describe("components", () => {

    it("the greeting shapes its loading state like the heading it replaces", () => {

        const markup = renderToStaticMarkup(<Greeting status="pending" message={undefined} onRefresh={noop} />);

        expect(markup).toContain('role="region"');
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('data-testid="skeleton-display-most"');
        expect(markup).toContain("جارٍ تحضير التحية");
        expect(markup).toContain('data-testid="button-soft-md"');
        expect(markup).not.toContain('aria-level="1"');

    });
    it("the greeting says the message once it arrives, in the chosen language", () => {

        const arabic = renderToStaticMarkup(<Greeting status="done" message="أهلاً وسهلاً بالعالم" onRefresh={noop} />);

        expect(arabic).toContain('aria-level="1"');
        expect(arabic).toContain("أهلاً وسهلاً بالعالم");
        expect(arabic).toContain("مرحباً من أكمي");
        expect(arabic).toContain("English");
        expect(arabic).not.toContain('data-testid="skeleton-display-most"');
        instance.getState().toggleLocale();

        const english = renderToStaticMarkup(<Greeting status="done" message="hello there, world" onRefresh={noop} />);

        expect(english).toContain("Hello from Acme");
        expect(english).toContain("New greeting");
        expect(english).toContain("العربية");

    });
    it("the greeting turns a failure into a designed state with a retry", () => {

        instance.getState().setLocale("en");

        const failed = renderToStaticMarkup(<Greeting status="failed" message={undefined} onRefresh={noop} />);

        expect(failed).toContain("The service is unreachable");
        expect(failed).toContain("Make sure the gateway is running, then try again.");
        expect(failed).toContain('data-testid="button-solid-md"');
        expect(failed).toContain("Try again");
        expect(failed).not.toContain('aria-busy="true"');

    });
    it("a denied page names itself, says why and offers the first page the session can open", () => {

        const english = renderToStaticMarkup(<Denied locale="en" at="/nope" page="Orders" />);
        const arabic = renderToStaticMarkup(<Denied locale="ar" at="/" page="الطلبات" />);
        const id = /<section aria-labelledby="([^"]+)"/.exec(english)?.[1] ?? "";

        expect(id).not.toBe("");
        expect(english).toContain('role="region"');
        expect(english).toContain('data-testid="block-column-raised"');
        expect(english).toContain('data-testid="heading-eyebrow">Orders</h2>');
        expect(english).toContain(`id="${id}"`);
        expect(english).toContain('data-testid="heading-title">This page is outside your access</h1>');
        expect(english).toContain('data-testid="text-muted-md">Ask an account owner for access, or go back to a page you can open.</div>');
        expect(english).toContain('data-testid="link-solid"');
        expect(english).toContain(">Hello</div>");
        expect(arabic).toContain(">الطلبات</h2>");
        expect(arabic).toContain(">هذه الصفحة خارج صلاحياتك</h1>");
        expect(arabic).toContain(">أهلاً</div>");

    });
    it("a confirmation holds nothing until asked, then asks in the chosen language with the safe answer first", async () => {

        expect(renderToStaticMarkup(<Confirm locale="ar" />)).toBe("");

        const asked = ask("hello.refresh");
        const arabic = renderToStaticMarkup(<Confirm locale="ar" />);
        const english = renderToStaticMarkup(<Confirm locale="en" />);
        const id = /aria-labelledby="([^"]+)" aria-modal="true" role="alertdialog"/.exec(arabic)?.[1] ?? "";

        expect(id).not.toBe("");
        expect(arabic).toContain('data-testid="text-muted-sm">تأكيد</div>');
        expect(arabic).toContain(`id="${id}" data-testid="heading-section">تحية جديدة</h2>`);
        expect(arabic.indexOf(">لا</div>")).toBeGreaterThan(0);
        expect(arabic.indexOf(">نعم</div>")).toBeGreaterThan(arabic.indexOf(">لا</div>"));
        expect(arabic).toContain('data-testid="button-ghost-md"');
        expect(arabic).toContain('data-testid="button-danger-md"');
        expect(english).toContain(">Confirmation</div>");
        expect(english).toContain(">New greeting</h2>");
        expect(english).toContain(">No</div>");
        expect(english).toContain(">Yes</div>");
        answer(true);
        expect(await asked).toBe(true);
        expect(renderToStaticMarkup(<Confirm locale="ar" />)).toBe("");

    });

});
