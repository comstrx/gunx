import * as log from "engine/log";
import { bench, do_not_optimize, run } from "mitata";

const memory = log.memorySink(10);
const logger = log.create({ name: "bench", level: "info", sinks: [memory] });
const quiet = log.create({ name: "bench", level: "warn", sinks: [memory] });
const open = log.create({ name: "bench", sinks: [memory], redact: false });
const named = log.create({ name: "bench", sinks: [memory], redact: ["national_id", "iban"] });
const child = logger.child("part", { part: "p" });
const state: { now: log.Level } = { now: "info" };
const moving = log.create({ name: "bench", level: () => state.now, sinks: [memory] });
const failure = new Error("outer", { cause: new TypeError("inner") });
const nested = { user: { id: 7, token: "secret-token", roles: ["a", "b"] }, order: { id: 9, lines: [{ sku: "x", count: 2 }, { sku: "y", count: 1 }] } };
const wide = Object.fromEntries(Array.from({ length: 60 }, ( _, at ) => [`field${at}`, at % 3 === 0 ? `value ${at}` : at]));
const entry: log.Entry = { at: 0, level: "info", name: "n", message: "m", facts: { a: 1, user: { id: 7, token: "secret-token" } } };
const noisy: log.Entry = { at: 0, level: "warn", name: "n", message: "line one\nline two\tend", facts: { note: "a\nb\rc" } };
const line = log.lineSink(() => undefined);
const jsonl = log.jsonSink(() => undefined);
const first = log.once(() => undefined);
const paced = log.throttled(() => undefined, 1000);
const batch = log.batchSink(() => undefined, { size: 50, wait: 1000 });
const counted = log.counting();
const both = log.tee(counted, memory);
const floor = log.leveled(counted, "warn");
let tick = 0;

bench("log.info", () => logger.info("hello", { user: { id: 7, token: "secret-token" } }));
bench("log.info.bare", () => logger.info("hello"));
bench("log.info.nested", () => logger.info("hello", nested));
bench("log.info.wide", () => logger.info("hello", wide));
bench("log.info.gated", () => quiet.info("hello", { user: { id: 7 } }));
bench("log.info.open", () => open.info("hello", nested));
bench("log.info.named", () => named.info("hello", nested));
bench("log.info.masked", () => logger.info("GET /cb?code=1&access_token=abc123&state=x with Bearer abcDEF123456.xyz"));
bench("log.info.moving", () => moving.info("hello"));
bench("log.child.info", () => child.info("hello", { id: 7 }));
bench("log.child", () => do_not_optimize(logger.child("part", { part: "p" })));
bench("log.error", () => logger.error("failed", failure, { id: 7 }));
bench("log.time", () => do_not_optimize(quiet.time("lap")()));
bench("log.redact", () => do_not_optimize(log.redact(entry.facts)));
bench("log.redact.nested", () => do_not_optimize(log.redact(nested)));
bench("log.redact.wide", () => do_not_optimize(log.redact(wide)));
bench("log.redact.named", () => do_not_optimize(log.redact(nested, ["national_id"])));
bench("log.lineSink", () => line(entry));
bench("log.lineSink.escaped", () => line(noisy));
bench("log.jsonSink", () => jsonl(entry));
bench("log.jsonSink.escaped", () => jsonl(noisy));
bench("log.once.seen", () => first(entry));
bench("log.once.fresh", () => {

    tick += 1;
    first({ ...entry, message: `m${tick}` });

});
bench("log.throttled", () => paced(entry));
bench("log.batchSink", () => batch(entry));
bench("log.tee", () => both(entry));
bench("log.leveled", () => floor(entry));
bench("log.lastOf", () => do_not_optimize(log.lastOf(memory.entries, "warn")));

await run();
