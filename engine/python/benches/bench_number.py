from engine.number import number
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
