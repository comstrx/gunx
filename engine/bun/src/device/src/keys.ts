export type Key = { key: string; code: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; repeat: boolean; typing?: boolean | undefined };
export type Combo = { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean };

const aliases = new Map<string, string>([
    ["esc", "escape"], ["return", "enter"], ["space", " "], ["spacebar", " "], ["up", "arrowup"], ["down", "arrowdown"], ["left", "arrowleft"], ["right", "arrowright"],
    ["del", "delete"], ["ins", "insert"], ["pgup", "pageup"], ["pgdn", "pagedown"], ["plus", "+"], ["comma", ","],
]);
const plain = /^[a-z0-9]$/;
const listed = /([^+,\s])\s*\+\s*,/g;
const joined = /\s*\+\s*/g;

function physical ( wanted: string ): string {

    if ( wanted >= "a" && wanted <= "z" ) return `Key${wanted.toUpperCase()}`;
    if ( wanted >= "0" && wanted <= "9" ) return `Digit${wanted}`;

    return "";

}
function symbol ( key: string ): boolean {

    return key.length === 1 && key !== " " && !plain.test(key);

}
function struck ( pressed: Key, wanted: string ): boolean {

    const key = pressed.key.toLowerCase();

    if ( key === wanted ) return true;
    if ( wanted.length !== 1 || plain.test(key) ) return false;

    const code = physical(wanted);

    return code !== "" && pressed.code === code;

}

export function combo ( text: string, mac = false ): Combo {

    const lowered = text.trim().toLowerCase().replace(joined, "+");
    const plus = lowered === "+" || lowered.endsWith("++");
    const parts = (plus ? lowered.slice(0, -1) : lowered).split("+").map(( part ) => part.trim()).filter(Boolean);
    const made: Combo = { key: plus ? "+" : "", ctrl: false, meta: false, shift: false, alt: false };

    for ( const part of parts ) {

        if ( part === "mod" ) made[mac ? "meta" : "ctrl"] = true;
        else if ( part === "ctrl" || part === "control" ) made.ctrl = true;
        else if ( part === "meta" || part === "cmd" || part === "command" || part === "win" ) made.meta = true;
        else if ( part === "shift" ) made.shift = true;
        else if ( part === "alt" || part === "option" ) made.alt = true;
        else made.key = aliases.get(part) ?? part;

    }

    return made;

}
export function combos ( text: string, mac = false ): Combo[] {

    const out: Combo[] = [];

    for ( const part of text.replace(listed, "$1+comma").split(",") ) {

        const made = combo(part, mac);

        if ( made.key !== "" ) out.push(made);

    }

    return out;

}
export function matches ( pressed: Key, wanted: Combo ): boolean {

    if ( wanted.key === "" || typeof pressed.key !== "string" ) return false;
    if ( pressed.ctrl !== wanted.ctrl || pressed.meta !== wanted.meta || pressed.alt !== wanted.alt ) return false;
    if ( pressed.shift !== wanted.shift && (wanted.shift || !symbol(wanted.key)) ) return false;

    return struck(pressed, wanted.key);

}
export function describe ( wanted: Combo, mac = false ): string {

    const parts: string[] = [];

    if ( wanted.ctrl ) parts.push(mac ? "⌃" : "Ctrl");
    if ( wanted.alt ) parts.push(mac ? "⌥" : "Alt");
    if ( wanted.shift ) parts.push(mac ? "⇧" : "Shift");
    if ( wanted.meta ) parts.push(mac ? "⌘" : "Win");

    const key = wanted.key === " " ? "Space" : wanted.key.length === 1 ? wanted.key.toUpperCase() : wanted.key.replace(/^arrow/, "").replace(/^./, ( first ) => first.toUpperCase());

    parts.push(key);

    return parts.join(mac ? "" : "+");

}
