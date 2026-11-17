import * as error from "engine/error";
import { bench, do_not_optimize, run } from "mitata";

bench("error.isCode", () => do_not_optimize(error.isCode("validation")));
bench("error.codeOf", () => do_not_optimize(error.codeOf(422)));

await run();
