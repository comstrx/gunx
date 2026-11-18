import * as date from "engine/date";
import { bench, do_not_optimize, run } from "mitata";

const sample = new Date("2026-03-15T13:45:30.250Z");

bench("date.from.plain", () => do_not_optimize(date.from("2026-03-15")));
bench("date.add.months", () => do_not_optimize(date.add(sample, { months: 1, days: 3 })));
bench("date.format.style", () => do_not_optimize(date.format(sample, "datetime", { locale: "ar-EG" })));
bench("date.format.pattern", () => do_not_optimize(date.format(sample, "YYYY-MM-DD HH:mm")));
bench("date.relative", () => do_not_optimize(date.relative(sample, new Date("2026-03-15T15:00:00Z"), "ar")));
bench("date.grid", () => do_not_optimize(date.grid(sample, "ar")));
bench("date.hijri", () => do_not_optimize(date.hijri(sample)));

await run();
