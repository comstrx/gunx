from engine.context import context
from engine.test import Bench
from engine.translate import Plural, Translate
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
import json

bench   = Bench()
plural  = Plural()
t       = Translate(plural)
FORMS   = { "zero": "لا عناصر", "one": "عنصر واحد", "two": "عنصران", "few": "{count} عناصر", "many": "{count} عنصراً", "other": "{count} عنصر" }
english = {
    "hello"   : "Hello {name}",
    "plain"   : "Saved",
    "only"    : "English only",
    "items"   : { "one": "{count} item", "other": "{count} items" },
    "reasons" : { "auth.missing": "Sign in first", **{ f"area{number}.refused": f"Refused {number}" for number in range(200) } },
    "codes"   : { "forbidden": "Forbidden", "validation": "Check the fields" },
    "screens" : { f"screen{number}": { "title": f"Title {number}", "body": f"Body {number}", "hint": "Hint {name}" } for number in range(100) },
}
arabic  = {
    "hello"   : "أهلاً {name}",
    "plain"   : "تم الحفظ",
    "items"   : FORMS,
    "reasons" : { "auth.missing": "سجّل الدخول أولاً" },
    "codes"   : { "forbidden": "ممنوع" },
}
egypt   = { "hello": "أهلاً يا {name}", "items": { "one": "حاجة واحدة" } }
browser = "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7"
crowded = "fr-CH, fr;q=0.9, de-CH;q=0.8, de;q=0.7, it;q=0.6, es-419;q=0.5, ja;q=0.4, ko;q=0.3, zh-Hant-TW;q=0.2, ar-EG;q=0.1, en;q=0.05, *;q=0.01"
amount  = Decimal("1.50")
folder  = TemporaryDirectory()
root    = Path(folder.name)

(root / "en.json").write_text(json.dumps(english))
(root / "ar.json").write_text(json.dumps(arabic, ensure_ascii=False))
(root / "ar-EG.json").write_text(json.dumps(egypt, ensure_ascii=False))
t.load(root)

held = context.open(locale="ar-EG")

def find () -> None: t.find("plain", "ar")

def current () -> None: t.find("plain")

def params () -> None: t.text("hello", "ar", name="Ann")

def region () -> None: t.text("only", "ar-EG")

def absent () -> None: t.text("nope.at.all", "ar-EG")

def choice () -> None: t.choice("items", 11, "ar")

def completed () -> None: t.choice("items", 3, "ar-EG")

def reason () -> None: t.reason("auth.missing", "ar")

def code () -> None: t.find("forbidden", "ar", "codes")

def has () -> None: t.has("auth.missing", "ar", "reasons")

def negotiate () -> None: t.negotiate(browser)

def offered () -> None: t.negotiate(crowded)

def resolve () -> None: t.resolve("ar-SA")

def tag () -> None: t.tag("zh_hant_tw")

def small () -> None: plural.form("ar", 11)

def large () -> None: plural.form("ru", 1234567)

def real () -> None: plural.form("lv", 1.5)

def exact () -> None: plural.form("ar", amount)

def forms () -> None: plural.forms("ar")

def missing () -> None: t.missing("ar-EG", forms=True)

def catalog () -> None: t.catalog("en")

def describe () -> None: t.describe()

def extend () -> None: t.extend("ar-EG", egypt)

def setup () -> None: Translate(plural).setup({ "en": english, "ar": arabic, "ar-EG": egypt })

def load () -> None: Translate(plural).load(root)

bench.measure("translate.find", find)
bench.measure("translate.find.current", current)
bench.measure("translate.text.params", params)
bench.measure("translate.text.region", region)
bench.measure("translate.text.absent", absent)
bench.measure("translate.choice", choice)
bench.measure("translate.choice.completed", completed)
bench.measure("translate.reason", reason)
bench.measure("translate.code", code)
bench.measure("translate.has", has)
bench.measure("translate.negotiate", negotiate)
bench.measure("translate.negotiate.offered", offered)
bench.measure("translate.resolve", resolve)
bench.measure("translate.tag", tag)
bench.measure("plural.form.small", small)
bench.measure("plural.form.large", large)
bench.measure("plural.form.float", real)
bench.measure("plural.form.decimal", exact)
bench.measure("plural.forms", forms)
bench.measure("translate.missing", missing, 2000)
bench.measure("translate.catalog", catalog, 2000)
bench.measure("translate.describe", describe, 2000)
bench.measure("translate.extend", extend, 1000)
bench.measure("translate.setup", setup, 1000)
bench.measure("translate.load", load, 1000)
context.close(held)
folder.cleanup()
