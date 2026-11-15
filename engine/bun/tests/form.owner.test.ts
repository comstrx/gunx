import { expect, test as it } from "bun:test";
import * as form from "engine/form";
import * as validate from "engine/validate";

const schema = validate.object({ name: validate.string(), scope: validate.string() });
const initial = { name: "same", scope: "first" };

it("verification belongs to the whole values snapshot", async () => {

    let calls = 0;
    const made = form.define({ schema, initial, submit: async () => undefined });
    const ask: form.Ask<typeof initial> = ( _, values ) => {

        calls += 1;

        return values.scope === "first" ? undefined : "wrong scope";

    };

    expect(await made.verify("name", ask)).toBe(true);
    expect(await made.verify("name", ask)).toBe(true);
    expect(calls).toBe(1);
    made.set("scope", "second");
    expect(await made.verify("name", ask)).toBe(false);
    expect(calls).toBe(2);

});

it("editing another field cancels a running whole-form verifier", async () => {

    const held = Promise.withResolvers<string | undefined>();
    const made = form.define({ schema, initial, submit: async () => undefined });
    const pending = made.verify("name", () => held.promise);

    await Promise.resolve();
    made.set("scope", "second");
    held.resolve("obsolete");
    expect(await pending).toBe(false);
    expect(made.errors()).toEqual({});
    expect(made.state.getState().checking).toEqual([]);

});

it("reset before dispatch never calls a verifier", async () => {

    let calls = 0;
    const made = form.define({ schema, initial, submit: async () => undefined });
    const pending = made.verify("name", () => { calls += 1; return undefined; });

    made.reset();
    expect(await pending).toBe(false);
    expect(calls).toBe(0);

});

it("abort before dispatch never calls the submitter", async () => {

    let calls = 0;
    const made = form.define({ schema, initial, submit: async () => { calls += 1; return calls; } });
    const pending = made.submit();

    made.abort();
    expect(await pending).toBeUndefined();
    expect(calls).toBe(0);

});

it("reentrant submit joins the published flight", async () => {

    let calls = 0;
    let joined: Promise<number | undefined> | undefined;
    let entered = false;
    const made = form.define({ schema, initial, submit: async () => { calls += 1; return calls; } });
    const stop = made.state.subscribe(( current ) => {

        if ( current.status !== "pending" || entered ) return;

        entered = true;
        joined = made.submit();

    });
    const pending = made.submit();

    expect(joined).toBe(pending);
    expect(await pending).toBe(1);
    expect(calls).toBe(1);
    stop();

});

it("editing a verifier dependency clears its old rejection without clearing server errors", async () => {

    const made = form.define({ schema, initial, submit: async () => undefined });
    const ask: form.Ask<typeof initial> = ( _, values ) => values.scope === "first" ? "wrong scope" : undefined;

    expect(await made.verify("name", ask)).toBe(false);
    made.fail({ scope: "server-owned" });
    made.set("scope", "second");
    expect(await made.verify("name", ask)).toBe(true);

    made.fail({ name: "server-owned" });
    made.set("scope", "third");
    expect(made.errors().name).toBe("server-owned");

});
