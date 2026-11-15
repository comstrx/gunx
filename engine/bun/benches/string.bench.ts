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

const long = "alpha beta gamma delta ".repeat(45_000);
const unicode = "👨‍👩‍👧‍👦 café سَلَام ".repeat(5_000);
const words = "alpha ".repeat(20_000);
bench("string.truncate.large-prefix", () => do_not_optimize(string.truncate(long, 40)));
bench("string.take.large-prefix", () => do_not_optimize(string.take(long, 40)));
bench("string.limitWords.large-prefix", () => do_not_optimize(string.limitWords(long, 8)));
bench("string.initials.large-prefix", () => do_not_optimize(string.initials(long, 2)));
bench("string.truncate.unicode-prefix", () => do_not_optimize(string.truncate(unicode, 40)));
bench("string.length.unicode", () => do_not_optimize(string.length(unicode)));
bench("string.wrap.large-line", () => do_not_optimize(string.wrap(words, words.length)));
bench("string.byteLength.unicode", () => do_not_optimize(string.byteLength(unicode)));

await run();
