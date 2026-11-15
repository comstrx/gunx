import { expect, test as it } from "bun:test";
import * as state from "engine/state";

it("combining subscriptions rolls back all prior acquisitions after a failure", () => {

    let active = 0;
    const first: state.Readable<number> = { getState: () => 1, subscribe: () => { active += 1; return () => { active -= 1; }; } };
    const second: state.Readable<number> = { getState: () => 2, subscribe: () => { throw new Error("refused"); } };

    expect(() => state.combine({ first, second }).subscribe(() => undefined)).toThrow("refused");
    expect(active).toBe(0);

});

it("combining releases every source even when a disposer fails and never releases twice", () => {

    const calls: number[] = [];
    const first: state.Readable<number> = { getState: () => 1, subscribe: () => () => { calls.push(1); throw new Error("close"); } };
    const second: state.Readable<number> = { getState: () => 2, subscribe: () => () => { calls.push(2); } };
    const stop = state.combine({ first, second }).subscribe(() => undefined);

    expect(stop).toThrow("close");
    expect(calls).toEqual([1, 2]);
    expect(stop).not.toThrow();
    expect(calls).toEqual([1, 2]);

});
