import { describe, expect, test as it, spyOn } from "bun:test";
import * as error from "engine/error";
import * as rand from "engine/rand";
import * as strings from "engine/string";
import * as stage from "engine/test";

function constant ( byte: number ): rand.Source {

    return { getRandomValues: ( data ) => data.fill(byte) };

}
function cycle ( values: readonly number[] ): rand.Source {

    let at = 0;

    return {
        getRandomValues: ( data ) => {

            for ( let index = 0; index < data.length; index += 1 ) {

                data[index] = values[at % values.length] ?? 0;
                at += 1;

            }

            return data;

        },
    };

}
function ahead (): number {

    return Math.max(Date.now(), rand.ulidTime(rand.ulid()) ?? 0, rand.uuidTime(rand.uuid7()) ?? 0) + 5;

}
function refused ( work: () => unknown ): string {

    try {

        work();

    } catch ( caught ) {

        return caught instanceof RangeError ? caught.message : "other";

    }

    return "none";

}

describe("rand", () => {

    it("identities have the right shape and ulids stay monotonic inside one millisecond", () => {

        expect(rand.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(rand.uuid7(1_700_000_000_000)).toMatch(/^018bcfe5-6800-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

        const first = rand.ulid(1_700_000_000_000);
        const second = rand.ulid(1_700_000_000_000);

        expect(rand.isUlid(first) && rand.isUlid(second)).toBe(true);
        expect(second > first).toBe(true);
        expect(first.slice(0, 10)).toBe(second.slice(0, 10));
        expect(rand.ulidTime(first)).toBe(1_700_000_000_000);
        expect(rand.isUlid("not-a-ulid")).toBe(false);
        expect(rand.ulidTime("x")).toBeUndefined();
        expect(rand.token()).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(rand.trace()).toMatch(/^[0-9a-f]{16}$/);
        expect(rand.nanoid()).toMatch(/^[A-Za-z0-9_-]{21}$/);
        expect(rand.otp()).toMatch(/^\d{6}$/);
        expect(rand.otp(4)).toMatch(/^\d{4}$/);

    });
    it("seeded generators repeat and secure ones stay in range", () => {

        const a = rand.seeded("acme");
        const b = rand.seeded("acme");

        expect(a.int(1, 6)).toBe(b.int(1, 6));
        expect(a.shuffle([1, 2, 3, 4, 5])).toEqual(b.shuffle([1, 2, 3, 4, 5]));
        expect(a.string(8)).toBe(b.string(8));
        expect(rand.hashed("acme")).toBe(rand.hashed("acme"));
        expect(rand.hashed("a")).not.toBe(rand.hashed("b"));

        for ( let round = 0; round < 500; round += 1 ) {

            const value = rand.int(-3, 3);

            expect(value >= -3 && value <= 3 && Number.isInteger(value)).toBe(true);
            expect(rand.float(2, 3) >= 2 && rand.float(2, 3) < 3).toBe(true);

        }

        expect(rand.pick([])).toBeUndefined();
        expect(rand.pick([7])).toBe(7);
        expect(rand.pickMany([1, 2, 3], 2)).toHaveLength(2);
        expect(rand.shuffle([1, 2, 3]).sort()).toEqual([1, 2, 3]);
        expect(rand.index(0)).toBe(-1);
        expect(rand.weighted([{ item: "a", weight: 0 }, { item: "b", weight: 5 }])).toBe("b");
        expect(rand.weighted([])).toBeUndefined();
        expect(rand.string(6, "digits")).toMatch(/^\d{6}$/);
        expect(rand.hex(8)).toMatch(/^[0-9a-f]{8}$/);
        expect(rand.digits(3)).toMatch(/^\d{3}$/);
        expect(rand.string(10, "safe")).not.toMatch(/[0O1Il]/);

        const password = rand.password({ length: 12 });

        expect(password).toHaveLength(12);
        expect(/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)).toBe(true);
        expect(rand.password({ length: 8, symbols: false, upper: false, digits: false })).toMatch(/^[a-z]{8}$/);
        expect(rand.chance(100) && !rand.chance(0)).toBe(true);
        expect(rand.boolean(1) && !rand.boolean(0)).toBe(true);
        expect(Math.abs(rand.jitter(100, 0.1) - 100) <= 10).toBe(true);
        expect(rand.color()).toMatch(/^#[0-9a-f]{6}$/);
        expect(Number.isFinite(rand.gaussian(10, 2))).toBe(true);

        const from = new Date("2026-01-01T00:00:00Z");
        const to = new Date("2026-01-02T00:00:00Z");
        const when = rand.date(from, to);

        expect(when.getTime() >= from.getTime() && when.getTime() <= to.getTime()).toBe(true);
        expect(rand.create(() => 0.999).int(1, 3)).toBe(3);

    });
    it("the source is a port: bound, scoped, checked, and refused when the host has none", () => {

        expect(rand.engine.name).toBe("rand.engine");
        expect(rand.engine.bound()).toBe(false);
        expect(rand.engine.with(constant(255), () => rand.uuid())).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
        expect(rand.engine.with(constant(0), () => rand.uuid())).toBe("00000000-0000-4000-8000-000000000000");
        expect(rand.engine.with({ ...constant(0), randomUUID: () => "given" }, () => rand.uuid())).toBe("given");
        expect(rand.engine.with(constant(255), () => [rand.trace(2), rand.token(3), rand.nanoid(3)])).toEqual(["ffff", "____", "ttt"]);
        expect(rand.engine.with(constant(255), () => [rand.float(), rand.int(1, 6), rand.index(10), rand.boolean(1), rand.chance(100)])).toEqual([0.9999999999999999, 6, 9, true, true]);
        expect(rand.engine.with(constant(0), () => [rand.float(), rand.int(1, 6), rand.index(10), rand.boolean(0), rand.chance(0)])).toEqual([0, 1, 0, false, false]);

        const undo = rand.engine.use(constant(0));

        expect(rand.engine.bound()).toBe(true);
        expect(rand.trace(2)).toBe("0000");
        undo();
        expect(rand.engine.bound()).toBe(false);
        expect(rand.trace(8)).not.toBe("0000000000000000");

        const rejected = error.attemptSync(() => rand.engine.use({} as unknown as rand.Source));

        expect(rejected.ok ? undefined : [rejected.fault.code, rejected.fault.reason]).toEqual(["internal", "rand.engine.rejected"]);
        expect(rand.engine.bound()).toBe(false);

        const restore = stage.globals({ crypto: undefined });

        try {

            rand.engine.reset();

            const bare = error.attemptSync(() => rand.bytes(1));

            expect(bare.ok ? undefined : [bare.fault.code, bare.fault.reason]).toEqual(["unavailable", "rand.engine"]);
            expect(bare.ok ? "" : bare.fault.message).toContain("bind the port");
            expect(rand.engine.with(constant(7), () => [...rand.bytes(2)])).toEqual([7, 7]);

        } finally {

            restore();
            rand.engine.reset();

        }

        expect(rand.bytes(4)).toHaveLength(4);

    });
    it("bytes fill in host-sized pieces and every size is bounded", () => {

        const sizes: number[] = [];
        const counted: rand.Source = {
            getRandomValues: ( data ) => {

                sizes.push(data.length);

                return data.fill(1);

            },
        };
        const big = rand.engine.with(counted, () => rand.bytes(150_000));

        expect(sizes).toEqual([65_536, 65_536, 18_928]);
        expect(big.every(( byte ) => byte === 1)).toBe(true);
        expect(rand.bytes(70_000).subarray(65_536).some(( byte ) => byte !== 0)).toBe(true);
        expect(rand.bytes(0)).toHaveLength(0);
        expect(rand.bytes(2.9)).toHaveLength(2);
        expect(rand.token(0)).toBe("");
        expect(rand.token(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(rand.trace(4)).toMatch(/^[0-9a-f]{8}$/);
        expect(rand.nanoid(64)).toMatch(/^[A-Za-z0-9_-]{64}$/);
        expect(rand.otp(0)).toBe("");
        expect(new Set(Array.from({ length: 1000 }, () => rand.uuid())).size).toBe(1000);
        expect(new Set(Array.from({ length: 1000 }, () => rand.token())).size).toBe(1000);

        const sizeless: (() => unknown)[] = [
            () => rand.bytes(-1),
            () => rand.bytes(Number.NaN),
            () => rand.bytes(16_777_217),
            () => rand.token(Number.NaN),
            () => rand.trace(-1),
            () => rand.nanoid(Number.POSITIVE_INFINITY),
            () => rand.otp(-1),
            () => rand.string(Number.NaN),
            () => rand.string(1_048_577),
            () => rand.hex(-1),
            () => rand.digits(-2),
            () => rand.letters(-1, "ab"),
            () => rand.password({ length: 1_048_577 }),
            () => rand.seeded(1).bytes(-1),
        ];

        expect(sizeless.map(refused)).toEqual(sizeless.map(() => "not a size"));
        expect(refused(() => rand.string(4, "constructor" as rand.Charset))).toBe("not a charset");
        expect(refused(() => rand.string(4, "nope" as rand.Charset))).toBe("not a charset");
        expect(refused(() => rand.letters(3, ""))).toBe("not an alphabet");
        expect(refused(() => rand.password({ lower: false, upper: false, digits: false, symbols: false }))).toBe("not a rule");
        expect(refused(() => rand.password({ lower: false, upper: false, digits: false, symbols: "" }))).toBe("not a rule");

    });
    it("time ids carry the time they are given and refuse a time outside 48 bits", () => {

        expect(rand.ulid(1_469_918_176_385).slice(0, 10)).toBe("01ARYZ6S41");
        expect(rand.ulidTime("01ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(1_469_918_176_385);
        expect(rand.uuid7(1_645_557_742_000).slice(0, 13)).toBe("017f22e2-79b0");
        expect(rand.uuidTime("017F22E2-79B0-7CC3-98C4-DC0C0C07398F")).toBe(1_645_557_742_000);
        expect(rand.uuidTime(rand.uuid7(1_700_000_000_000.9))).toBe(1_700_000_000_000);
        expect(rand.ulidTime(rand.ulid(1_700_000_000_000.9))).toBe(1_700_000_000_000);
        expect(rand.ulid(0).slice(0, 10)).toBe("0000000000");
        expect(rand.ulid(2 ** 48 - 1).slice(0, 10)).toBe("7ZZZZZZZZZ");
        expect(rand.ulidTime("7ZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(2 ** 48 - 1);
        expect(rand.uuid7(2 ** 48 - 1).slice(0, 15)).toBe("ffffffff-ffff-7");
        expect(rand.uuidTime(rand.uuid7(2 ** 48 - 1))).toBe(2 ** 48 - 1);
        expect(rand.uuidTime(rand.uuid7(0))).toBe(0);
        expect(rand.uuidTime(rand.uuid())).toBeUndefined();
        expect(rand.uuidTime(5)).toBeUndefined();
        expect(rand.uuidTime("017f22e2-79b0-7cc3-c8c4-dc0c0c07398f")).toBeUndefined();
        expect(rand.isUlid("8ZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(false);
        expect(rand.isUlid("0000000000000000000000000I")).toBe(false);
        expect(rand.isUlid(5)).toBe(false);
        expect(rand.ulidTime(null)).toBeUndefined();

        const timeless: (() => unknown)[] = [
            () => rand.ulid(-1),
            () => rand.ulid(Number.NaN),
            () => rand.ulid(2 ** 48),
            () => rand.uuid7(-1),
            () => rand.uuid7(Number.NaN),
            () => rand.uuid7(Number.POSITIVE_INFINITY),
        ];

        expect(timeless.map(refused)).toEqual(timeless.map(() => "not a time"));

    });
    it("time ids stay sorted inside one millisecond, across a clock step back and across a tail wrap", () => {

        const sevens = Array.from({ length: 5000 }, () => rand.uuid7());
        const ulids = Array.from({ length: 5000 }, () => rand.ulid());

        expect(sevens.every(( id, at ) => at === 0 || id > (sevens[at - 1] ?? ""))).toBe(true);
        expect(ulids.every(( id, at ) => at === 0 || id > (ulids[at - 1] ?? ""))).toBe(true);
        expect(sevens.every(( id ) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
        expect(ulids.every(rand.isUlid)).toBe(true);

        const given = Array.from({ length: 2000 }, () => rand.uuid7(1_700_000_000_123));
        const named = Array.from({ length: 2000 }, () => rand.ulid(1_700_000_000_123));

        expect(given.every(( id, at ) => rand.uuidTime(id) === 1_700_000_000_123 && (at === 0 || id > (given[at - 1] ?? "")))).toBe(true);
        expect(named.every(( id, at ) => rand.ulidTime(id) === 1_700_000_000_123 && (at === 0 || id > (named[at - 1] ?? "")))).toBe(true);

        rand.ulid(2 ** 48 - 1);
        rand.uuid7(2 ** 48 - 1);

        expect((rand.ulidTime(rand.ulid()) ?? 0) < Date.now() + 60_000).toBe(true);
        expect((rand.uuidTime(rand.uuid7()) ?? 0) < Date.now() + 60_000).toBe(true);

        const base = ahead();
        const clock = spyOn(Date, "now").mockReturnValue(base);

        try {

            const first = [rand.ulid(), rand.uuid7()];

            clock.mockReturnValue(base - 3);

            const second = [rand.ulid(), rand.uuid7()];

            expect([rand.ulidTime(first[0]), rand.uuidTime(first[1])]).toEqual([base, base]);
            expect([rand.ulidTime(second[0]), rand.uuidTime(second[1])]).toEqual([base, base]);
            expect((second[0] ?? "") > (first[0] ?? "") && (second[1] ?? "") > (first[1] ?? "")).toBe(true);

            clock.mockReturnValue(base + 10);

            const wrapped = rand.engine.with(constant(255), () => [rand.ulid(), rand.ulid(), rand.ulid()]);
            const turned = rand.engine.with(constant(255), () => [rand.uuid7(), rand.uuid7(), rand.uuid7()]);

            expect(wrapped.map(rand.ulidTime)).toEqual([base + 10, base + 11, base + 12]);
            expect(wrapped.map(( id ) => id.slice(10))).toEqual(["ZZZZZZZZZZZZZZZZ", "ZZZZZZZZZZZZZZZZ", "ZZZZZZZZZZZZZZZZ"]);
            expect(turned.map(rand.uuidTime)).toEqual([base + 10, base + 11, base + 12]);
            expect(turned.map(( id ) => id.slice(14))).toEqual(["7fff-bfff-ffffffffffff", "7fff-bfff-ffffffffffff", "7fff-bfff-ffffffffffff"]);

        } finally {

            clock.mockRestore();

        }

    });
    it("one-time codes are drawn without bias", () => {

        expect(rand.engine.with(cycle([250, 251, 9, 255, 19, 249, 5]), () => rand.otp(4))).toBe("9995");
        expect(rand.engine.with(cycle([255, 0]), () => rand.otp(3))).toBe("000");

        const counts = new Array<number>(10).fill(0);

        for ( const digit of rand.otp(20_000) ) counts[Number(digit)] = (counts[Number(digit)] ?? 0) + 1;

        expect(counts.reduce(( sum, count ) => sum + count, 0)).toBe(20_000);
        expect(counts.every(( count ) => count > 1700 && count < 2300)).toBe(true);

    });
    it("integers, indexes, picks and weights hold their edges", () => {

        expect(rand.int(1.2, 1.8)).toBeNaN();
        expect(rand.int(Number.NaN, 1)).toBeNaN();
        expect(rand.int(0, Number.POSITIVE_INFINITY)).toBeNaN();
        expect(rand.int(5, 5)).toBe(5);
        expect([1, 2, 3]).toContain(rand.int(3, 1));
        expect([1, 2]).toContain(rand.int(0.5, 2.5));
        expect(rand.create(() => 0).int(-5, 5)).toBe(-5);
        expect(rand.create(() => 0.9999999999999999).int(-5, 5)).toBe(5);
        expect(rand.create(() => 0.9999999999999999).int(0, 2 ** 40)).toBe(2 ** 40);
        expect(rand.create(() => 0).int(0, 2 ** 40)).toBe(0);

        const stream = rand.seeded("wide");
        const low = Array.from({ length: 8 }, () => stream.int(0, 2 ** 40) % 256);

        expect(low.some(( value ) => value !== 0)).toBe(true);
        expect(rand.create(() => 0.99).index(2.9)).toBe(1);
        expect(rand.index(Number.NaN)).toBe(-1);
        expect(rand.index(-3)).toBe(-1);
        expect(rand.index(Number.POSITIVE_INFINITY)).toBe(-1);
        expect(rand.index(1)).toBe(0);
        expect(rand.weighted([{ item: "a", weight: 0 }, { item: "b", weight: 0 }])).toBeUndefined();
        expect(rand.weighted([{ item: "a", weight: Number.NaN }, { item: "b", weight: -1 }, { item: "c", weight: Number.POSITIVE_INFINITY }])).toBeUndefined();
        expect(rand.weighted([{ item: "a", weight: Number.NaN }, { item: "b", weight: 2 }, { item: "c", weight: 0 }])).toBe("b");
        expect(rand.create(() => 0.9999999999999999).weighted([{ item: "a", weight: 1 }, { item: "b", weight: 1 }, { item: "c", weight: 0 }])).toBe("b");
        expect(rand.create(() => 0).weighted([{ item: "a", weight: 0 }, { item: "b", weight: 1 }])).toBe("b");

        const items = Object.freeze(Array.from({ length: 100 }, ( _, at ) => at));
        const some = rand.pickMany(items, 50);
        let draws = 0;
        const counting = rand.create(() => {

            draws += 1;

            return 0.5;

        });

        expect(new Set(some).size).toBe(50);
        expect(some.every(( item ) => items.includes(item))).toBe(true);
        expect(rand.pickMany(items, 500).sort(( a, b ) => a - b)).toEqual([...items]);
        expect(rand.pickMany(items, -1)).toEqual([]);
        expect(rand.pickMany(items, Number.NaN)).toEqual([]);
        expect(rand.pickMany(items, 1.9)).toHaveLength(1);
        expect(counting.pickMany(items, 3)).toHaveLength(3);
        expect(draws).toBe(3);
        expect(rand.shuffle(items).sort(( a, b ) => a - b)).toEqual([...items]);
        expect(items[0]).toBe(0);
        expect(rand.shuffle([])).toEqual([]);
        expect(rand.float() >= 0 && rand.float() < 1).toBe(true);
        expect(rand.create(() => 0.123456).float(0, 1, 2)).toBe(0.12);
        expect(rand.create(() => 0.5).float(-Number.MAX_VALUE, Number.MAX_VALUE)).toBe(0);
        expect(Number.isFinite(rand.float(-Number.MAX_VALUE, Number.MAX_VALUE))).toBe(true);
        expect(rand.chance(Number.NaN)).toBe(false);
        expect(rand.gaussian(10, 0)).toBe(10);
        expect(Number.isFinite(rand.create(() => 0).gaussian())).toBe(true);
        expect(rand.jitter(100, 0)).toBe(100);
        expect(rand.create(() => 0).jitter(100, 0.5)).toBe(50);
        expect(rand.create(() => 0.5).jitter(100, 0.5)).toBe(100);
        expect(rand.date(new Date(5), new Date(5)).getTime()).toBe(5);
        expect([1, 2, 3]).toContain(rand.date(3, 1).getTime());
        expect(rand.date(Number.NaN, 0).getTime()).toBeNaN();

        const bell = rand.seeded("bell");
        const drawn = Array.from({ length: 5000 }, () => bell.gaussian());
        const mean = drawn.reduce(( sum, value ) => sum + value, 0) / drawn.length;
        const spread = Math.sqrt(drawn.reduce(( sum, value ) => sum + (value - mean) ** 2, 0) / drawn.length);

        expect(Math.abs(mean) < 0.1 && spread > 0.9 && spread < 1.1).toBe(true);

    });
    it("letters, charsets and password rules draw only what they are given", () => {

        expect(rand.letters(40, "ab")).toMatch(/^[ab]{40}$/);
        expect(rand.letters(0, "ab")).toBe("");
        expect(strings.graphemes(rand.letters(12, "👍🏽é")).every(( letter ) => letter === "👍🏽" || letter === "é")).toBe(true);
        expect(strings.graphemes(rand.letters(12, "👍🏽é"))).toHaveLength(12);
        expect(rand.string(64, "alpha")).toMatch(/^[A-Za-z]{64}$/);
        expect(rand.string(64, "upper")).toMatch(/^[A-Z]{64}$/);
        expect(rand.string(64, "lower")).toMatch(/^[a-z]{64}$/);
        expect(rand.string(64, "alnum")).toMatch(/^[A-Za-z0-9]{64}$/);
        expect(rand.string(64, "hex")).toMatch(/^[0-9a-f]{64}$/);
        expect(rand.string(64, "safe")).toMatch(/^[A-HJ-NP-Za-hjkmnp-z2-9]{64}$/);
        expect(rand.string(64)).toMatch(/^[A-Za-z0-9]{64}$/);
        expect(rand.password()).toHaveLength(16);
        expect(rand.password({ length: Number.NaN })).toHaveLength(16);
        expect(rand.password({ length: 7.9 })).toHaveLength(7);
        expect(rand.password({ length: 2 })).toHaveLength(4);
        expect(rand.password({ length: 40, symbols: "#" })).toMatch(/^[A-Za-z0-9#]{40}$/);
        expect(rand.password({ length: 40, symbols: "#" })).toContain("#");
        expect(rand.password({ length: 64, safe: true, symbols: false })).toMatch(/^[A-HJ-NP-Za-hjkmnp-z2-9]{64}$/);
        expect(rand.password({ length: 3, lower: false, upper: false, digits: false, symbols: "👍🏽" })).toBe("👍🏽👍🏽👍🏽");

        for ( let round = 0; round < 300; round += 1 ) {

            const short = rand.password({ length: 4 });

            expect(/[a-z]/.test(short) && /[A-Z]/.test(short) && /\d/.test(short) && /[^A-Za-z0-9]/.test(short)).toBe(true);

        }

    });
    it("a seed pins every verb of its stream", () => {

        const stream = rand.seeded("acme");

        expect([rand.hashed(""), rand.hashed("a"), rand.hashed("foobar"), rand.hashed("سلام")]).toEqual([2_166_136_261, 3_826_002_220, 3_214_735_720, 2_263_956_406]);
        expect([rand.seeded(0).next(), rand.seeded(0).int(1, 100)]).toEqual([0.26642920868471265, 27]);
        expect(stream.next()).toBe(0.6308728090953082);
        expect(stream.int(1, 1000)).toBe(339);
        expect(stream.float(0, 10, 3)).toBe(9.916);
        expect(stream.string(8)).toBe("05UoyfzO");
        expect(stream.hex(8)).toBe("8520b674");
        expect(stream.digits(6)).toBe("881824");
        expect(stream.letters(6, "ab👍🏽")).toBe("a👍🏽bbba");
        expect(stream.uuid()).toBe("deb408fc-4777-432d-aa24-c4e2c666b9dc");
        expect([...stream.bytes(4)]).toEqual([214, 214, 243, 178]);
        expect(stream.shuffle([1, 2, 3, 4, 5, 6])).toEqual([3, 6, 4, 1, 2, 5]);
        expect(stream.pickMany([1, 2, 3, 4, 5, 6], 3)).toEqual([3, 6, 5]);
        expect(stream.password({ length: 12 })).toBe("LA!ktCAv4<^[");
        expect(stream.color()).toBe("#185008");
        expect(stream.int(0, 2 ** 40)).toBe(933_589_815_706);
        expect(stream.date(0, 1_000_000).getTime()).toBe(887_883);
        expect(stream.weighted([{ item: "a", weight: 1 }, { item: "b", weight: 3 }])).toBe("b");
        expect(rand.seeded(1.5).next()).toBe(rand.seeded("1.5").next());
        expect(rand.seeded(-1).next()).toBe(rand.seeded("-1").next());
        expect(rand.seeded(2 ** 32).next()).toBe(rand.seeded(String(2 ** 32)).next());
        expect(rand.seeded(42).next()).not.toBe(rand.seeded("42").next());
        expect([...rand.create(() => 0.5).bytes(3)]).toEqual([128, 128, 128]);
        expect(rand.create(() => 0.999).uuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");

    });

});
