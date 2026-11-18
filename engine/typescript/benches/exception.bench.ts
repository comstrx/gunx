import * as exception from "engine/exception";
import { bench, do_not_optimize, run } from "mitata";

const envelope = { data: null, message: "The given data is invalid", errors: { email: ["taken"] }, code: "validation", reason: "signup", meta: { request_id: "abc" } };

bench("exception.fault", () => do_not_optimize(exception.fault("validation", "signup", { errors: { email: ["taken"] } })));
bench("exception.fromEnvelope", () => do_not_optimize(exception.fromEnvelope(envelope, 422)));
bench("exception.toEnvelope", () => do_not_optimize(exception.toEnvelope(exception.fault("not_found", "r"))));
bench("exception.of", () => do_not_optimize(exception.of(new Error("x"))));

await run();
