import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as history from "engine/history";

type Row = { href: string; state: unknown };
type Pop = ( event: { state: unknown } ) => void;
type Host = NonNullable<Parameters<typeof history.webAdapter>[0]>;

function browser ( start: string, refuse: "" | "push" | "replace" = "" ) {

    const rows: Row[] = [{ href: start, state: null }];
    const handlers = new Set<Pop>();
    const calls: string[] = [];
    const pending: number[] = [];
    let at = 0;
    const here = (): string => rows[at]?.href ?? "/";
    const host = {
        location: {
            get pathname () { return here().split(/[?#]/)[0] ?? "/"; },
            get search () { return here().split("#")[0]?.match(/\?.*$/)?.[0] ?? ""; },
            get hash () { return here().match(/#.*$/)?.[0] ?? ""; },
        },
        history: {
            get state () { return rows[at]?.state; },
            pushState ( state: unknown, _title: string, href: string ) {

                calls.push(`push ${href}`);

                if ( refuse === "push" ) throw Object.assign(new Error("too many calls"), { name: "SecurityError" });

                rows.splice(at + 1);
                rows.push({ href, state });
                at = rows.length - 1;

            },
            replaceState ( state: unknown, _title: string, href: string ) {

                calls.push(`replace ${href}`);

                if ( refuse === "replace" ) throw Object.assign(new Error("not cloneable"), { name: "DataCloneError" });

                rows[at] = { href, state };

            },
            go ( delta: number ) {

                calls.push(`go ${delta}`);
                pending.push(delta);

            },
        },
        addEventListener ( name: string, handler: Pop ) {

            if ( name === "popstate" ) handlers.add(handler);

        },
        removeEventListener ( _name: string, handler: Pop ) {

            handlers.delete(handler);

        },
    };
    const found = history.webAdapter(host as unknown as Host);

    if ( !found ) throw new Error("no web adapter");

    return {
        adapter: found,
        calls,
        rows,
        where: here,
        list: () => rows.map(( row ) => row.href).join(" "),
        ears: () => handlers.size,
        owed: () => pending.length,
        user: ( delta: number ) => pending.push(delta),
        arrive: (): void => {

            const delta = pending.shift() ?? 0;
            const next = at + delta;

            if ( !delta || next < 0 || next >= rows.length ) return;

            at = next;

            for ( const handler of [...handlers] ) handler({ state: rows[at]?.state });

        },
    };

}
function caught ( work: () => unknown ): unknown {

    try {

        work();

    } catch ( failure ) {

        return failure;

    }

    return undefined;

}

describe("history", () => {

    it("hrefs parse and format round trip", () => {

        expect(history.parse("/users/7?tab=a&tab=b&x=1#top")).toEqual({ path: "/users/7", query: { tab: ["a", "b"], x: "1" }, hash: "top" });
        expect(history.parse("users//7/")).toEqual({ path: "/users//7", query: {}, hash: "" });
        expect(history.parse("")).toEqual({ path: "/", query: {}, hash: "" });
        expect(history.format({ path: "/a", query: { x: "1", y: ["2", "3"] }, hash: "h" })).toBe("/a?x=1&y=2&y=3#h");
        expect(history.format({})).toBe("/");
        expect(history.isCurrent("/users", "/users/7") && !history.isCurrent("/users", "/users/7", true) && !history.isCurrent("/use", "/users")).toBe(true);
        expect(history.isCurrent("/", "/") && !history.isCurrent("/", "/x")).toBe(true);

    });
    it("memory navigation pushes, replaces, pops and notifies", () => {

        const adapter = history.memoryAdapter("/start");
        const nav = history.create(adapter, "/app");
        const seen: string[] = [];
        const stop = nav.listen(( entry, action ) => { seen.push(`${action}:${entry.href}`); });

        expect(nav.current().path).toBe("/start");
        expect(nav.push("/users", { from: "home" }).state).toEqual({ from: "home" });
        expect(adapter.entries()).toEqual(["/start", "/app/users"]);
        expect(nav.push({ path: "/users/7", query: { tab: "x" } }).href).toBe("/users/7?tab=x");
        expect(nav.replace("/users/8").index).toBe(2);
        nav.back();
        expect(nav.current().path).toBe("/users");
        nav.forward();
        expect(nav.current().path).toBe("/users/8");
        nav.go(-5);
        expect(nav.current().path).toBe("/users/8");
        expect(nav.isCurrent("/users") && !nav.isCurrent("/users", true)).toBe(true);
        expect(nav.href({ path: "/x", query: { a: "1" } })).toBe("/app/x?a=1");
        expect(seen).toEqual(["push:/users", "push:/users/7?tab=x", "replace:/users/8", "pop:/users", "pop:/users/8"]);
        stop();
        nav.push("/quiet");
        expect(seen).toHaveLength(5);
        nav.destroy();
        expect(history.webAdapter()).toBeUndefined();
        expect(history.port.has() && !history.port.bound()).toBe(true);
        expect(history.create().current().path).toBe("/");

        const restore = history.port.use(history.memoryAdapter("/bound"));

        expect(history.create().current().path).toBe("/bound");
        restore();

    });
    it("a guard restores the previous entry when a move is refused and patchQuery edits the query in place", () => {

        const made = history.create(history.memoryAdapter("/orders?page=2"));
        let locked = true;
        const stop = history.guard(made, ( next ) => locked && next.path !== "/orders");

        made.push("/settings");
        expect(made.current().path).toBe("/orders");
        expect(made.current().query).toEqual({ page: "2" });
        locked = false;
        made.push("/settings");
        expect(made.current().path).toBe("/settings");
        stop();
        made.push("/orders?page=1&q=a");
        expect(history.patchQuery(made, { page: "3", q: null, sort: ["name", "-date"] }).href).toBe("/orders?page=3&sort=name&sort=-date");
        expect(made.current().query).toEqual({ page: "3", sort: ["name", "-date"] });
        made.destroy();

    });
    it("a path is canonical: one leading slash, dots resolved, unsafe bytes encoded", () => {

        const lone = String.fromCharCode(0xd800);
        const table: [string, string][] = [
            ["/a/./b/../c", "/a/c"],
            ["/%2e%2e/%2E%2e/x", "/x"],
            ["/a/%2E/b", "/a/b"],
            ["/../../x", "/x"],
            ["/a/.../b", "/a/.../b"],
            ["/a/..b", "/a/..b"],
            ["\\\\evil.com\\x", "/evil.com/x"],
            ["//evil.com/x", "/evil.com/x"],
            ["/\\evil.com/x", "/evil.com/x"],
            ["/\t/evil.com", "/evil.com"],
            ["/x/..//evil.com", "/evil.com"],
            ["/.//evil.com", "/evil.com"],
            ["https://evil.com/x", "/https://evil.com/x"],
            ["javascript:alert(1)", "/javascript:alert(1)"],
            ["/users/أحمد", "/users/%D8%A3%D8%AD%D9%85%D8%AF"],
            ["/users/%D8%A3%D8%AD%D9%85%D8%AF", "/users/%D8%A3%D8%AD%D9%85%D8%AF"],
            ["/a%zz", "/a%25zz"],
            [`/a${lone}b`, "/a%EF%BF%BDb"],
            ["/a b", "/a%20b"],
            ["/a%20b", "/a%20b"],
            ["/a+b", "/a+b"],
            ["/a%2Fb", "/a%2Fb"],
            ["/a%5Cb", "/a%5Cb"],
            [`/a${String.fromCharCode(0)}b`, "/a%00b"],
            [`/a${String.fromCharCode(127)}b`, "/a%7Fb"],
            ["//a//b//", "/a//b"],
            ["  /pad  ", "/pad"],
            ["/A/B", "/A/B"],
            ["users", "/users"],
            ["/", "/"],
            ["", "/"],
        ];

        for ( const [given, wanted] of table ) {

            const once = history.parse(given);

            expect([given, once.path]).toEqual([given, wanted]);
            expect([given, history.format(once)]).toEqual([given, wanted]);
            expect([given, history.parse(wanted).path]).toEqual([given, wanted]);

        }

    });
    it("a query and a hash survive format and parse, and a path never leaks into them", () => {

        expect(history.parse("/a/?x")).toEqual({ path: "/a", query: { x: "" }, hash: "" });
        expect(history.parse("?x=1")).toEqual({ path: "/", query: { x: "1" }, hash: "" });
        expect(history.parse("#h")).toEqual({ path: "/", query: {}, hash: "h" });
        expect(history.parse("/a?x=1?y=2")).toEqual({ path: "/a", query: { x: "1?y=2" }, hash: "" });
        expect(history.parse("/a#b#c")).toEqual({ path: "/a", query: {}, hash: "b#c" });
        expect(history.parse("/a#b?c")).toEqual({ path: "/a", query: {}, hash: "b?c" });
        expect(history.parse("/a?a=&b&c=1&c=2&=x&d=%zz&e=a+b&__proto__=1").query).toEqual({ a: "", b: "", c: ["1", "2"], d: "%zz", e: "a b" });
        expect(history.format(history.parse("/a?x=1?y=2"))).toBe("/a?x=1%3Fy%3D2");
        expect(history.format(history.parse("/a#b#c"))).toBe("/a#b%23c");
        expect(history.format({ path: "/a", query: { a: "", b: [], c: ["", "x"] } })).toBe("/a?a&c&c=x");
        expect(history.format(history.parse("/a?c[]="))).toBe("/a?c");
        expect(history.format(history.parse(`/a?k=${String.fromCharCode(0xd800)}#${String.fromCharCode(0xdfff)}`))).toBe("/a?k=%EF%BF%BD#%EF%BF%BD");
        expect(history.format({ path: "/a", hash: "" })).toBe("/a");
        expect(["//evil.com", "/a?x=1", "/a#b", "", "a", "/a/"].map(( path ) => history.format({ path }))).toEqual(["/evil.com", "/a%3Fx=1", "/a%23b", "/", "/a", "/a"]);

        for ( const hash of ["a b", "#x", "%", "%zz", "a/b?c", "\n", "é", "أ"] ) {

            const href = history.format({ path: "/p", hash });

            expect([hash, history.parse(href).hash]).toEqual([hash, hash]);
            expect(href).toMatch(/^\/p#[!-~]+$/);

        }

    });
    it("local accepts a path-absolute href only", () => {

        const table: [string, string | null][] = [
            ["/ok", "/ok"], ["/ok?x=1#h", "/ok"], ["/", "/"], [" /x\n", "/x"], ["/.//evil.com", "/evil.com"],
            ["//evil.com", null], ["/\\evil.com", null], ["/\t/evil.com", null], ["https://evil.com", null], ["javascript:alert(1)", null],
            ["", null], ["x", null], ["\\x", null], ["?x", null], ["#h", null],
        ];

        for ( const [given, wanted] of table ) expect([given, history.local(given)?.path ?? null]).toEqual([given, wanted]);

        expect(history.local("/ok?x=1#h")).toEqual({ path: "/ok", query: { x: "1" }, hash: "h" });

    });
    it("isCurrent compares canonical paths by whole segments", () => {

        expect(history.isCurrent("/users", "/users/")).toBe(true);
        expect(history.isCurrent("/users/", "/users")).toBe(true);
        expect(history.isCurrent("", "/")).toBe(true);
        expect(history.isCurrent("/a/../users", "/users?x#y")).toBe(true);
        expect(history.isCurrent("/users?x=1", "/users/7#y")).toBe(true);
        expect(history.isCurrent("/users", "/usersX")).toBe(false);
        expect(history.isCurrent("/Users", "/users")).toBe(false);
        expect(history.isCurrent("/users/7", "/users")).toBe(false);
        expect(history.isCurrent("/", "/users")).toBe(false);

    });
    it("the memory adapter caps its stack, restores a snapshot and trims it around the index", () => {

        const lengths = [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 2.9, 1].map(( limit ) => {

            const made = history.memoryAdapter("/", limit);

            for ( let at = 0; at < 150; at += 1 ) made.push(`/p${at}`, null);

            return [made.entries().length, made.read().href];

        });
        const rows = ["/a", "/b", "/c", "/d", "/e"].map(( href ) => ({ href, state: href }));
        const kept = history.memoryAdapter({ entries: rows, index: 1 });
        const copy = kept.snapshot();
        const first = copy.entries[0];

        expect(lengths).toEqual([[1, "/p149"], [1, "/p149"], [100, "/p149"], [100, "/p149"], [2, "/p149"], [1, "/p149"]]);
        expect(copy).toEqual({ entries: rows, index: 1 });
        expect(kept.read()).toEqual({ href: "/b", state: "/b" });

        if ( first ) first.href = "/changed";

        expect(kept.entries()).toEqual(["/a", "/b", "/c", "/d", "/e"]);
        expect(history.memoryAdapter({ entries: rows, index: 3 }, 2).snapshot()).toEqual({ entries: rows.slice(3), index: 0 });
        expect(history.memoryAdapter({ entries: rows, index: 0 }, 2).snapshot()).toEqual({ entries: rows.slice(0, 2), index: 0 });
        expect(history.memoryAdapter({ entries: rows, index: 4 }, 3).snapshot()).toEqual({ entries: rows.slice(2), index: 2 });
        expect([9, -3, Number.NaN, 1.9].map(( index ) => history.memoryAdapter({ entries: rows, index }).snapshot().index)).toEqual([4, 0, 0, 1]);
        expect(history.memoryAdapter({ entries: [], index: 0 }).snapshot()).toEqual({ entries: [{ href: "/", state: null }], index: 0 });
        expect(history.memoryAdapter(JSON.parse('{"entries":"x","index":2}')).snapshot()).toEqual({ entries: [{ href: "/", state: null }], index: 0 });
        expect(history.memoryAdapter(JSON.parse('{"entries":[{"href":5},null,{"href":"/ok"}],"index":2}')).snapshot()).toEqual({ entries: [{ href: "/ok", state: null }], index: 0 });

    });
    it("a memory move tells its state, ignores a step outside the stack and survives a throwing handler", () => {

        const made = history.memoryAdapter("/a");
        const loud = history.memoryAdapter("/a");
        const seen: unknown[] = [];
        const told: string[] = [];

        made.push("/b", "sb");
        made.push("/c", "sc");

        const stop = made.listen(( state ) => { seen.push(state); });

        for ( const delta of [0, 0.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, -9, 9] ) made.go(delta);

        expect([seen, made.read().href]).toEqual([[], "/c"]);
        made.go(-1.9);
        made.go(-1);
        made.go(2);
        expect([seen, made.read().href]).toEqual([["sb", null, "sc"], "/c"]);
        made.go(-1);
        made.push("/x", null);
        expect(made.entries()).toEqual(["/a", "/b", "/x"]);
        made.replace("/y", 1);
        expect(made.snapshot()).toEqual({ entries: [{ href: "/a", state: null }, { href: "/b", state: "sb" }, { href: "/y", state: 1 }], index: 2 });
        stop();
        made.go(-1);
        expect(seen).toHaveLength(4);
        loud.push("/b", null);
        loud.listen(() => { throw new Error("first"); });
        loud.listen(() => { told.push("second"); });
        expect(String(caught(() => loud.go(-1)))).toBe("Error: first");
        expect([told, loud.read().href]).toEqual([["second"], "/a"]);

    });
    it("a target resolves against the current entry: text, query only, hash only and partial", () => {

        const adapter = history.memoryAdapter("/orders?page=2#top");
        const made = history.create(adapter);
        const table: [history.Target, string][] = [
            ["", "/"],
            ["?page=3", "/orders?page=3"],
            ["#end", "/orders?page=2#end"],
            [{ query: { q: "a" } }, "/orders?q=a"],
            [{ hash: "x" }, "/orders?page=2#x"],
            [{ path: "/x?y=1#z" }, "/x?y=1#z"],
            [{ path: "/x?y=1", query: { k: "v" } }, "/x?k=v"],
            [{ path: "/x#z", hash: "" }, "/x"],
            [{}, "/orders?page=2"],
            ["relative", "/relative"],
            ["./rel", "/rel"],
            ["../up", "/up"],
            ["  /pad  ", "/pad"],
            ["//evil.com/x", "/evil.com/x"],
            ["https://evil.com/x", "/https://evil.com/x"],
        ];

        for ( const [to, wanted] of table ) expect([to, made.href(to)]).toEqual([to, wanted]);

        expect([made.current().href, adapter.entries()]).toEqual(["/orders?page=2#top", ["/orders?page=2#top"]]);
        expect(made.push("?page=3").href).toBe("/orders?page=3");
        expect(made.push("#end").href).toBe("/orders?page=3#end");
        expect(made.replace({ hash: "" }).href).toBe("/orders?page=3");
        expect(made.replace({ query: {} }).href).toBe("/orders");
        expect(made.push("//evil.com/x").href).toBe("/evil.com/x");
        expect(adapter.entries()).toEqual(["/orders?page=2#top", "/orders?page=3", "/orders", "/evil.com/x"]);

    });
    it("a base prefixes what the host holds and is stripped from what the surface reads", () => {

        const bases = ["app", "/app/", "//app", "/app?x#y", "/app/../x", "/a b", "", "/"];
        const adapter = history.memoryAdapter("/app/users?x=1");
        const made = history.create(adapter, "/app");
        const seen: string[] = [];

        made.listen(( entry, action ) => { seen.push(`${action}:${entry.href}`); });
        expect(bases.map(( base ) => history.create(history.memoryAdapter("/"), base).href("/x"))).toEqual(["/app/x", "/app/x", "/app/x", "/app/x", "/x/x", "/a%20b/x", "/x", "/x"]);
        expect(made.current().href).toBe("/users?x=1");
        expect(made.push("/").href).toBe("/");
        expect(made.push("/orders?page=2").href).toBe("/orders?page=2");
        expect(adapter.entries()).toEqual(["/app/users?x=1", "/app/", "/app/orders?page=2"]);
        made.back();
        expect([made.current().path, made.isCurrent("/"), made.isCurrent("/app"), made.href("/")]).toEqual(["/", true, false, "/app/"]);
        expect(seen).toEqual(["push:/", "push:/orders?page=2", "pop:/"]);
        expect(["/application", "/app", "/app/", "/apps/x", "/x/app/y"].map(( start ) => history.create(history.memoryAdapter(start), "/app").current().path)).toEqual(["/application", "/", "/", "/apps/x", "/x/app/y"]);

    });
    it("an entry is cached, frozen and carries the state it was given", () => {

        const adapter = history.memoryAdapter("/a?tag=x&tag=y");
        const made = history.create(adapter);
        const first = made.current();
        const foreign = history.memoryAdapter({ entries: [{ href: "/f", state: { scroll: 7 } }], index: 0 });
        const other = history.create(foreign);
        const kept = history.memoryAdapter({ entries: [{ href: "/f", state: { scroll: 7 } }], index: 0 });

        expect(made.current()).toBe(first);
        expect([Object.isFrozen(first), Object.isFrozen(first.query), Object.isFrozen(first.query.tag)]).toEqual([true, true, true]);
        expect(caught(() => { (first as { path: string }).path = "/x"; })).toBeInstanceOf(TypeError);
        expect(caught(() => { (first.query as Record<string, string>).tag = "z"; })).toBeInstanceOf(TypeError);
        expect([undefined, null, 0, false, "", { a: 1 }].map(( state ) => made.push("/s", state).state)).toEqual([null, null, 0, false, "", { a: 1 }]);
        expect([made.current().index, made.replace("/r", 5).index, made.current().state, made.replace("/r").state]).toEqual([6, 6, 5, null]);
        expect(made.current()).not.toBe(first);
        expect(made.current()).toBe(made.current());
        expect([other.current().state, other.current().index]).toEqual([null, 0]);
        other.push("/g", "s");
        expect(foreign.snapshot()).toEqual({ entries: [{ href: "/f", state: { scroll: 7, engine: { at: 0, state: null } } }, { href: "/g", state: { engine: { at: 1, state: "s" } } }], index: 1 });
        other.replace("/h", "t");
        other.back();
        expect([other.current().href, other.current().state, other.current().index]).toEqual(["/f", null, 0]);
        other.forward();
        expect([other.current().href, other.current().state, other.current().index]).toEqual(["/h", "t", 1]);
        history.create(kept).replace("/k", 1);
        expect(kept.snapshot()).toEqual({ entries: [{ href: "/k", state: { scroll: 7, engine: { at: 0, state: 1 } } }], index: 0 });
        expect(history.create(history.memoryAdapter({ entries: [{ href: "/a", state: { engine: { at: -1, state: "x" } } }, { href: "/b", state: { engine: { at: 1.5, state: "y" } } }], index: 1 })).current().state).toBeNull();

    });
    it("every listener is told, the first failure is rethrown and the move stands", () => {

        const adapter = history.memoryAdapter("/a");
        const made = history.create(adapter);
        const told: string[] = [];
        const late = (): void => { told.push("late"); };
        const stop = made.listen(() => {

            told.push("one");
            made.listen(late);

            throw new Error("one");

        });

        made.listen(( entry, action, previous ) => { told.push(`${action} ${previous.href}>${entry.href} ${previous.index}>${entry.index}`); });
        made.listen(() => { throw new Error("three"); });
        expect(String(caught(() => made.push("/b")))).toBe("Error: one");
        expect([told, made.current().href, adapter.entries()]).toEqual([["one", "push /a>/b 0>1"], "/b", ["/a", "/b"]]);
        stop();
        stop();
        expect(String(caught(() => made.back()))).toBe("Error: three");
        expect([told.slice(2), made.current().href]).toEqual([["pop /b>/a 1>0", "late"], "/a"]);

    });
    it("a blocker sees the move before it happens and a throwing one stops it", () => {

        const adapter = history.memoryAdapter("/a");
        const made = history.create(adapter);
        const asked: string[] = [];
        const told: string[] = [];
        let mode: "open" | "shut" | "loud" = "shut";
        const stop = made.block(( next, previous, action ) => {

            asked.push(`${action} ${previous.href}>${next.href} ${previous.index}>${next.index} ${JSON.stringify(next.state)}`);

            if ( mode === "loud" ) throw new Error("guard");

            return mode === "shut";

        });

        made.listen(( entry, action ) => { told.push(`${action}:${entry.href}`); });
        expect(made.push("/b", { n: 1 })).toBe(made.current());
        expect(made.replace("/r").href).toBe("/a");
        mode = "loud";
        expect(String(caught(() => made.push("/c")))).toBe("Error: guard");
        expect([asked, told, adapter.snapshot()]).toEqual([['push /a>/b 0>1 {"n":1}', "replace /a>/r 0>0 null", "push /a>/c 0>1 null"], [], { entries: [{ href: "/a", state: null }], index: 0 }]);
        mode = "open";
        made.push("/b");
        made.push("/c");
        mode = "shut";
        made.back();
        made.go(-2);
        expect([asked.slice(5), told, made.current().href, made.current().index]).toEqual([["pop /c>/b 2>1", "pop /c>/a 2>0"].map(( line ) => `${line} null`), ["push:/b", "push:/c"], "/c", 2]);
        mode = "loud";
        expect(String(caught(() => made.back()))).toBe("Error: guard");
        expect([told, made.current().href]).toEqual([["push:/b", "push:/c"], "/c"]);
        stop();
        made.back();
        expect([told.slice(2), made.current().href, asked.length]).toEqual([["pop:/b"], "/b", 8]);

    });
    it("a guard that redirects inside a pop keeps the redirect and tells it once", () => {

        const adapter = history.memoryAdapter("/a");
        const made = history.create(adapter);
        const told: string[] = [];

        made.push("/b");
        made.push("/c");
        made.listen(( entry, action, previous ) => { told.push(`${action}:${previous.href}>${entry.href}`); });
        made.block(( next, _previous, action ) => {

            if ( action !== "pop" || next.path !== "/b" ) return false;

            made.replace("/login", { from: next.href });

            return true;

        });
        made.back();
        expect([told, adapter.entries(), made.current().href, made.current().state, made.current().index]).toEqual([["replace:/b>/login"], ["/a", "/login", "/c"], "/login", { from: "/b" }, 1]);
        made.forward();
        made.go(-2);
        expect([told.slice(1), made.current().href]).toEqual([["pop:/login>/c", "pop:/c>/a"], "/a"]);

    });
    it("patchQuery writes, removes and repeats keys, and never an unsafe one", () => {

        const made = history.create(history.memoryAdapter("/x"));
        const patch = JSON.parse('{"page":2,"live":true,"tags":[1,"b",false],"__proto__":"x","constructor":"y","prototype":"z"}') as history.Patch;

        made.replace("/o?page=1&q=a#h", { keep: true });

        const replaced = history.patchQuery(made, { ...patch, q: undefined });

        expect([replaced.href, replaced.state, replaced.index]).toEqual(["/o?live=true&page=2&tags=1&tags=b&tags=false#h", { keep: true }, 0]);
        expect(Object.getPrototypeOf(replaced.query)).toBe(Object.prototype);
        expect(history.patchQuery(made, {})).toEqual(replaced);

        const pushed = history.patchQuery(made, { page: 3 }, "push");

        expect([pushed.href, pushed.state, pushed.index]).toEqual(["/o?live=true&page=3&tags=1&tags=b&tags=false#h", null, 1]);
        expect(history.patchQuery(made, { page: null, live: null, tags: [] }).href).toBe("/o#h");
        expect(history.patchQuery(made, { n: 0, f: false, e: "" }).href).toBe("/o?e&f=false&n=0#h");
        made.back();
        expect(made.current()).toEqual(replaced);

    });
    it("destroy silences listeners, blockers and pops, and the adapter still moves", () => {

        const adapter = history.memoryAdapter("/a");
        const made = history.create(adapter);
        const other = history.create(adapter);
        const told: string[] = [];

        made.listen(() => { told.push("made"); });
        made.block(() => true);
        other.listen(( entry, action ) => { told.push(`other ${action}:${entry.href}`); });
        expect(made.push("/b").href).toBe("/a");
        made.destroy();
        made.destroy();
        expect(made.push("/b").href).toBe("/b");
        other.back();
        expect([told, made.current().href, adapter.entries()]).toEqual([["other pop:/a"], "/a", ["/a", "/b"]]);

    });
    it("the web adapter reads the host, moves without a reload and needs both location and history", () => {

        const web = browser("/a?x=1#h");
        const made = history.create(web.adapter);
        const told: string[] = [];

        expect(web.adapter.read()).toEqual({ href: "/a?x=1#h", state: null });
        expect([{}, { location: {} }, { history: {} }].map(( host ) => history.webAdapter(host as unknown as Host))).toEqual([undefined, undefined, undefined]);
        expect(made.current()).toEqual({ path: "/a", query: { x: "1" }, hash: "h", href: "/a?x=1#h", state: null, index: 0 });

        for ( const delta of [0, Number.NaN, Number.POSITIVE_INFINITY, 0.4, -1.7, Number.NEGATIVE_INFINITY] ) made.go(delta);

        expect(web.calls).toEqual(["go -1"]);
        web.arrive();
        made.listen(( entry, action, previous ) => { told.push(`${action} ${previous.href}>${entry.href} ${JSON.stringify(entry.state)} ${entry.index}`); });
        made.replace("/a");
        made.push("/b", { n: 1 });
        made.push("/c");
        expect(web.rows).toEqual([
            { href: "/a", state: { engine: { at: 0, state: null } } },
            { href: "/b", state: { engine: { at: 1, state: { n: 1 } } } },
            { href: "/c", state: { engine: { at: 2, state: null } } },
        ]);
        made.back();
        expect([made.current().href, web.owed()]).toEqual(["/c", 1]);
        web.arrive();
        made.back();
        web.arrive();
        made.go(2);
        web.arrive();
        made.forward();
        web.arrive();
        expect(told.slice(3)).toEqual(['pop /c>/b {"n":1} 1', "pop /b>/a null 0", "pop /a>/c null 2"]);
        expect(web.calls.slice(1)).toEqual(["replace /a", "push /b", "push /c", "go -1", "go -1", "go 2", "go 1"]);
        expect([web.ears(), made.destroy(), web.ears()]).toEqual([1, undefined, 0]);

    });
    it("a move the host refuses answers an unavailable fault and tells nobody", () => {

        const shape = ( failure: unknown ): unknown[] => (error.isFault(failure) ? [failure.code, failure.reason, failure.status, (failure.cause as { name?: string } | undefined)?.name] : [String(failure)]);
        const push = browser("/a", "push");
        const replace = browser("/a", "replace");
        const quota = error.fault("too_large", "history.quota");
        const told: string[] = [];
        const first = history.create(push.adapter);
        const second = history.create(replace.adapter);
        const third = history.create({ ...history.memoryAdapter("/a"), replace: () => { throw quota; } });

        for ( const made of [first, second, third] ) made.listen(( entry, action ) => { told.push(`${action}:${entry.href}`); });

        expect(shape(caught(() => first.push("/b")))).toEqual(["unavailable", "history.refused", 503, "SecurityError"]);
        expect([push.calls, first.current().href, first.current().index]).toEqual([["replace /a", "push /b"], "/a", 0]);
        expect(first.replace("/r").href).toBe("/r");
        expect(shape(caught(() => second.replace("/b")))).toEqual(["unavailable", "history.refused", 503, "DataCloneError"]);
        expect(shape(caught(() => second.push("/b")))).toEqual(["unavailable", "history.refused", 503, "DataCloneError"]);
        expect([replace.calls, replace.list(), second.current().href]).toEqual([["replace /b", "replace /a"], "/a", "/a"]);
        expect(caught(() => third.push("/b"))).toBe(quota);
        expect(caught(() => third.replace("/b"))).toBe(quota);
        expect(told).toEqual(["replace:/r"]);

    });
    it("a refused pop on the web is reverted, and moves made meanwhile wait for the revert", () => {

        const web = browser("/a");
        const made = history.create(web.adapter);
        const seen: string[] = [];
        const asked: string[] = [];
        const order: string[] = [];

        made.push("/b");
        made.push("/c");
        made.listen(( entry, action ) => { seen.push(`${action}:${entry.href}`); });
        made.block(( next, previous, action ) => {

            asked.push(`${action} ${previous.href}>${next.href}`);

            return action === "pop";

        });
        made.back();
        web.arrive();
        expect([web.where(), made.current().href, made.current().index, web.owed(), asked]).toEqual(["/b", "/c", 2, 1, ["pop /c>/b"]]);
        expect([made.push("/d").href, made.replace("/e").href, made.isCurrent("/c"), made.href("?x=1")]).toEqual(["/c", "/c", true, "/c?x=1"]);
        expect([web.list(), seen]).toEqual(["/a /b /c", []]);
        web.arrive();
        expect([web.list(), made.current().href, made.current().index, seen, web.owed()]).toEqual(["/a /b /c /e", "/e", 3, ["push:/d", "replace:/e"], 0]);
        expect(asked).toEqual(["pop /c>/b", "push /c>/d", "replace /d>/e"]);
        order.push(web.where());
        web.user(-1);
        web.arrive();
        order.push(web.where());
        web.arrive();
        order.push(web.where());
        expect([order, asked.slice(3), seen.length, web.owed(), made.current().href]).toEqual([["/e", "/c", "/e"], ["pop /e>/c"], 2, 0, "/e"]);
        web.user(-1);
        web.user(-2);
        web.arrive();
        web.arrive();

        while ( web.owed() ) web.arrive();

        expect([web.where(), made.current().href, made.current().index, seen.length]).toEqual(["/e", "/e", 3, 2]);
        expect(made.push("/f").href).toBe("/f");

    });
    it("a guard on the web may redirect or throw inside a pop", () => {

        const web = browser("/admin");
        const made = history.create(web.adapter);
        const loud = browser("/a");
        const other = history.create(loud.adapter);
        const told: string[] = [];

        made.push("/home");
        made.listen(( entry, action, previous ) => { told.push(`${action}:${previous.href}>${entry.href}`); });
        made.block(( next, _previous, action ) => {

            if ( action !== "pop" || next.path !== "/admin" ) return false;

            made.replace("/login");

            return true;

        });
        made.back();
        web.arrive();
        expect([web.calls.slice(2), web.list(), web.owed(), made.current().href, told]).toEqual([["go -1", "replace /login"], "/login /home", 0, "/login", ["replace:/admin>/login"]]);
        other.push("/b");
        other.listen(() => { told.push("other"); });
        other.block(() => { throw new Error("guard"); });
        other.back();
        expect(String(caught(() => loud.arrive()))).toBe("Error: guard");
        expect([loud.where(), loud.owed(), other.current().href]).toEqual(["/a", 1, "/b"]);
        loud.arrive();
        expect([loud.where(), loud.owed(), other.current().href, told]).toEqual(["/b", 0, "/b", ["replace:/admin>/login"]]);

    });
    it("a web history under a base, a destroy during a revert and an entry the engine did not write", () => {

        const based = browser("/app/users?x=1");
        const inside = history.create(based.adapter, "/app");
        const web = browser("/a");
        const made = history.create(web.adapter);
        const plain = browser("/a");
        const loose = history.create(plain.adapter);
        const told: string[] = [];
        let asked = 0;

        expect(inside.push("/orders?page=2").href).toBe("/orders?page=2");
        expect([based.list(), based.rows[1]?.state]).toEqual(["/app/users?x=1 /app/orders?page=2", { engine: { at: 1, state: null } }]);
        made.push("/b");
        made.push("/c");
        made.block(( _next, _previous, action ) => action === "pop");
        made.back();
        web.arrive();
        made.destroy();
        web.arrive();
        expect([web.where(), web.ears(), made.push("/e").href, web.list()]).toEqual(["/c", 0, "/e", "/a /b /c /e"]);
        loose.listen(( entry, action ) => { told.push(`${action}:${entry.href}:${entry.index}`); });
        loose.block(() => {

            asked += 1;

            return true;

        });
        plain.rows.push({ href: "/a#x", state: null });
        plain.user(1);
        plain.arrive();
        expect([told, asked, loose.current().href]).toEqual([["pop:/a#x:0"], 0, "/a#x"]);

    });
    it("traversals queued before the first is answered settle on the guarded entry", () => {

        const scenes: [number[], string[]][] = [
            [[-1, -1], ["go 1", "go 1"]],
            [[1, 1], ["go -1", "go -1"]],
            [[-1, -1, -1], ["go 1", "go 1"]],
            [[-2, 1], ["go 2", "go -1"]],
            [[-1, 3], ["go 1", "go -2"]],
            [[2, -4], ["go -2", "go 2"]],
            [[-1, 1], ["go 1", "go -1"]],
        ];

        for ( const [moves, calls] of scenes ) {

            const web = browser("/p0");
            const made = history.create(web.adapter);
            const told: string[] = [];
            let asked = 0;
            let steps = 0;

            for ( const name of ["/p1", "/p2", "/p3", "/p4"] ) made.push(name);

            made.go(-2);
            web.arrive();
            web.calls.length = 0;
            made.listen(( entry, action ) => { told.push(`${action}:${entry.href}`); });
            made.block(( _next, _previous, action ) => {

                asked += action === "pop" ? 1 : 0;

                return action === "pop";

            });

            for ( const move of moves ) web.user(move);

            while ( web.owed() && steps < 40 ) {

                web.arrive();
                steps += 1;

            }

            expect([moves, web.where(), made.current().href, web.calls, asked, web.owed(), told]).toEqual([moves, "/p2", "/p2", calls, 2, 0, []]);
            expect([made.push("/x").href, web.list(), told]).toEqual(["/x", "/p0 /p1 /p2 /x", ["push:/x"]]);

        }

    });
    it("a guard that changes its mind is never asked about a revert of the engine", () => {

        const web = browser("/p0");
        const made = history.create(web.adapter);
        const told: string[] = [];
        const asked: string[] = [];

        for ( const name of ["/p1", "/p2", "/p3", "/p4"] ) made.push(name);

        made.go(-2);
        web.arrive();
        web.calls.length = 0;
        made.listen(( entry, action ) => { told.push(`${action}:${entry.href}`); });
        made.block(( next, previous, action ) => {

            asked.push(`${action} ${previous.href}>${next.href}`);

            return asked.length === 1;

        });
        web.user(-1);
        web.user(-1);
        web.arrive();
        expect([web.where(), made.current().href, web.calls, told]).toEqual(["/p1", "/p2", ["go 1"], []]);
        web.arrive();
        expect([web.where(), made.current().href, made.current().index, web.calls, told]).toEqual(["/p0", "/p0", 0, ["go 1"], ["pop:/p0"]]);
        expect([made.push("/x").href, web.list()]).toEqual(["/p0", "/p0 /p1 /p2 /p3 /p4"]);
        web.arrive();
        expect([web.where(), made.current().href, web.calls, asked]).toEqual(["/p1", "/p0", ["go 1", "go -1"], ["pop /p2>/p1", "pop /p2>/p0"]]);
        web.arrive();
        expect([web.where(), made.current().href, web.list(), web.owed()]).toEqual(["/x", "/x", "/p0 /x", 0]);
        expect([told, asked.slice(2)]).toEqual([["pop:/p0", "push:/x"], ["push /p0>/x"]]);

    });
    it("a traversal that brings the host home while a revert is in flight keeps moves waiting", () => {

        const web = browser("/p0");
        const made = history.create(web.adapter);
        const told: string[] = [];
        const asked: string[] = [];

        for ( const name of ["/p1", "/p2", "/p3", "/p4"] ) made.push(name);

        made.go(-2);
        web.arrive();
        web.calls.length = 0;
        made.listen(( entry, action ) => { told.push(`${action}:${entry.href}`); });
        made.block(( next, _previous, action ) => {

            asked.push(`${action} ${next.href}`);

            return action === "pop";

        });

        for ( const move of [-1, -1, 2] ) web.user(move);

        web.arrive();
        web.arrive();
        web.arrive();
        expect([web.where(), made.current().href, web.calls, web.owed(), asked]).toEqual(["/p2", "/p2", ["go 1"], 1, ["pop /p1", "pop /p0"]]);
        expect([made.push("/x").href, made.replace("/y").href, web.list(), told]).toEqual(["/p2", "/p2", "/p0 /p1 /p2 /p3 /p4", []]);
        web.arrive();
        expect([web.where(), made.current().href, web.calls, asked.length]).toEqual(["/p3", "/p2", ["go 1", "go -1"], 2]);
        web.arrive();
        expect([web.where(), made.current().href, made.current().index, web.list(), web.owed()]).toEqual(["/y", "/y", 3, "/p0 /p1 /p2 /y", 0]);
        expect([told, asked.slice(2)]).toEqual([["push:/x", "replace:/y"], ["push /x", "replace /y"]]);

    });
});
