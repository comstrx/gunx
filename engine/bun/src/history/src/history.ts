import * as adapter from "engine-adapter";
import * as error from "engine-error";
import * as json from "engine-json";
import * as parse_ from "engine-parse";

export type Href = { path: string; query: parse_.Query; hash: string };
export type Target = string | Partial<Href>;
export type Action = "push" | "replace" | "pop";
export type Entry = Href & { href: string; state: unknown; index: number };
export type Listener = ( entry: Entry, action: Action, previous: Entry ) => void;
export type Block = ( next: Entry, previous: Entry, action: Action ) => boolean;
export type Saved = { href: string; state: unknown };
export type Snapshot = { entries: readonly Saved[]; index: number };
export type Adapter = {
    read: () => Saved;
    push: ( href: string, state: unknown ) => void;
    replace: ( href: string, state: unknown ) => void;
    go: ( delta: number ) => void;
    listen: ( onPop: ( state: unknown ) => void ) => () => void;
};
export type Memory = Adapter & { entries: () => string[]; snapshot: () => Snapshot };
export type History = {
    current: () => Entry;
    push: ( to: Target, state?: unknown ) => Entry;
    replace: ( to: Target, state?: unknown ) => Entry;
    back: () => void;
    forward: () => void;
    go: ( delta: number ) => void;
    listen: ( listener: Listener ) => () => void;
    block: ( blocked: Block ) => () => void;
    href: ( to: Target ) => string;
    isCurrent: ( path: string, exact?: boolean ) => boolean;
    destroy: () => void;
};

type Held = { at: number | undefined; state: unknown };
type Seen = { href: string; state: unknown; entry: Entry };
type Failed = { failure: unknown };

const plain = /^(?:\/[A-Za-z0-9_~-]+)+$/;
const blanks = /[\t\n\r]/g;
const stray = /%(?![0-9A-Fa-f]{2})/g;
const rough = /[^A-Za-z0-9._~!$&'()*+,;=:@/%-]+/g;
const loose = /[^A-Za-z0-9._~!$&'()*+,;=:@/?-]+/g;
const single = /^(?:\.|%2e)$/i;
const double = /^(?:\.|%2e){2}$/i;
const lost = "%EF%BF%BD";

function tidy ( text: string ): string {

    let from = 0;
    let to = text.length;

    while ( from < to && text.charCodeAt(from) <= 32 ) from += 1;
    while ( to > from && text.charCodeAt(to - 1) <= 32 ) to -= 1;

    return text.slice(from, to).replace(blanks, "");

}
function encoded ( text: string, unsafe: RegExp ): string {

    return text.replace(unsafe, ( run ) => {

        try {

            return encodeURIComponent(run);

        } catch {

            return Array.from(run, ( point ) => (point.length === 1 && point >= "\ud800" && point <= "\udfff" ? lost : encodeURIComponent(point))).join("");

        }

    });

}
function decoded ( text: string ): string {

    if ( !text.includes("%") ) return text;

    try {

        return decodeURIComponent(text);

    } catch {

        return text;

    }

}
function pathOf ( text: string ): string {

    if ( plain.test(text) ) return text;

    const parts: string[] = [];

    for ( const part of text.replace(/\\/g, "/").split("/") ) {

        if ( double.test(part) ) parts.pop();
        else if ( !single.test(part) ) parts.push(part);

    }

    return `/${encoded(parts.join("/").replace(stray, "%25"), rough).replace(/^\/+|\/+$/g, "")}`;

}
function bare ( href: string ): string {

    const text = tidy(href);
    const at = text.search(/[?#]/);

    return pathOf(at === -1 ? text : text.slice(0, at));

}
function compose ( path: string, query: parse_.Query | undefined, hash: string | undefined ): string {

    const asked = query ? parse_.queryString(query, "repeat") : "";
    const mark = hash ? encoded(hash, loose) : "";

    return `${path}${asked ? `?${asked}` : ""}${mark ? `#${mark}` : ""}`;

}
function under ( wanted: string, now: string, exact: boolean ): boolean {

    if ( exact || wanted === "/" ) return wanted === now;

    return now === wanted || now.startsWith(`${wanted}/`);

}
function each<T> ( items: ReadonlySet<T>, tell: ( item: T ) => void ): void {

    let failed: Failed | undefined;

    for ( const item of [...items] ) {

        try {

            tell(item);

        } catch ( failure ) {

            failed ??= { failure };

        }

    }

    if ( failed ) throw failed.failure;

}
function sealed ( entry: Entry ): Entry {

    for ( const found of Object.values(entry.query) ) if ( Array.isArray(found) ) Object.freeze(found);

    Object.freeze(entry.query);

    return Object.freeze(entry);

}
function wrap ( at: number, state: unknown, around?: unknown ): Record<string, unknown> {

    return { ...(json.isRecord(around) ? around : {}), engine: { at, state } };

}
function unwrap ( raw: unknown ): Held {

    const held = json.isRecord(raw) ? raw.engine : undefined;

    return json.isRecord(held) && typeof held.at === "number" && Number.isSafeInteger(held.at) && held.at >= 0 ? { at: held.at, state: held.state ?? null } : { at: undefined, state: null };

}
function restored ( snapshot: Snapshot ): Saved[] {

    const entries: readonly unknown[] = Array.isArray(snapshot.entries) ? snapshot.entries : [];

    return entries.flatMap(( entry ) => (json.isRecord(entry) && typeof entry.href === "string" ? [{ href: entry.href, state: entry.state ?? null }] : []));

}

export function parse ( href: string ): Href {

    const text = tidy(href);
    const hashAt = text.indexOf("#");
    const rest = hashAt === -1 ? text : text.slice(0, hashAt);
    const queryAt = rest.indexOf("?");

    return {
        path: pathOf(queryAt === -1 ? rest : rest.slice(0, queryAt)),
        query: queryAt === -1 ? {} : parse_.query(rest.slice(queryAt + 1)),
        hash: hashAt === -1 ? "" : decoded(text.slice(hashAt + 1)),
    };

}
export function format ( href: Partial<Href> ): string {

    return compose(pathOf(href.path ?? "/"), href.query, href.hash);

}
export function local ( href: string ): Href | undefined {

    const text = tidy(href);
    const next = text.charAt(1);

    return text.startsWith("/") && next !== "/" && next !== "\\" ? parse(text) : undefined;

}
export function isCurrent ( path: string, current: string, exact = false ): boolean {

    return under(bare(path), bare(current), exact);

}
export function memoryAdapter ( initial: string | Snapshot = "/", limit = 100 ): Memory {

    const cap = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 100;
    const stack: Saved[] = typeof initial === "string" ? [{ href: initial, state: null }] : restored(initial);
    const handlers = new Set<( state: unknown ) => void>();

    if ( stack.length === 0 ) stack.push({ href: "/", state: null });

    let index = typeof initial === "string" ? 0 : Math.min(Math.max(0, Math.trunc(Number(initial.index)) || 0), stack.length - 1);
    const head = Math.min(Math.max(0, stack.length - cap), index);

    stack.splice(0, head);
    stack.splice(cap);
    index -= head;

    return {
        entries: () => stack.map(( entry ) => entry.href),
        snapshot: () => ({ entries: stack.map(( entry ) => ({ ...entry })), index }),
        read: () => stack[index] ?? { href: "/", state: null },
        push: ( href, state ) => {

            stack.splice(index + 1);
            stack.push({ href, state });

            if ( stack.length > cap ) stack.splice(0, stack.length - cap);

            index = stack.length - 1;

        },
        replace: ( href, state ) => {

            stack[index] = { href, state };

        },
        go: ( delta ) => {

            const step = Math.trunc(delta);
            const next = index + step;

            if ( !step || next < 0 || next >= stack.length ) return;

            const state = stack[next]?.state;

            index = next;
            each(handlers, ( handler ) => handler(state));

        },
        listen: ( handler ) => {

            handlers.add(handler);

            return () => {

                handlers.delete(handler);

            };

        },
    };

}
export function webAdapter ( host: adapter.Host = adapter.host() ): Adapter | undefined {

    const place = host.location;
    const stack = host.history;

    if ( !place || !stack ) return undefined;

    return {
        read: () => ({ href: `${place.pathname}${place.search}${place.hash}`, state: stack.state }),
        push: ( href, state ) => stack.pushState(state, "", href),
        replace: ( href, state ) => stack.replaceState(state, "", href),
        go: ( delta ) => {

            if ( delta && Number.isFinite(delta) ) stack.go(delta);

        },
        listen: ( onPop ) => {

            const handler = (( event: { state: unknown } ): void => onPop(event.state)) as adapter.Handler;

            host.addEventListener?.("popstate", handler);

            return () => host.removeEventListener?.("popstate", handler);

        },
    };

}
export const port: adapter.Port<Adapter> = adapter.port<Adapter>("history", { fallback: adapter.web<Adapter>("history", webAdapter, () => memoryAdapter()) });

export function create ( given: Adapter = port.get(), base = "" ): History {

    const listeners = new Set<Listener>();
    const blockers = new Set<Block>();
    const waiting: (() => void)[] = [];
    const root = bare(base);
    const prefix = root === "/" ? "" : root;
    const inside = ( path: string ): string => (prefix && (path === prefix || path.startsWith(`${prefix}/`)) ? path.slice(prefix.length) || "/" : path);
    let seen: Seen | undefined;
    const entryOf = ( read: Saved ): Entry => {

        if ( seen && seen.href === read.href && seen.state === read.state ) return seen.entry;

        const parsed = parse(read.href);
        const held = unwrap(read.state);
        const path = inside(parsed.path);
        const entry = sealed({ path, query: parsed.query, hash: parsed.hash, href: compose(path, parsed.query, parsed.hash), state: held.state, index: held.at ?? seen?.entry.index ?? 0 });

        seen = { href: read.href, state: read.state, entry };

        return entry;

    };
    let last = entryOf(given.read());
    let spot = last.index;
    let low = spot;
    let roof = spot;
    let owed: number | undefined;
    const current = (): Entry => (owed === undefined ? entryOf(given.read()) : last);
    const lands = ( delta: number | undefined ): boolean => delta !== undefined && spot + delta >= low && spot + delta <= roof;
    const reach = ( index: number, fresh = false ): void => {

        spot = index;
        low = fresh ? index : Math.min(low, index);
        roof = fresh ? index : Math.max(roof, index);

    };
    const resolve = ( to: Target, from: Entry ): Href => {

        if ( typeof to !== "string" ) {

            const parsed = to.path === undefined ? undefined : parse(to.path);

            return { path: parsed?.path ?? from.path, query: to.query ?? parsed?.query ?? from.query, hash: to.hash ?? parsed?.hash ?? "" };

        }

        const text = tidy(to);
        const parsed = parse(text);
        const lead = text.charAt(0);

        if ( lead === "?" ) return { path: from.path, query: parsed.query, hash: parsed.hash };
        if ( lead === "#" ) return { path: from.path, query: from.query, hash: parsed.hash };

        return parsed;

    };
    const refused = ( next: Entry, previous: Entry, action: Action ): boolean => [...blockers].some(( blocked ) => blocked(next, previous, action));
    const settle = ( action: Action, previous: Entry ): Entry => {

        const made = entryOf(given.read());

        last = made;
        reach(made.index, action === "push");
        each(listeners, ( listener ) => listener(made, action, previous));

        return made;

    };
    const move = ( action: "push" | "replace", to: Target, state: unknown ): Entry => {

        if ( owed !== undefined ) {

            waiting.push(() => {

                move(action, to, state);

            });

            return last;

        }

        const read = given.read();
        const from = entryOf(read);
        const target = resolve(to, from);
        const href = compose(target.path, target.query, target.hash);
        const next: Entry = { ...target, href, state, index: action === "push" ? from.index + 1 : from.index };

        if ( refused(next, from, action) ) return from;

        try {

            if ( action === "push" && unwrap(read.state).at === undefined ) given.replace(read.href, wrap(from.index, null, read.state));

            given[action](`${prefix}${href}`, wrap(next.index, state, action === "replace" ? read.state : undefined));

        } catch ( cause ) {

            throw error.isFault(cause) ? cause : error.fault("unavailable", "history.refused", { cause });

        }

        return settle(action, from);

    };
    const flush = (): void => {

        let failed: Failed | undefined;

        while ( owed === undefined ) {

            const run = waiting.shift();

            if ( !run ) break;

            try {

                run();

            } catch ( failure ) {

                failed ??= { failure };

            }

        }

        if ( failed ) throw failed.failure;

    };
    const revert = ( pending: number | undefined ): void => {

        if ( lands(pending) ) {

            owed = pending;

            return;

        }

        owed = last.index - spot;

        try {

            given.go(owed);

        } catch ( failure ) {

            owed = undefined;

            throw failure;

        }

    };
    const arrive = (): void => {

        const next = entryOf(given.read());
        const flown = owed;
        const echo = flown !== undefined && next.index - spot === flown;
        const pending = echo ? undefined : flown;
        let failed: Failed | undefined;
        let blocked = echo;

        owed = undefined;
        reach(next.index);

        if ( next === last || (flown !== undefined && next.index === last.index && next.href === last.href) ) {

            last = next;

            if ( lands(pending) ) owed = pending;

            return;

        }

        if ( !echo && next.index !== last.index ) {

            try {

                blocked = refused(next, last, "pop");

            } catch ( failure ) {

                failed = { failure };
                blocked = true;

            }

        }

        const here = entryOf(given.read());

        if ( here !== last && blocked && here.index !== last.index ) {

            reach(here.index);
            revert(pending);

        } else {

            if ( here !== last ) settle("pop", last);

            if ( lands(pending) ) owed = pending;

        }

        if ( failed ) throw failed.failure;

    };
    const go = ( delta: number ): void => {

        const step = Math.trunc(delta);

        if ( step && Number.isFinite(step) ) given.go(step);

    };
    const stop = given.listen(() => {

        try {

            arrive();

        } finally {

            if ( owed === undefined ) flush();

        }

    });

    return {
        current,
        push: ( to, state = null ) => move("push", to, state),
        replace: ( to, state = null ) => move("replace", to, state),
        back: () => go(-1),
        forward: () => go(1),
        go,
        listen: ( listener ) => {

            listeners.add(listener);

            return () => {

                listeners.delete(listener);

            };

        },
        block: ( blocked ) => {

            blockers.add(blocked);

            return () => {

                blockers.delete(blocked);

            };

        },
        href: ( to ) => {

            const target = resolve(to, current());

            return `${prefix}${compose(target.path, target.query, target.hash)}`;

        },
        isCurrent: ( path, exact = false ) => under(bare(path), current().path, exact),
        destroy: () => {

            stop();
            listeners.clear();
            blockers.clear();
            waiting.length = 0;
            owed = undefined;

        },
    };

}
