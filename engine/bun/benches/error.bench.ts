import * as error from "engine/error";
import { bench, do_not_optimize, run } from "mitata";

const envelope = { data: null, message: "The given data is invalid", errors: { email: ["taken"] }, code: "validation", reason: "signup", meta: { request_id: "abc" } };

bench("error.fault", () => do_not_optimize(error.fault("validation", "signup", { errors: { email: ["taken"] } })));
bench("error.fromEnvelope", () => do_not_optimize(error.fromEnvelope(envelope, 422)));
bench("error.toEnvelope", () => do_not_optimize(error.toEnvelope(error.fault("not_found", "r"))));
bench("error.of", () => do_not_optimize(error.of(new Error("x"))));

await run();
