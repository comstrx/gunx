from engine.string import string
from engine.test import Bench

bench    = Bench()
haystack = ("lorem ipsum dolor sit amet " * 400).encode()
markup   = "<p>Hello&nbsp;<b>big</b> &amp; <i>wide</i> world</p>" * 8
article  = "The quick brown fox jumps over the lazy dog. " * 40
encoded  = string.base64("engine:" + "s" * 48)
swaps    = { "quick": "slow", "brown": "red", "lazy": "eager", "dog": "cat" }

def find () -> None: string.find(haystack, b"amet lorem", 5000)

def slug () -> None: string.slug("Hello, World! أهلاً 2024")

def fold () -> None: string.fold("Crème Brûlée مَرْحَبًا")

def snake () -> None: string.snake("engineHttpRequestBinder")

def plural () -> None: string.plural("category")

def transliterate () -> None: string.transliterate("محمد عبد الرحمن ٢٠٢٤")

def escape () -> None: string.escape(markup)

def plain () -> None: string.plain(markup)

def like () -> None: string.like("orders.placed.eu.west", "orders.*.eu.*")

def mask () -> None: string.mask("4111111111111111", 4)

def excerpt () -> None: string.excerpt(article, "LAZY", 24)

def replace_many () -> None: string.replace_many(article, swaps)

def unbase64 () -> None: string.unbase64(encoded)

def ratio () -> None: string.ratio("Abdulrahman Yasser", "abdelrahman yaser")

def chain () -> None: string.of("  Hello, Big World!  ").squish().slug().get()

bench.measure("string.find", find)
bench.measure("string.slug", slug)
bench.measure("string.fold", fold)
bench.measure("string.snake", snake)
bench.measure("string.plural", plural)
bench.measure("string.transliterate", transliterate)
bench.measure("string.escape", escape)
bench.measure("string.plain", plain)
bench.measure("string.like", like)
bench.measure("string.mask", mask)
bench.measure("string.excerpt", excerpt)
bench.measure("string.replace_many", replace_many)
bench.measure("string.unbase64", unbase64)
bench.measure("string.ratio", ratio)
bench.measure("string.of.chain", chain)
