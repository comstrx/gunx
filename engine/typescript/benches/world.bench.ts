import * as world from "engine/world";
import { bench, do_not_optimize, run } from "mitata";

await world.load();

const en = world.define();
const ar = world.define({ locale: "ar-EG" });

bench("world.define", () => do_not_optimize(world.define({ locale: "ar" })));
bench("world.countries.get", () => do_not_optimize(world.countries.get("EG")));
bench("world.countries.byAlpha3", () => do_not_optimize(world.countries.byAlpha3("EGY")));
bench("world.countries.byPhone", () => do_not_optimize(world.countries.byPhone("+1 416 555 0100")));
bench("world.countries.search", () => do_not_optimize(world.countries.search("saud")));
bench("world.countries.phone local", () => do_not_optimize(world.countries.phone("01000000000", "eg")));
bench("world.countries.phone e164", () => do_not_optimize(world.countries.phone("+20 100 000 0000")));
bench("world.countries.localOf", () => do_not_optimize(world.countries.localOf("+201000000000")));
bench("world.countries.sorted ar", () => do_not_optimize(world.countries.sorted("ar")));
bench("world.countries.grouped", () => do_not_optimize(world.countries.grouped("en")));
bench("world.keys.search digits", () => do_not_optimize(world.keys.search("96")));
bench("world.keys.search name", () => do_not_optimize(world.keys.search("egy")));
bench("world.currencies.format", () => do_not_optimize(world.currencies.format(1234.5, "EGP", "ar")));
bench("world.currencies.minor", () => do_not_optimize(world.currencies.minor(1234.56, "EGP")));
bench("world.currencies.primaryOf", () => do_not_optimize(world.currencies.primaryOf("SA")));
bench("world.languages.directionOf", () => do_not_optimize(world.languages.directionOf("ar-EG")));
bench("world.languages.scriptOf", () => do_not_optimize(world.languages.scriptOf("zh-TW")));
bench("world.emojis.browse", () => do_not_optimize(en.emojis.browse({ query: "smile", limit: 20 })));
bench("world.emojis.nameOf ar", () => do_not_optimize(ar.emojis.nameOf("😀")));
bench("world.emojisIn", () => do_not_optimize(world.emojisIn("go 🇪🇬 now 👍🏽 and 👨‍👩‍👧 ok")));
bench("world.stripEmoji", () => do_not_optimize(world.stripEmoji("go 🇪🇬 now 👍🏽 and 👨‍👩‍👧 ok")));
bench("world.emojiCode", () => do_not_optimize(world.emojiCode("👨‍👩‍👧")));
bench("world.flagEmoji", () => do_not_optimize(world.flagEmoji("EG")));
bench("world.flagFile", () => do_not_optimize(world.flagFile("eg")));
bench("world.fontFor", () => do_not_optimize(world.fontFor("ar-EG")));
bench("world.assets", () => do_not_optimize(en.assets()));

await run();
