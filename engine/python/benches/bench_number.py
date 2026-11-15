from engine.number import Money, number
from engine.test import Bench

bench = Bench()
price = number.money("1499.99", "EGP")
cart  = [number.money(str(index) + ".25", "EGP") for index in range(1, 41)]

def decimal () -> None: number.decimal("1234.5678", 2)

def money () -> None: number.money("1499.99", "EGP")

def parse () -> None: number.parse_money("EGP 1,499.99")

def tax () -> None: number.tax(price, 1400)

def total () -> None: number.total(cart)

def currency () -> None: number.currency(price, "ar")

def spell () -> None: number.spell(1_234_567, "ar")

def compact () -> None: number.compact(1_234_567)

def roman () -> None: number.roman(1994)

bench.measure("number.decimal", decimal)
bench.measure("number.money", money)
bench.measure("number.parse_money", parse)
bench.measure("number.tax", tax)
bench.measure("number.total", total)
bench.measure("number.currency", currency)
bench.measure("number.spell", spell)
bench.measure("number.compact", compact)
bench.measure("number.roman", roman)

bench.measure("number.from_roman", lambda: number.from_roman("MMMDCCCLXXXVIII"))

bench.measure("number.major", price.major)
bench.measure("number.multiply", lambda: price.multiply("1.25"))
bench.measure("number.percent", lambda: number.percent(7, 13))
bench.measure("number.divide", lambda: number.divide(7, 13, places=4))
bench.measure("number.split", lambda: price.split(7))
bench.measure("number.allocate.exact", lambda: Money(10000, "USD").allocate([70, 20, 10]))
bench.measure("number.allocate.remainder", lambda: price.allocate([1, 2, 3, 4]))
bench.measure("number.total.iterable", lambda: number.total(iter(cart)))
bench.measure("number.round_to", lambda: number.round_to("123.456", "0.05"))
bench.measure("number.trim", lambda: number.trim("1234.567800"))

bench.measure("number.clamp", lambda: number.clamp(7, 0, 10))
bench.measure("number.sign", lambda: number.sign(-7))

held = number.money("123.45", "USD")
bench.measure("number.exchange", lambda: number.exchange(held, "KWD", "0.3071"))

bench.measure("number.money.text", lambda: number.minor(-123456789, "KWD").text())

bench.measure("number.exact80", lambda: number.exact(10 ** 80 + 1))
