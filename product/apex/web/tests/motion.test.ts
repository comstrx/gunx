import { describe, expect, test as it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useMotion } from "../src/hooks/use-motion.ts";

function shown ( values: Record<string, string> ): string {

    const target = globalThis as Record<string, unknown>;
    const before = ["document", "getComputedStyle"].map(( name ) => [name, Object.getOwnPropertyDescriptor(target, name)] as const);

    Object.defineProperty(target, "document", { value: { documentElement: {} }, configurable: true, writable: true });
    Object.defineProperty(target, "getComputedStyle", { value: () => ({ getPropertyValue: ( name: string ) => values[name] ?? "" }), configurable: true, writable: true });

    try {

        return renderToStaticMarkup(createElement(() => {

            const motion = useMotion();

            return createElement("i", null, `${motion.fast}/${motion.base}`);

        }));

    } finally {

        for ( const [name, was] of before ) {

            if ( was ) Object.defineProperty(target, name, was);
            else delete target[name];

        }

    }

}

describe("motion", () => {

    it("the timers follow the sheet's variables in milliseconds, whatever unit the sheet was minified to, and a missing one is no wait", () => {

        expect(shown({ "--motion-fast": "140ms", "--motion-base": " 220ms " })).toBe("<i>140/220</i>");
        expect(shown({ "--motion-fast": ".14s", "--motion-base": "0.2s" })).toBe("<i>140/200</i>");
        expect(shown({ "--motion-fast": "0ms" })).toBe("<i>0/0</i>");

    });

});
