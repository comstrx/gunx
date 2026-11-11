export type Tokens = Readonly<Record<string, string | number>>;
export type Sheet = {
    base: Tokens;
    dark?: Tokens | undefined;
    selector?: string | undefined;
    darkSelector?: string | undefined;
    lightSelector?: string | undefined;
    prefix?: string | undefined;
};

const unsafe = /[^a-zA-Z0-9-]/g;
const hump = /([a-z0-9])([A-Z])/g;
const blank = /^[ \t]*$/;
const most = 4096;
const held = new Map<string, Map<string, string>>();
let count = 0;

function cleaned ( text: string ): string {

    return text.replace(unsafe, "-").replace(hump, "$1-$2").toLowerCase();

}
function scanned ( text: string ): string | undefined {

    const open: number[] = [];
    let quote = 0;
    let out = "";
    let from = 0;

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);
        const next = text.charCodeAt(at + 1);

        if ( code < 32 || code === 127 ) return undefined;

        if ( code === 92 ) {

            if ( !(next >= 32) || next === 127 ) return undefined;

            if ( next === 60 && quote !== 0 ) {

                out += `${text.slice(from, at)}\\3C `;
                from = at + 2;

            } else if ( next === 60 && (text.charCodeAt(at + 2) === 47 || text.charCodeAt(at + 2) === 33) ) return undefined;

            at += 1;

            continue;

        }

        if ( quote !== 0 ) {

            if ( code === quote ) quote = 0;
            else if ( code === 60 ) {

                out += `${text.slice(from, at)}\\3C `;
                from = at + 1;

            }

            continue;

        }

        if ( code === 34 || code === 39 ) quote = code;
        else if ( code === 40 ) open.push(41);
        else if ( code === 91 ) open.push(93);
        else if ( code === 41 || code === 93 ) {

            if ( open.pop() !== code ) return undefined;

        } else if ( code === 123 || code === 125 || (code === 59 && open.length === 0) ) return undefined;
        else if ( (code === 47 && next === 42) || (code === 60 && (next === 47 || next === 33)) ) return undefined;

    }

    if ( quote !== 0 || open.length > 0 ) return undefined;

    return from === 0 ? text : `${out}${text.slice(from)}`;

}
function sound ( selector: string ): boolean {

    if ( typeof selector !== "string" || selector.trim() === "" ) return false;

    for ( let at = 0; at < selector.length; at += 1 ) {

        const code = selector.charCodeAt(at);

        if ( code < 32 || code === 127 || code === 123 || code === 125 || code === 59 || code === 60 ) return false;

    }

    return true;

}
function each ( selector: string, tail: string ): string {

    const out: string[] = [];
    let depth = 0;
    let quote = 0;
    let from = 0;
    const cut = ( end: number ): void => {

        const part = selector.slice(from, end).trim();

        if ( part !== "" ) out.push(`${part}${tail}`);

        from = end + 1;

    };

    for ( let at = 0; at < selector.length; at += 1 ) {

        const code = selector.charCodeAt(at);

        if ( code === 92 ) at += 1;
        else if ( quote !== 0 ) quote = code === quote ? 0 : quote;
        else if ( code === 34 || code === 39 ) quote = code;
        else if ( code === 40 || code === 91 ) depth += 1;
        else if ( code === 41 || code === 93 ) depth -= 1;
        else if ( code === 44 && depth === 0 ) cut(at);

    }

    cut(selector.length);

    return out.join(", ");

}

export function named ( key: string, prefix = "" ): string {

    const known = held.get(prefix)?.get(key);

    if ( known !== undefined ) return known;
    if ( typeof key !== "string" || key === "" || typeof prefix !== "string" ) throw new RangeError("not a token");

    const made = `--${prefix === "" ? "" : `${cleaned(prefix)}-`}${cleaned(key)}`;
    const names = held.get(prefix) ?? new Map<string, string>();

    if ( count >= most ) {

        held.clear();
        names.clear();
        count = 0;

    }

    names.set(key, made);
    held.set(prefix, names);
    count += 1;

    return made;

}
export function valued ( value: string | number ): string {

    const made = typeof value === "number" ? (Number.isFinite(value) ? String(value) : undefined) : typeof value === "string" ? scanned(value) : undefined;

    if ( made === undefined ) throw new RangeError("not a token");

    return made;

}
export function isToken ( value: unknown ): value is string | number {

    return typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && scanned(value) !== undefined;

}
export function variables ( values: Tokens, prefix = "" ): string[] {

    return Object.entries(values).map(([key, value]) => `${named(key, prefix)}: ${valued(value)};`);

}
export function block ( selector: string, lines: readonly string[], indent = "    " ): string {

    if ( !sound(selector) ) throw new RangeError("not a selector");
    if ( typeof indent !== "string" || !blank.test(indent) ) throw new RangeError("not an indent");

    return `${selector} {\n${lines.map(( line ) => `${indent}${line}`).join("\n")}\n}`;

}
export function css ( given: Sheet ): string {

    const { base, dark, selector = ":root", darkSelector = '[data-theme="dark"]', lightSelector = '[data-theme="light"]', prefix = "" } = given;
    const parts = [block(selector, variables(base, prefix))];

    if ( dark ) {

        if ( !sound(darkSelector) || !sound(lightSelector) ) throw new RangeError("not a selector");

        const lines = variables(dark, prefix);
        const scope = selector.trimStart().charCodeAt(0) === 64 ? ":root" : selector;
        const calm = each(scope, `:not(${lightSelector.trim()})`);

        if ( calm === "" ) throw new RangeError("not a selector");

        parts.push(`@media (prefers-color-scheme: dark) {\n    ${calm} {\n${lines.map(( line ) => `        ${line}`).join("\n")}\n    }\n}`);
        parts.push(block(each(scope, darkSelector.trim()), lines));

    }

    return `${parts.join("\n\n")}\n`;

}
