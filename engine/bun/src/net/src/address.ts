export type Address = { version: 4 | 6; words: readonly number[] };

const names = [".localhost", ".local", ".internal", ".home.arpa"];
const dns = /^(?:[a-z0-9-]+\.)*[a-z][a-z0-9-]*$/;

function quad ( text: string ): number[] | undefined {

    const out = [0, 0, 0, 0];
    let part = 0;
    let digits = 0;
    let byte = 0;

    if ( text.length < 7 || text.length > 15 ) return undefined;

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code === 46 ) {

            if ( digits === 0 || part === 3 ) return undefined;

            out[part] = byte;
            part += 1;
            digits = 0;
            byte = 0;

            continue;

        }

        if ( code < 48 || code > 57 || digits === 3 || (digits > 0 && byte === 0) ) return undefined;

        byte = byte * 10 + code - 48;
        digits += 1;

        if ( byte > 255 ) return undefined;

    }

    if ( part !== 3 || digits === 0 ) return undefined;

    out[3] = byte;

    return out;

}
function hextets ( text: string ): number[] | undefined {

    const size = text.length;
    const out: number[] = [];
    let gap = -1;
    let at = 0;

    if ( size < 2 || size > 45 ) return undefined;

    while ( at < size ) {

        if ( text.charCodeAt(at) === 58 ) {

            if ( text.charCodeAt(at + 1) !== 58 || gap >= 0 ) return undefined;

            gap = out.length;
            at += 2;

            continue;

        }

        const from = at;
        let word = 0;

        for ( ; at < size && at - from < 4; at += 1 ) {

            const code = text.charCodeAt(at);
            const letter = code | 32;
            const digit = code >= 48 && code <= 57 ? code - 48 : letter >= 97 && letter <= 102 ? letter - 87 : -1;

            if ( digit < 0 ) break;

            word = word * 16 + digit;

        }

        if ( at === from ) return undefined;

        if ( text.charCodeAt(at) === 46 ) {

            const bytes = quad(text.slice(from));

            if ( !bytes ) return undefined;

            out.push(((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0), ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0));

            break;

        }

        out.push(word);

        if ( at === size ) break;
        if ( text.charCodeAt(at) !== 58 ) return undefined;
        if ( text.charCodeAt(at + 1) === 58 ) continue;

        at += 1;

        if ( at === size ) return undefined;

    }

    if ( gap < 0 ) return out.length === 8 ? out : undefined;
    if ( out.length > 7 ) return undefined;

    for ( let more = 8 - out.length; more > 0; more -= 1 ) out.splice(gap, 0, 0);

    return out;

}
function unwrapped ( host: string ): string {

    const text = host.trim().toLowerCase();

    return text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;

}
function closed4 ( a: number, b: number ): boolean {

    if ( a === 0 || a === 10 || a === 127 || a >= 224 ) return true;
    if ( a === 100 && b >= 64 && b <= 127 ) return true;
    if ( a === 169 && b === 254 ) return true;
    if ( a === 172 && b >= 16 && b <= 31 ) return true;
    if ( a === 192 && b === 168 ) return true;

    return a === 198 && (b === 18 || b === 19);

}
function blank ( words: readonly number[], from: number, to: number ): boolean {

    for ( let at = from; at < to; at += 1 ) if ( words[at] !== 0 ) return false;

    return true;

}
function inner ( words: readonly number[] ): number {

    const a = words[0] ?? 0;
    const f = words[5] ?? 0;
    const low = (words[6] ?? 0) * 65536 + (words[7] ?? 0);

    if ( a === 0x2002 ) return (words[1] ?? 0) * 65536 + (words[2] ?? 0);
    if ( a === 0x64 && words[1] === 0xff9b && blank(words, 2, 6) ) return low;
    if ( blank(words, 0, 5) && (f === 0xffff || (f === 0 && low > 1)) ) return low;

    return -1;

}
export function fenced ( found: Address ): boolean {

    const words = found.words;
    const a = words[0] ?? 0;
    const b = words[1] ?? 0;

    if ( found.version === 4 ) return closed4(a, b) || (a === 192 && b === 0 && words[2] === 0);

    const held = inner(words);

    if ( held >= 0 ) return closed4(held >>> 24, (held >>> 16) & 255) || held >>> 8 === 0xc00000;
    if ( blank(words, 0, 7) && (words[7] ?? 0) <= 1 ) return true;
    if ( a === 0x64 && b === 0xff9b && words[2] === 1 ) return true;

    return (a & 0xfe00) === 0xfc00 || (a & 0xff80) === 0xfe80 || a >= 0xff00;

}
function looped ( found: Address ): boolean {

    const words = found.words;

    if ( found.version === 4 ) return words[0] === 127;
    if ( !blank(words, 0, 5) ) return false;
    if ( words[5] === 0xffff ) return (words[6] ?? 0) >> 8 === 127;

    return words[5] === 0 && words[6] === 0 && words[7] === 1;

}
function scan ( bare: string ): Address | undefined {

    const wide = bare.includes(":");
    const words = wide ? hextets(bare) : quad(bare);

    return words ? { version: wide ? 6 : 4, words } : undefined;

}
function settled ( host: string ): Address | string | undefined {

    const bare = unwrapped(host);
    const name = bare.endsWith(".") ? bare.slice(0, -1) : bare;

    if ( name === "" || name.length > 255 ) return undefined;
    const direct = scan(name);

    if ( direct ) return direct;
    if ( dns.test(name) && !name.includes("xn--") ) return name;

    try {

        const shaped = unwrapped(new URL(`http://${name.includes(":") ? `[${name}]` : name}/`).hostname);

        return scan(shaped) ?? (dns.test(shaped) ? shaped : undefined);

    } catch {

        return undefined;

    }

}
function six ( words: readonly number[] ): string {

    const text = ( from: number, to: number ): string => words.slice(from, to).map(( word ) => word.toString(16)).join(":");
    let first = -1;
    let size = 1;

    for ( let at = 0; at < 8; at += 1 ) {

        let run = 0;

        while ( at + run < 8 && words[at + run] === 0 ) run += 1;

        if ( run > size ) {

            first = at;
            size = run;

        }

        at += run;

    }

    return first < 0 ? text(0, 8) : `${text(0, first)}::${text(first + size, 8)}`;

}

export function read ( host: string ): Address | undefined {

    return scan(unwrapped(host));

}
export function shown ( found: Address ): string {

    const words = found.words;

    if ( found.version === 4 ) return `${words[0] ?? 0}.${words[1] ?? 0}.${words[2] ?? 0}.${words[3] ?? 0}`;

    const g = words[6] ?? 0;
    const h = words[7] ?? 0;

    return blank(words, 0, 5) && words[5] === 0xffff ? `${g >> 8}.${g & 255}.${h >> 8}.${h & 255}` : six(words);

}
export function isAddress ( host: string ): boolean {

    return read(host) !== undefined;

}
export function isLoopback ( host: string ): boolean {

    const found = settled(host);

    return typeof found === "string" ? found === "localhost" || found.endsWith(".localhost") : found !== undefined && looped(found);

}
export function isPrivateAddress ( host: string ): boolean {

    const found = settled(host);

    if ( found === undefined ) return true;
    if ( typeof found !== "string" ) return fenced(found);

    return !found.includes(".") || names.some(( suffix ) => found.endsWith(suffix));

}
