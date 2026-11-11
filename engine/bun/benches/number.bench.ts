import * as number from "engine/number";
import { bench, do_not_optimize, run } from "mitata";

bench("number.format", () => do_not_optimize(number.format(1234567.891, { digits: 2 })));
bench("number.currency", () => do_not_optimize(number.currency(1234.5, "EGP", { locale: "ar-EG" })));
bench("number.category", () => do_not_optimize(number.category(103, "ar")));
bench("number.words", () => do_not_optimize(number.words(123456, "ar")));
bench("number.precision", () => do_not_optimize(number.precision(1.005, 2)));

await run();
