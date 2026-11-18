import { describe, expect, test as it } from "bun:test";
import * as date from "engine/date";

const sample = new Date("2026-03-15T13:45:30.250Z");

describe("date", () => {

    it("from refuses rolled-over plain dates and reads every input", () => {

        expect(date.from("2026-02-30")).toBeUndefined();
        expect(date.iso(date.from("2026-02-28"))).toBe("2026-02-28T00:00:00.000Z");
        expect(date.from(1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000);
        expect(date.from("1700000000000")?.getTime()).toBe(1_700_000_000_000);
        expect(date.from("nope")).toBeUndefined();
        expect(date.from(null) ?? date.from("") ?? date.from(undefined)).toBeUndefined();
        expect(date.from(new Date(Number.NaN))).toBeUndefined();
        expect(date.from(1e300) ?? date.from(-8.64e15 - 1) ?? date.from(Number.POSITIVE_INFINITY)).toBeUndefined();
        expect(date.from(8.64e15)?.getTime()).toBe(8.64e15);
        expect(date.iso(1e300)).toBe("");
        expect(date.valid(sample) && !date.valid("x")).toBe(true);
        expect(date.plain(sample)).toBe("2026-03-15");
        expect(date.clock(sample)).toBe("13:45");
        expect(date.clock(sample, true)).toBe("13:45:30");
        expect(date.iso("bad")).toBe("");
        expect(typeof date.now()).toBe("number");

    });
    it("calendar math is UTC and month-end safe", () => {

        expect(date.isLeap(2024) && !date.isLeap(1900) && date.isLeap(2000)).toBe(true);
        expect(date.daysIn(2026, 2)).toBe(28);
        expect(date.weekday(sample)).toBe(0);
        expect(date.iso(date.startOf(sample, "month"))).toBe("2026-03-01T00:00:00.000Z");
        expect(date.iso(date.endOf(sample, "month"))).toBe("2026-03-31T23:59:59.999Z");
        expect(date.iso(date.startOf(sample, "week"))).toBe("2026-03-15T00:00:00.000Z");
        expect(date.iso(date.startOf(sample, "week", 6))).toBe("2026-03-14T00:00:00.000Z");
        expect(date.iso(date.startOf(sample, "hour"))).toBe("2026-03-15T13:00:00.000Z");
        expect(date.iso(date.endOf(sample, "year"))).toBe("2026-12-31T23:59:59.999Z");
        expect(date.plain(date.add("2026-01-31", { months: 1 }))).toBe("2026-02-28");
        expect(date.plain(date.add("2024-02-29", { years: 1 }))).toBe("2025-02-28");
        expect(date.iso(date.add(sample, { days: 1, hours: -13, minutes: 15 }))).toBe("2026-03-16T01:00:30.250Z");
        expect(date.plain(date.subtract(sample, { weeks: 2 }))).toBe("2026-03-01");
        expect(date.diff("2026-03-15", "2026-01-15", "month")).toBe(2);
        expect(date.diff("2026-03-14", "2026-01-15", "month")).toBe(1);
        expect(date.diff("2026-01-15", "2026-03-15", "month")).toBe(-2);
        expect(date.diff("2028-01-01", "2026-06-01", "year")).toBe(1);
        expect(date.diff("2026-03-15T12:00:00Z", "2026-03-14T00:00:00Z", "hour")).toBe(36);
        expect(date.diff("2026-03-15", "2026-03-01")).toBe(14);
        expect(Number.isNaN(date.diff("x", sample))).toBe(true);
        expect(date.isSame(sample, "2026-03-15T01:00:00Z")).toBe(true);
        expect(date.isSame(sample, "2026-03-01", "month") && !date.isSame(sample, "2026-04-01", "month")).toBe(true);
        expect(date.isBefore("2026-01-01", sample) && date.isAfter(sample, "2026-01-01")).toBe(true);
        expect(date.isBetween(sample, "2026-03-15T13:45:30.250Z", "2026-04-01")).toBe(true);
        expect(date.isBetween(sample, "2026-03-15T13:45:30.250Z", "2026-04-01", false)).toBe(false);
        expect(date.today().getUTCHours()).toBe(0);
        expect(date.diff(date.tomorrow(), date.today())).toBe(1);
        expect(date.diff(date.today(), date.yesterday())).toBe(1);
        expect(date.iso(date.midnight(sample))).toBe("2026-03-15T00:00:00.000Z");
        expect(date.iso(date.noon(sample))).toBe("2026-03-15T12:00:00.000Z");

    });
    it("parts, weeks and the world", () => {

        expect(date.parts(sample)).toEqual({ year: 2026, month: 3, day: 15, hour: 13, minute: 45, second: 30, millisecond: 250, weekday: 0 });
        expect(date.iso(date.fromParts({ year: 2026, month: 2, day: 28, hour: 23 }))).toBe("2026-02-28T23:00:00.000Z");
        expect(date.fromParts({ year: 2026, month: 2, day: 29 })).toBeUndefined();
        expect(date.fromParts({ hour: 24 })).toBeUndefined();
        expect(date.iso(date.set(sample, { hour: 0, minute: 0, second: 0, millisecond: 0 }))).toBe("2026-03-15T00:00:00.000Z");
        expect(date.weekStart("ar-EG")).toBe(6);
        expect(date.weekStart("de")).toBe(1);
        expect(date.weekStart("en-GB")).toBe(1);
        expect(date.weekStart("en-US")).toBe(0);
        expect(date.weekend("ar")).toEqual([5, 6]);
        expect(date.isWeekend("2026-03-13", "ar") && !date.isWeekend("2026-03-13", "en") && date.isWeekend("2026-03-15", "en")).toBe(true);
        expect(date.quarter(sample)).toBe(1);
        expect(date.dayOfYear(sample)).toBe(74);
        expect(date.weekOfYear("2026-01-01")).toBe(1);
        expect(date.weekOfYear("2027-01-01")).toBe(53);
        expect(date.range("2026-03-01", "2026-03-03").map(( day ) => date.plain(day))).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
        expect(date.range("2026-01-15", "2026-03-15", "month")).toHaveLength(3);

        const grid = date.grid(sample, "ar");

        expect(grid?.weeks).toHaveLength(5);
        expect(grid?.weeks[0]?.[0]).toBeUndefined();
        expect(date.plain(grid?.weeks[0]?.[1])).toBe("2026-03-01");
        expect(date.age("2002-09-28", "2026-09-27")).toBe(23);
        expect(date.age("2002-09-28", "2026-09-28")).toBe(24);
        expect(date.compare(sample, "2026-01-01")).toBe(1);
        expect(date.plain(date.clamp("2026-05-01", "2026-01-01", "2026-03-01"))).toBe("2026-03-01");
        expect(date.plain(date.earliest(["2026-03-01", "x", "2025-01-01"]))).toBe("2025-01-01");
        expect(date.plain(date.latest(["2026-03-01", "2025-01-01"]))).toBe("2026-03-01");
        expect(date.earliest([])).toBeUndefined();
        expect(date.isToday(new Date()) && date.isTomorrow(date.tomorrow()) && date.isYesterday(date.yesterday())).toBe(true);
        expect(date.isPast("2000-01-01") && date.isFuture("2999-01-01")).toBe(true);
        expect(date.inTimeZone(sample, "Africa/Cairo")?.hour).toBe(15);
        expect(date.inTimeZone(sample, "Asia/Riyadh")?.hour).toBe(16);
        expect(date.inTimeZone(sample, "Nowhere/City")).toBeUndefined();

        const hijri = date.hijri("2026-02-18");

        expect(hijri?.year).toBe(1447);
        expect(hijri?.month).toBe(9);
        expect(hijri?.day).toBe(1);

    });
    it("formats by style, by pattern, in Arabic and relative", () => {

        expect(date.format(sample, "date")).toBe("Mar 15, 2026");
        expect(date.format(sample, "time")).toBe("1:45 PM");
        expect(date.format(sample, "clock")).toBe("13:45");
        expect(date.format(sample, "weekday", { locale: "ar" })).toBe("الأحد");
        expect(date.format(sample, "month")).toBe("March 2026");
        expect(date.format(sample, "YYYY-MM-DD HH:mm:ss")).toBe("2026-03-15 13:45:30");
        expect(date.format(sample, "DDDD, D MMMM YYYY h:mm A")).toBe("Sunday, 15 March 2026 1:45 PM");
        expect(date.format(sample, "DDD D MMM YY [at] hh:mm a", { locale: "ar", numerals: "arab" })).toBe("أحد ١٥ مار ٢٦ at ٠١:٤٥ م");
        expect(date.format("bad", "date")).toBe("");
        expect(date.format(sample, "long", { timeZone: "Africa/Cairo", locale: "ar-EG" })).toContain("مارس");
        expect(date.relative("2026-03-15T13:45:00Z", sample)).toBe("just now");
        expect(date.relative("2026-03-15T13:40:30Z", sample)).toBe("5 minutes ago");
        expect(date.relative("2026-03-15T14:45:30Z", sample)).toBe("in 1 hour");
        expect(date.relative("2026-03-13T13:45:30Z", sample)).toBe("2 days ago");
        expect(date.relative("2024-03-15T13:45:30Z", sample)).toBe("2 years ago");
        expect(date.relative("2026-03-15T13:40:30Z", sample, "ar")).toBe("منذ 5 دقائق");
        expect(date.relative("2026-03-17T13:45:30Z", sample, "ar")).toBe("بعد يومين");
        expect(date.relative("2026-03-15T13:45:30Z", sample, "ar")).toBe("الآن");
        expect(date.duration(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1, total: 90_061_000 });
        expect(date.humanDuration(90_061_000)).toBe("1 day 1 hour");
        expect(date.humanDuration(90_061_000, "en", 4)).toBe("1 day 1 hour 1 minute 1 second");
        expect(date.humanDuration(7_200_000, "ar")).toBe("ساعتين");
        expect(date.humanDuration(0)).toBe("0 seconds");
        expect(date.monthName(1, "ar")).toBe("يناير");
        expect(date.dayName(5, "en", true)).toBe("Fri");
        expect(date.names("ar").meridiem).toEqual(["ص", "م"]);

    });
    it("sleep resolves", async () => {

        const started = Date.now();

        await date.sleep(5);
        expect(Date.now() - started).toBeGreaterThanOrEqual(4);

    });
    it("a span splits an interval into days, hours, minutes and seconds and knows its direction", () => {

        expect(date.span("2026-03-03T02:03:04Z", "2026-03-01T00:00:00Z")).toEqual({ days: 2, hours: 2, minutes: 3, seconds: 4, ms: 180_184_000, negative: false });
        expect(date.span("2026-03-01", "2026-03-02")?.negative).toBe(true);
        expect(date.span("nope", "2026-03-02")).toBeUndefined();

    });
    it("from reads strict ISO and HTTP dates and nothing the host would guess", () => {

        expect(date.from("garbage 5") ?? date.from("March 7, 2026") ?? date.from("3/7/2026")).toBeUndefined();
        expect(date.from("2026-02-30T10:00:00Z") ?? date.from("2026-03-15T24:00:00Z") ?? date.from("2026-03-15T13:45:30+24:00")).toBeUndefined();
        expect(date.from("-000000-01-01") ?? date.from("x".repeat(65))).toBeUndefined();
        expect(date.iso(date.from("2026-03-15T13:45"))).toBe("2026-03-15T13:45:00.000Z");
        expect(date.iso(date.from("2026-03-15T13:45:30+02:00"))).toBe("2026-03-15T11:45:30.000Z");
        expect(date.iso(date.from("2026-03-15 13:45:30.5-0330"))).toBe("2026-03-15T17:15:30.500Z");
        expect(date.iso(date.from("2026-03-15T13:45:30.123456789Z"))).toBe("2026-03-15T13:45:30.123Z");
        expect(date.iso(date.from("2026-03"))).toBe("2026-03-01T00:00:00.000Z");
        expect(date.iso(date.from("+002026-03-15"))).toBe("2026-03-15T00:00:00.000Z");
        expect(date.iso(date.from("  2026-03-15  "))).toBe("2026-03-15T00:00:00.000Z");
        expect(date.iso(date.from("Sun, 15 Mar 2026 13:45:30 GMT"))).toBe("2026-03-15T13:45:30.000Z");
        expect(date.iso(date.from("Sunday, 15-Mar-26 13:45:30 GMT"))).toBe("2026-03-15T13:45:30.000Z");
        expect(date.iso(date.from("Sun Mar 15 13:45:30 2026"))).toBe("2026-03-15T13:45:30.000Z");
        expect(date.iso(date.from("Sun, 15 Mar 2026 13:45:30 +0200"))).toBe("2026-03-15T11:45:30.000Z");
        expect(date.iso(undefined) + date.plain(undefined) + date.clock(undefined)).toBe("");
        expect(date.iso()).toHaveLength(24);
        expect(date.weekday("bad")).toBe(-1);
        expect(date.weekday()).toBeGreaterThanOrEqual(0);

    });
    it("calendar math holds at quarter, week and month edges", () => {

        expect([date.daysIn(2024, 2), date.daysIn(2026, 14), date.daysIn(2023, 14), date.daysIn(2026, 0)]).toEqual([29, 28, 29, 31]);
        expect(date.iso(date.startOf(sample, "quarter"))).toBe("2026-01-01T00:00:00.000Z");
        expect(date.iso(date.endOf(sample, "quarter"))).toBe("2026-03-31T23:59:59.999Z");
        expect(date.iso(date.startOf(sample, "week", 1))).toBe("2026-03-09T00:00:00.000Z");
        expect(date.plain(date.add("2026-01-31", { quarters: 1 }))).toBe("2026-04-30");
        expect(date.iso(date.add(sample, { milliseconds: 750 }))).toBe("2026-03-15T13:45:31.000Z");
        expect(date.diff("2026-10-01", "2026-01-01", "quarter")).toBe(3);
        expect(date.diff("2026-03-31", "2026-02-28", "month")).toBe(1);
        expect(date.diff("2026-02-28", "2026-01-31", "month")).toBe(1);
        expect(date.diff("2026-03-15T13:45:30Z", "2026-03-15T13:44:00Z", "second")).toBe(90);
        expect(date.diff("2026-03-29", "2026-03-15", "week")).toBe(2);
        expect(date.isBetween(sample, "2026-04-01", "2026-03-01")).toBe(true);
        expect(date.add(8.64e15, { days: 1 }) ?? date.startOf("bad", "day") ?? date.endOf("bad", "day")).toBeUndefined();

    });
    it("set clamps the day it was not given, and week rules follow the region", () => {

        expect(date.plain(date.set("2026-01-31", { month: 2 }))).toBe("2026-02-28");
        expect(date.set(sample, { day: 31, month: 2 }) ?? date.set("bad", {})).toBeUndefined();
        expect(["ur", "ar-SA", "pt", "pt-PT", "zh-Hant", "en_US", "fr-CA", "he"].map(( tag ) => date.weekStart(tag))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
        expect(["xx", "en-150", "ar-001", "zh", "es-419", "en-AU", ""].map(( tag ) => date.weekStart(tag))).toEqual([1, 1, 1, 1, 1, 1, 1]);
        expect([date.weekStart("fa"), date.weekStart("dv"), date.weekStart("en-u-fw-sat")]).toEqual([6, 5, 6]);
        expect(date.weekStart(42 as never)).toBe(1);
        expect(["ar-001", "en", "ar-AE"].map(( tag ) => date.weekend(tag))).toEqual([[6, 0], [6, 0], [6, 0]]);
        expect(["fa", "hi", "he", "ps", "ar-SA"].map(( tag ) => date.weekend(tag))).toEqual([[5, 5], [0, 0], [5, 6], [4, 5], [5, 6]]);
        expect(date.isWeekend("2026-03-13", "fa") && !date.isWeekend("2026-03-14", "fa") && date.isWeekend("2026-03-12", "ps") && !date.isWeekend("bad")).toBe(true);
        expect([date.weekYear("2027-01-01"), date.weekYear("2026-12-31"), date.weekYear("2024-12-30")]).toEqual([2026, 2026, 2025]);
        expect(date.weekOfYear("2024-12-30")).toBe(1);
        expect(Number.isNaN(date.weekYear("x")) && date.weekOfYear("x") === 0).toBe(true);
        expect([date.quarter("x"), date.quarter("2026-12-31"), date.dayOfYear("x"), date.dayOfYear("2024-12-31")]).toEqual([0, 4, 0, 366]);

    });
    it("range steps from the unit's start and stays bounded; grid, age, compare and clamp hold on bad input", () => {

        expect(date.range("2026-03-15T10:30:00Z", "2026-03-15T13:00:00Z", "hour").map(( at ) => date.clock(at))).toEqual(["10:00", "11:00", "12:00", "13:00"]);
        expect(date.range("2026-03-01", "2026-03-22", "week").map(( at ) => date.plain(at))).toEqual(["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22"]);
        expect(date.range("2026-01-31", "2026-03-15", "month").map(( at ) => date.plain(at))).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
        expect(date.range("2026-02-10", "2026-12-31", "quarter").map(( at ) => date.plain(at))).toEqual(["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]);
        expect(date.range("2024-06-01", "2026-01-01", "year").map(( at ) => date.plain(at))).toEqual(["2024-01-01", "2025-01-01", "2026-01-01"]);
        expect(date.range("2026-03-03", "2026-03-01")).toEqual([]);
        expect(date.range("bad", "2026-03-03")).toEqual([]);
        expect(date.range("2026-03-01", "2026-03-03", "decade" as never)).toEqual([]);
        expect(date.range("2000-01-01", "2100-01-01")).toHaveLength(10_000);
        expect(date.plain(date.grid(sample, "en")?.weeks[0]?.[0])).toBe("2026-03-01");
        expect([date.grid("2026-02-01", "en")?.weeks.length, date.grid("2026-02-01", "de")?.weeks.length]).toEqual([4, 5]);
        expect(date.grid("bad")).toBeUndefined();
        expect(Number.isNaN(date.age("x"))).toBe(true);
        expect([date.age("2030-01-01", "2026-01-01"), date.age("2024-02-29", "2025-02-28"), date.age("2024-02-29", "2025-03-01")]).toEqual([0, 0, 1]);
        expect([date.compare("x", sample), date.compare(sample, "x"), date.compare("x", "y"), date.compare(sample, sample)]).toEqual([1, -1, 0, 0]);
        expect(["2026-03-01", "x", "2025-01-01"].sort(date.compare)).toEqual(["2025-01-01", "2026-03-01", "x"]);
        expect(date.iso(date.clamp(sample, "x", "y"))).toBe("2026-03-15T13:45:30.250Z");
        expect(date.plain(date.clamp("2025-01-01", "2026-03-01", "2026-01-01"))).toBe("2026-01-01");
        expect(date.clamp("bad", sample, sample)).toBeUndefined();

    });
    it("offset, zoned and inTimeZone agree across daylight saving, and hijri reads the lunar date", () => {

        expect([date.offset(sample, "Africa/Cairo"), date.offset("2026-07-01", "Africa/Cairo"), date.offset(sample, "Asia/Kolkata"), date.offset(sample, "UTC")]).toEqual([120, 180, 330, 0]);
        expect([date.offset(sample, "America/New_York"), date.offset("2026-01-15", "America/New_York"), date.offset(sample, "America/St_Johns"), date.offset(sample, "Asia/Kathmandu")]).toEqual([-240, -300, -150, 345]);
        expect(Number.isNaN(date.offset(sample, "Nowhere/City")) && Number.isNaN(date.offset("bad", "UTC"))).toBe(true);
        expect(date.iso(date.zoned("2026-03-15T12:00", "America/New_York"))).toBe("2026-03-15T16:00:00.000Z");
        expect(date.iso(date.zoned("2026-01-15T12:00", "America/New_York"))).toBe("2026-01-15T17:00:00.000Z");
        expect(date.iso(date.zoned("2026-03-08T02:30", "America/New_York"))).toBe("2026-03-08T07:30:00.000Z");
        expect(date.iso(date.zoned("2026-11-01T01:30", "America/New_York"))).toBe("2026-11-01T05:30:00.000Z");
        expect(date.iso(date.zoned("2026-10-25T02:30", "Europe/Berlin"))).toBe("2026-10-25T00:30:00.000Z");
        expect(date.iso(date.zoned("2026-03-29T02:30", "Europe/Berlin"))).toBe("2026-03-29T01:30:00.000Z");
        expect(date.iso(date.zoned("2026-03-15T12:00", "UTC"))).toBe("2026-03-15T12:00:00.000Z");
        expect(date.zoned("2026-03-15T12:00", "Nowhere/City") ?? date.zoned("bad", "UTC")).toBeUndefined();
        expect(date.inTimeZone(date.zoned("2026-03-15T12:00", "Asia/Tokyo"), "Asia/Tokyo")).toEqual({ year: 2026, month: 3, day: 15, hour: 12, minute: 0, second: 0, millisecond: 0, weekday: 0 });
        expect(date.inTimeZone(sample, "Asia/Kolkata")).toEqual({ year: 2026, month: 3, day: 15, hour: 19, minute: 15, second: 30, millisecond: 250, weekday: 0 });
        expect(date.inTimeZone("2026-03-15T22:00:00Z", "Asia/Tokyo")).toMatchObject({ day: 16, hour: 7, weekday: 1 });
        expect([0, -1, 1].map(( year ) => date.inTimeZone(date.fromParts({ year, month: 6, day: 1 }), "UTC")?.year)).toEqual([0, -1, 1]);
        expect(date.inTimeZone(sample, 42 as never) ?? date.inTimeZone(sample, "")).toBeUndefined();

        const moon: date.Hijri | undefined = date.hijri("2026-02-18", "en");

        expect(moon).toMatchObject({ year: 1447, month: 9, day: 1 });
        expect(moon?.text).toContain("Ramadan");
        expect(date.hijri("2026-02-18")?.text).toContain("رمضان");
        expect(date.hijri("2026-03-20")).toMatchObject({ month: 10, day: 1 });
        expect(date.hijri("bad")).toBeUndefined();

    });
    it("patterns carry milliseconds and the zone offset, styles follow the locale and the zone", () => {

        expect(date.format(sample, "YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe("2026-03-15T13:45:30.250Z");
        expect(date.format(sample, "YYYY-MM-DD HH:mm Z", { timeZone: "Africa/Cairo" })).toBe("2026-03-15 15:45 +02:00");
        expect(date.format(sample, "HH:mm Z", { timeZone: "America/St_Johns" })).toBe("11:15 -02:30");
        expect(date.format(date.fromParts({ year: 987, month: 1, day: 2 }), "YYYY/YY")).toBe("0987/87");
        expect(date.format(sample, "[YYYY] H:m:s a")).toBe("YYYY 13:45:30 pm");
        expect(date.format(date.fromParts({ year: new Date().getUTCFullYear(), month: 3, day: 15 }), "near")).toBe("Mar 15");
        expect(date.format("2001-03-15", "near")).toBe("Mar 15, 2001");
        expect(date.format(sample, "date", { timeZone: "Nowhere/City" }) + date.format(sample, "YYYY", { timeZone: "Nowhere/City" })).toBe("");
        expect(date.format(sample, "x".repeat(257)) + date.format(sample, 42 as never)).toBe("");
        expect(date.format(sample, "date", { locale: "zz-notalocale" })).toBe("Mar 15, 2026");
        expect(date.format(sample, "date", { locale: "xx" })).toBe("Mar 15, 2026");
        expect(date.format(sample, "date", { locale: "fr" })).toMatch(/^15\smars\s2026$/);
        expect(date.format(sample, "DDDD D MMMM", { locale: "fr" })).toBe("dimanche 15 mars");
        expect(date.format(sample, "DDDD D MMMM", { locale: "de" })).toBe("Sonntag 15 März");
        expect(date.format(sample, "date", { locale: "ar", numerals: "arab" })).toContain("٢٠٢٦");
        expect(date.format(sample, "date", { locale: "ar", numerals: "latn" })).toContain("2026");
        expect(date.format(sample, "time", { timeZone: "Asia/Riyadh" })).toMatch(/^4:45\sPM$/);
        expect(date.format(sample, "datetime", { timeZone: "Asia/Tokyo", locale: "en-GB" })).toMatch(/^15\sMar\s2026,\s22:45$/);

    });
    it("relative promotes at the rounding edge and speaks the locale; durations and names follow it", () => {

        const at = sample.getTime();

        expect(date.relative(at + 3_599_000, sample)).toBe("in 1 hour");
        expect(date.relative(at - 86_399_000, sample)).toBe("1 day ago");
        expect(date.relative(at + 59_500, sample)).toBe("in 1 minute");
        expect(date.relative(at + 44_000, sample)).toBe("just now");
        expect(date.relative(at + 45_000, sample)).toBe("in 45 seconds");
        expect(date.relative(at - 11 * 86_400_000, sample)).toBe("2 weeks ago");
        expect(date.relative("2026-03-13T13:45:30Z", sample, "fr")).toMatch(/^il\sy\sa\s2\sjours$/);
        expect(date.relative(sample, sample, "fr")).toBe("maintenant");
        expect(date.relative("2026-03-15T13:40:30Z", sample, "de")).toMatch(/^vor\s5\sMinuten$/);
        expect(date.relative(at + 400 * 86_400_000, sample, "xx")).toBe("in 1 year");
        expect(date.relative(at - 660_000, sample, "ar")).toBe("منذ 11 دقيقة");
        expect(date.relative(at - 180_000, sample, "ar")).toBe("منذ 3 دقائق");
        expect(date.relative(at + 21 * 86_400_000, sample, "ar")).toBe("بعد 3 أسابيع");
        expect(date.relative("bad") + date.relative(sample, "bad")).toBe("");
        expect(date.humanDuration(90_061_000, "en", 0)).toBe("1 day");
        expect(date.humanDuration(90_061_000, "fr")).toMatch(/^1\sjour\s1\sheure$/);
        expect(date.humanDuration(3_600_000, "de")).toMatch(/^1\sStunde$/);
        expect(date.humanDuration(90_061_000, "ar", 4)).toBe("يوم وساعة ودقيقة وثانية");
        expect(date.humanDuration(660_000, "ar")).toBe("11 دقيقة");
        expect(date.humanDuration(Number.NaN)).toBe("0 seconds");
        expect(date.duration(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });
        expect(date.duration(Number.POSITIVE_INFINITY).total).toBe(0);
        expect([date.monthName(13), date.monthName(0), date.monthName(2.9), date.dayName(7), date.dayName(-1)]).toEqual(["January", "December", "February", "Sunday", "Saturday"]);
        expect([date.monthName(3, "fr"), date.dayName(0, "de"), date.names("fr").monthsShort[0]]).toEqual(["mars", "Sonntag", "janv."]);
        expect(date.names("xx")).toBe(date.names("en"));
        expect(date.names("ja").meridiem).toEqual(["午前", "午後"]);
        expect(date.names("fa").months[0]).toBe("ژانویه");

    });
    it("sleep stops when its signal aborts and never waits on a bad delay", async () => {

        const stop = new AbortController();
        const pending = date.sleep(60_000, stop.signal);

        stop.abort(new Error("stopped"));

        await expect(pending).rejects.toThrow("stopped");
        await expect(date.sleep(60_000, AbortSignal.abort(new Error("gone")))).rejects.toThrow("gone");
        await date.sleep(Number.NaN);

    });

});
