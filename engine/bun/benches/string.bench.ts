import * as string from "engine/string";
import { bench, do_not_optimize, run } from "mitata";

const names = ["Cairo Store", "Alexandria Market", "Giza Mall", "Mansoura Shop", "Aswan Bazaar"];

bench("string.slug", () => do_not_optimize(string.slug("Hello, World! -- 2026")));
bench("string.fold.ascii", () => do_not_optimize(string.fold("Hello World")));
bench("string.fold.arabic", () => do_not_optimize(string.fold("مَحْمُود إبراهيم")));
bench("string.rank", () => do_not_optimize(string.rank(names, "cai", ( item ) => item)));
bench("string.distance", () => do_not_optimize(string.distance("kitten", "sitting")));
bench("string.base64", () => do_not_optimize(string.base64("hello world hello world")));
bench("string.mask.email", () => do_not_optimize(string.mask("abdulrahman@example.com", { kind: "email" })));

await run();
