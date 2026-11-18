import { describe, expect, test as it } from "bun:test";
import * as spec from "engine/spec";
import * as validate from "engine/validate";

const blocks = { stack: validate.partial(validate.strictObject({ gap: validate.enum(["sm", "md"]) })), feature: validate.strictObject({ name: validate.string() }), popup: validate.partial(validate.strictObject({ size: validate.enum(["sm", "lg"]) })) };
const features: Readonly<Record<string, spec.Manifest>> = { rows: { name: "rows", fields: ["q"], actions: ["refresh", "press"], emits: ["rows.changed"] } };
const part = spec.part({ platform: "web", blocks, features, topics: ["cart.changed"] });
const stack = spec.kind("stack");

function used (): number {

    Bun.gc(true);

    return process.memoryUsage().heapUsed;

}
function surfaceOf ( other: string ): spec.Surface {

    return spec.surface({
        config: { settings: { locales: ["en", "ar"] } },
        schema: {
            screens: [
                spec.screen("home", {
                    path: "/",
                    layout: [stack({ gap: "md" }, [spec.feature("rows", {
                        watch: { "form.q": spec.debounce(1, spec.set("signals.asked", spec.from("form.q"))) },
                        on: { load: [spec.toggle("signals.open"), spec.after(20, spec.set("signals.never", true))], success: spec.transfer(other, { with: { round: spec.from("signals.round") } }), "rows.changed": spec.set("signals.heard", spec.fromEvent("id")) },
                    })])],
                }),
                spec.screen("list", { layout: [spec.feature("rows", { id: "inner", on: { "rows.changed": spec.after(20, spec.set("signals.late", true)) } })] }),
            ],
            signals: ["round"],
            on: { enter: spec.set("signals.round", spec.fromEvent("round")), leave: spec.clear("signals.asked"), "cart.changed": spec.set("signals.cart", spec.fromEvent("count")) },
        },
    });

}

describe("spec soak", () => {

    it("two thousand rounds of mounting, popups, events, waits and transfers leave no subscriber, no popup and no growing heap", async () => {

        const built = spec.build(spec.define({ one: surfaceOf("two"), two: surfaceOf("one") }), part);
        const host = spec.boot(JSON.parse(JSON.stringify(built.artifact("one"))), { sinks: [], navigate: () => undefined, carry: () => ({ locale: "ar" }), handlers: { "rows.press": () => "ok", "inner.press": () => "ok" } });
        const round = async ( turn: number ): Promise<void> => {

            const { app } = host;
            const mounted = await app.live.mount("home");

            await app.open("/list", { size: "lg" });
            await app.open("/list");
            app.bus.publish("rows.changed", { id: turn });
            app.bus.publish("cart.changed", { count: turn });
            app.live.set("form.q", `q${turn}`);
            app.live.set("signals.round", turn);
            app.text(turn % 2 === 0 ? "en" : "ar", "rows.title");
            await app.close();
            await mounted.unmount();

            const again = await app.live.mount("home");

            await app.live.act("rows", "press");
            await again.unmount();

        };

        for ( let turn = 0; turn < 200; turn += 1 ) await round(turn);

        const before = used();
        const subscribers = [host.of("one").bus.count(), host.of("two").bus.count()];

        for ( let turn = 200; turn < 2200; turn += 1 ) await round(turn);

        const grown = used() - before;
        const { app } = host;

        expect([host.active.getState(), app.live.get("signals.round"), host.of("two").live.get("signals.cart"), host.of("one").popups.getState().length, host.of("two").popups.getState().length]).toEqual(["one", 2199, 2199, 0, 0]);
        expect([host.of("one").bus.count(), host.of("two").bus.count()]).toEqual(subscribers);
        await new Promise(( resolve ) => { setTimeout(resolve, 40); });

        expect(["one", "two"].flatMap(( name ) => [host.of(name).live.get("signals.never"), host.of(name).live.get("signals.late")])).toEqual([undefined, undefined, undefined, undefined]);
        expect(grown, `heap grew ${grown} bytes over 2000 rounds`).toBeLessThan(4 * 1024 * 1024);

    }, 60_000);

});
