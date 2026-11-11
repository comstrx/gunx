from engine.date import DateTime, UTC
from engine.fake import Fake
from engine.test import Bench

bench = Bench()
made  = Fake("bench")
start = DateTime(2020, 1, 1, tzinfo=UTC)
end   = DateTime(2030, 1, 1, tzinfo=UTC)

def name () -> None: made.name()

def arabic () -> None: made.name("ar")

def username () -> None: made.username()

def email () -> None: made.email()

def phone () -> None: made.phone("EG")

def person () -> None: made.person()

def address () -> None: made.address("ar", "SA")

def company () -> None: made.company()

def money () -> None: made.money()

def card () -> None: made.card()

def iban () -> None: made.iban("SA")

def words () -> None: made.words(8)

def sentence () -> None: made.sentence()

def paragraph () -> None: made.paragraph()

def text () -> None: made.text(400)

def slug () -> None: made.slug(3)

def url () -> None: made.url()

def ip () -> None: made.ip()

def ipv6 () -> None: made.ipv6()

def mac () -> None: made.mac()

def file () -> None: made.file()

def integer () -> None: made.integer(0, 1000)

def decimal () -> None: made.decimal(0, 1000, 4)

def uuid () -> None: made.uuid()

def past () -> None: made.past(30)

def between () -> None: made.between(start, end)

def birthday () -> None: made.birthday()

def many () -> None: made.many(100, made.integer)

def unique () -> None: made.many(50, made.uuid, unique=True)

def optional () -> None: made.optional(made.word)

bench.measure("fake.name", name)
bench.measure("fake.name.arabic", arabic)
bench.measure("fake.username", username)
bench.measure("fake.email", email)
bench.measure("fake.phone", phone)
bench.measure("fake.person", person)
bench.measure("fake.address", address)
bench.measure("fake.company", company)
bench.measure("fake.money", money)
bench.measure("fake.card", card)
bench.measure("fake.iban", iban)
bench.measure("fake.words", words)
bench.measure("fake.sentence", sentence)
bench.measure("fake.paragraph", paragraph)
bench.measure("fake.text", text)
bench.measure("fake.slug", slug)
bench.measure("fake.url", url)
bench.measure("fake.ip", ip)
bench.measure("fake.ipv6", ipv6)
bench.measure("fake.mac", mac)
bench.measure("fake.file", file)
bench.measure("fake.integer", integer)
bench.measure("fake.decimal", decimal)
bench.measure("fake.uuid", uuid)
bench.measure("fake.past", past)
bench.measure("fake.between", between)
bench.measure("fake.birthday", birthday)
bench.measure("fake.many", many, 2000)
bench.measure("fake.many.unique", unique, 2000)
bench.measure("fake.optional", optional)
