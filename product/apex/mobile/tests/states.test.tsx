import { describe, expect, test as it } from "bun:test";
import * as device from "engine/device";
import * as error from "engine/error";
import { renderToStaticMarkup } from "react-dom/server";
import { Confirm } from "../src/components/confirm.tsx";
import { Denied } from "../src/components/denied.tsx";
import { Stale } from "../src/components/stale.tsx";
import { reload } from "../src/hooks/use-stale.ts";
import { answer, ask, compiled, menu, textOf } from "../src/specs/runtime.ts";
import { faults, instance } from "../src/stores/preferences.ts";

const page = "Orders";

function said ( markup: string ): string[] {

    return markup.split(/<[^>]*>/).filter(( text ) => text !== "");

}
function named ( markup: string ): string {

    return /aria-labelledby="([^"]+)"/.exec(markup)?.[1] ?? "";

}

describe("states", () => {

    it("a denied page says the same on every surface: its name, the reason, the way out", () => {

        for ( const locale of compiled.role.config.settings.locales ) {

            const markup = renderToStaticMarkup(<Denied locale={locale} at="/nope" page={page} />);
            const first = menu(locale, "/nope")[0];

            expect(first).toBeDefined();
            expect(said(markup)).toEqual([page, textOf(locale, "nav.denied"), textOf(locale, "nav.deniedHint"), first?.title ?? ""]);
            expect(named(markup)).not.toBe("");
            expect(markup).toContain(`id="${named(markup)}"`);

        }

    });
    it("a confirmation says nothing until asked, then the question with the safe answer first", async () => {

        expect(said(renderToStaticMarkup(<Confirm locale={compiled.role.config.settings.locale} />))).toEqual([]);

        const asked = ask("nav.denied");

        for ( const locale of compiled.role.config.settings.locales ) {

            const markup = renderToStaticMarkup(<Confirm locale={locale} />);

            expect(markup).toContain('role="alertdialog"');
            expect(said(markup)).toEqual([textOf(locale, "nav.confirm"), textOf(locale, "nav.denied"), textOf(locale, "nav.no"), textOf(locale, "nav.yes")]);
            expect(named(markup)).not.toBe("");
            expect(markup).toContain(`id="${named(markup)}"`);

        }

        answer(true);
        expect(await asked).toBe(true);
        expect(said(renderToStaticMarkup(<Confirm locale={compiled.role.config.settings.locale} />))).toEqual([]);

    });
    it("a frozen preference store says nothing until a newer version is saved, then asks to reload with the gentle answer first", () => {

        const home = compiled.role.config.settings.locale;

        faults.set(undefined);
        expect(said(renderToStaticMarkup(<Stale locale={home} />))).toEqual([]);
        faults.set(error.fault("unavailable", "state.unguarded"));
        expect(said(renderToStaticMarkup(<Stale locale={home} />))).toEqual([]);
        faults.set(error.fault("conflict", "state.newer"));

        for ( const locale of compiled.role.config.settings.locales ) {

            const markup = renderToStaticMarkup(<Stale locale={locale} />);

            expect(markup).toContain('role="alertdialog"');
            expect(said(markup)).toEqual([textOf(locale, "nav.stale"), textOf(locale, "nav.staleHint"), textOf(locale, "nav.later"), textOf(locale, "nav.reload")]);
            expect(named(markup)).not.toBe("");
            expect(markup).toContain(`id="${named(markup)}"`);

        }

        faults.set(undefined);
        expect(said(renderToStaticMarkup(<Stale locale={home} />))).toEqual([]);

    });
    it("reload asks the host to reload the page, and where the host cannot, re-reads the saved preferences instead", async () => {

        const asked: string[] = [];
        const kept = instance.reload;

        instance.reload = async () => {

            asked.push("reread");

        };

        try {

            await device.port.with({ ...device.unknown, reload: () => { asked.push("page"); return true; } }, () => reload());
            await device.port.with(device.unknown, () => reload());

        } finally {

            instance.reload = kept;

        }

        expect(asked).toEqual(["page", "reread"]);

    });

});
