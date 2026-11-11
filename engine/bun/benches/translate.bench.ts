import * as error from "engine/error";
import * as translate from "engine/translate";
import { bench, do_not_optimize, run } from "mitata";

const en = translate.dictionary(
    {
        en: { hello: "Hello {name}", plain: "Hello", items: "no items|one item|{count} items", tabs: { one: "{count} tab", other: "{count} tabs" }, codes: { not_found: "Not here" }, validation: { min_length: "{field} needs {value} characters" }, fields: { email: "E-mail" } },
        ar: { hello: "أهلاً {name}" },
    },
    "en",
);
const ar = en.use("ar");
const routing: translate.Routing = { locales: ["ar", "en", "fr-FR"], default: "ar" };
const supported = ["en", "ar-EG"];
const missed = error.fault("not_found", "cart.empty");
const invalid = error.fault("validation", "r", { errors: { email: ["min_length:8"] } });
const names = ["a", "b", "c"];

bench("translate.t", () => do_not_optimize(en.t("hello", { name: "Ann" })));
bench("translate.t.plain", () => do_not_optimize(en.t("plain")));
bench("translate.t.plural", () => do_not_optimize(en.t("items", {}, 5)));
bench("translate.t.leaf", () => do_not_optimize(en.t("tabs", {}, 5)));
bench("translate.t.fallback", () => do_not_optimize(ar.t("items", {}, 5)));
bench("translate.t.miss", () => do_not_optimize(en.t("nope.at.all")));
bench("translate.find", () => do_not_optimize(en.find("hello", { name: "Ann" })));
bench("translate.has", () => do_not_optimize(ar.has("codes.not_found")));
bench("translate.interpolate", () => do_not_optimize(translate.interpolate("Hello {name}, :count new", { name: "Ann", count: 3 })));
bench("translate.plural", () => do_not_optimize(translate.plural("no items|one item|{count} items", 5, "en")));
bench("translate.negotiate", () => do_not_optimize(translate.negotiate("fr-CH, ar;q=0.8, en;q=0.9", supported, "en")));
bench("translate.split", () => do_not_optimize(translate.split("zh-Hant-TW")));
bench("translate.direction", () => do_not_optimize(translate.direction("ar-EG")));
bench("translate.localeOfPath", () => do_not_optimize(translate.localeOfPath("/en/orders/7", routing)));
bench("translate.routeOf", () => do_not_optimize(translate.routeOf("/en/orders/7", "fr-FR", routing)));
bench("translate.languageName", () => do_not_optimize(translate.languageName("ar", "en")));
bench("translate.isTimeZone", () => do_not_optimize(translate.isTimeZone("Africa/Cairo")));
bench("translate.formatList", () => do_not_optimize(translate.formatList(names, "en")));
bench("translate.formatNumber", () => do_not_optimize(translate.formatNumber(1234.5, "ar-EG")));
bench("translate.formatRange", () => do_not_optimize(translate.formatRange("2026-03-01", "2026-03-05", "en")));
bench("translate.reason", () => do_not_optimize(translate.reason(missed, en)));
bench("translate.field", () => do_not_optimize(translate.field(invalid, "email", en)));

await run();
