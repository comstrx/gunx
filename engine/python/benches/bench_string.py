from engine.string import string
from engine.test import Bench
from functools import partial

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

for size in (32, 180, 1024, 65536):

    data = b"a" * size + b"needle"

    bench.measure(f"string.find.bytes.{size}", partial(string.find, data, b"needle"))

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


bench.measure("string.shorten.prefix", lambda: string.shorten(article, 2))
bench.measure("string.reverse.ascii", lambda: string.reverse(article))
bench.measure("string.starts", lambda: string.starts("document.txt", "bad", "no", "doc"))
bench.measure("string.ends", lambda: string.ends("document.txt", ".png", ".zip", ".txt"))

affixes = ("a",) * 1000
bench.measure("string.starts.first1000", lambda: string.starts("alphabet", *affixes), rounds=5000)

replacement_text = "abc ab a untouched " * 1000

bench.measure("string.replace_many.long", lambda: string.replace_many(replacement_text, { "abc": "x", "ab": "y", "a": "z" }), rounds=500)

large_suffix = "<short>" + "x" * (1 << 20)
bench.measure("string.between.long_suffix", lambda: string.between(large_suffix, "<", ">"), rounds=5000)

choices = [f"Crème document {index:04d}" for index in range(1000)]
prose   = "one two three four " * 10000

bench.measure("string.substr.negative", lambda: string.substr("abcdef", -2, 1))
bench.measure("string.splice.negative", lambda: string.splice("abcdef", "X", -2, 1))
bench.measure("string.matches.optional", lambda: string.matches("ab b ab b", "(a)?(b)"))
bench.measure("string.replace_many.single", lambda: string.replace_many(article, { "quick": "slow" }))
bench.measure("string.closest.first", lambda: string.closest(choices[0], choices), rounds=1000)
bench.measure("string.closest.last", lambda: string.closest(choices[-1], choices), rounds=50)
bench.measure("string.closest.cutoff", lambda: string.closest("completely absent", choices, floor=0.95), rounds=50)
bench.measure("string.rank.top5", lambda: string.rank("creme document", choices), rounds=50)
bench.measure("string.rank.cutoff", lambda: string.rank("missing", choices, floor=0.95), rounds=50)
bench.measure("string.word_count.large", lambda: string.word_count(prose), rounds=100)
bench.measure("string.initials.large", lambda: string.initials(prose), rounds=100)
bench.measure("string.direction.leading_digits", lambda: string.direction("123 مرحبا"))

long_slug = "hello world " * 10000
long_word = "x" * 100000
marked    = "e" + "\u0301" * 20000

bench.measure("string.slug.long", lambda: string.slug(long_slug), rounds=500)
bench.measure("string.slug.long_word", lambda: string.slug(long_word), rounds=500)
bench.measure("string.reverse.combining", lambda: string.reverse(marked), rounds=500)
bench.measure("string.reverse.emoji", lambda: string.reverse("a👩🏽‍💻b🇪🇬"), rounds=5000)
bench.measure("string.fold.compatibility", lambda: string.fold("\uff28\uff45\uff4c\uff4c\uff4f \uff11\uff12\uff13"), rounds=5000)

spaces = "  alpha\t beta\n gamma\u2003delta  " * 1000
chars  = { "a": "alpha", "b": "", " ": "_" }

bench.measure("string.squish.short", lambda: string.squish("  alpha\t beta\n gamma  "))
bench.measure("string.squish.large", lambda: string.squish(spaces), rounds=500)
bench.measure("string.replace_many.chars", lambda: string.replace_many(spaces, chars), rounds=500)
bench.measure("string.graphemes", lambda: list(string.graphemes("a👩🏽‍💻b🇪🇬")), rounds=5000)
bench.measure("string.truncate.graphemes", lambda: string.truncate("a👩🏽‍💻b🇪🇬", 3, graphemes=True), rounds=5000)
bench.measure("string.truncate.prefix", lambda: string.truncate(prose, 10, graphemes=True), rounds=5000)
bench.measure("string.test.full", lambda: string.test("item-123", r"item-\d+", full=True))

large_pad = "ab" * 1000
large_clusters = "👩🏽‍💻" * 10000

bench.measure("string.pad.short", lambda: string.pad("word", 32, "ab"))
bench.measure("string.pad.large", lambda: string.pad("word", 1000000, large_pad), rounds=100)
bench.measure("string.truncate.large_clusters", lambda: string.truncate(large_clusters, 5000, graphemes=True), rounds=100)

bench.measure("string.template.nested", lambda: string.template("Hi {user.name}", {"user": {"name": "Ada"}}))

bench.measure("string.split.many", lambda: string.split(" a , b , , c ," * 1000), rounds=500)

base64_bytes = bytes(range(256)) * 256
base64_url = string.base64(base64_bytes, url=True)

bench.measure("string.base64.url.64k", lambda: string.base64(base64_bytes, url=True), rounds=500)
bench.measure("string.unbase64.canonical.64k", lambda: string.unbase64(base64_url, url=True, canonical=True), rounds=500)
