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

        expect(markup).toStartWith('<section aria-labelledby');
        expect(markup).toContain('aria-busy="true" data-ui="block"');
        expect(markup).toContain('data-ui="skeleton"');
        expect(markup).toContain("جارٍ تحضير التحية");
        expect(markup).toContain('data-look="soft" data-size="md" data-width="auto" data-pending=""');
        expect(markup).not.toContain("<h1");

    });
    it("the greeting says the message once it arrives, in the chosen language", () => {

        const arabic = renderToStaticMarkup(<Greeting status="done" message="أهلاً وسهلاً بالعالم" onRefresh={noop} />);

        expect(arabic).toContain('<h1 data-ui="heading" data-look="display"');
        expect(arabic).toContain(">أهلاً وسهلاً بالعالم</h1>");
        expect(arabic).toContain("مرحباً من أكمي");
        expect(arabic).toContain(">English</span>");
        expect(arabic).not.toContain('data-ui="skeleton"');
        instance.getState().toggleLocale();

        const english = renderToStaticMarkup(<Greeting status="done" message="hello there, world" onRefresh={noop} />);

        expect(english).toContain("Hello from Acme");
        expect(english).toContain(">New greeting</span>");
        expect(english).toContain(">العربية</span>");

    });
    it("the greeting turns a failure into a designed state with a retry", () => {

        instance.getState().setLocale("en");

        const failed = renderToStaticMarkup(<Greeting status="failed" message={undefined} onRefresh={noop} />);

        expect(failed).toContain(">The service is unreachable</h1>");
        expect(failed).toContain("Make sure the gateway is running, then try again.");
        expect(failed).toContain('data-look="solid"');
        expect(failed).toContain(">Try again</span>");
        expect(failed).not.toContain('aria-busy="true"');

    });
    it("a denied page names itself, says why and offers the first page the session can open", () => {

        const english = renderToStaticMarkup(<Denied locale="en" at="/nope" page="Orders" />);
        const arabic = renderToStaticMarkup(<Denied locale="ar" at="/" page="الطلبات" />);
        const id = /<section aria-labelledby="([^"]+)"/.exec(english)?.[1] ?? "";

        expect(english).toStartWith('<div data-ui="block" data-direction="column" data-gap="md" data-align="center" data-justify="center" data-padding="md" data-surface="plain" data-width="auto" data-height="screen"');
        expect(id).not.toBe("");
        expect(english).toContain('data-look="eyebrow" class="m-0 text-balance text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Orders</h2>');
        expect(english).toContain(`<h1 id="${id}" data-ui="heading" data-look="title"`);
        expect(english).toContain(">This page is outside your access</h1>");
        expect(english).toContain(">Ask an account owner for access, or go back to a page you can open.</p>");
        expect(english).toContain('<a href="/" data-ui="link" data-look="solid"');
        expect(english).toEndWith(">Hello</a></div></section></div>");
        expect(arabic).toContain(">الطلبات</h2>");
        expect(arabic).toContain(">هذه الصفحة خارج صلاحياتك</h1>");
        expect(arabic).toContain(">أهلاً</a>");

    });
    it("a confirmation holds nothing until asked, then asks in the chosen language with the safe answer first", async () => {

        expect(renderToStaticMarkup(<Confirm locale="ar" />)).toEndWith('"></dialog>');

        const asked = ask("hello.refresh");
        const arabic = renderToStaticMarkup(<Confirm locale="ar" />);
        const english = renderToStaticMarkup(<Confirm locale="en" />);
        const id = /<dialog role="alertdialog" aria-labelledby="([^"]+)"/.exec(arabic)?.[1] ?? "";

        expect(id).not.toBe("");
        expect(arabic).toContain(">تأكيد</p>");
        expect(arabic).toContain(`<h2 id="${id}" data-ui="heading" data-look="section"`);
        expect(arabic).toContain(">تحية جديدة</h2>");
        expect(arabic.indexOf(">لا</span>")).toBeGreaterThan(0);
        expect(arabic.indexOf(">نعم</span>")).toBeGreaterThan(arabic.indexOf(">لا</span>"));
        expect(arabic).toContain('data-look="ghost"');
        expect(arabic).toContain('data-look="danger"');
        expect(english).toContain(">Confirmation</p>");
        expect(english).toContain(">New greeting</h2>");
        expect(english).toContain(">No</span>");
        expect(english).toContain(">Yes</span>");
        answer(true);
        expect(await asked).toBe(true);
        expect(renderToStaticMarkup(<Confirm locale="ar" />)).toEndWith('"></dialog>');

    });

});
