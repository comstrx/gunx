import { expect, test as it } from "bun:test";
import * as device from "engine/device";

it("device capability reporting and invocation agree for class adapters", async () => {

    class Driver {

        #clipboard = "";
        info = (): device.Info => device.unknownInfo();
        watch = (): (() => void) => () => undefined;

        async copy ( text: string ): Promise<boolean> { this.#clipboard = text; return true; }
        async paste (): Promise<string> { return this.#clipboard; }

    }

    const made = device.create(new Driver());

    expect(made.can("copy")).toBe(true);
    expect(await made.copy("owned")).toBe(true);
    expect(await made.paste()).toBe("owned");

});
