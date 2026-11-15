from decimal import Context, Decimal, DecimalException, DivisionByZero, InvalidOperation, Overflow, ROUND_HALF_EVEN
from typing import Literal

from engine.error import Code, Fault

import re

type Locale = Literal["en", "ar"]

DIGITS   = {
    "BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
    "BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0, "KRW": 0, "PYG": 0, "RWF": 0, "UGX": 0,
    "UYI": 0, "VND": 0, "VUV": 0, "XAF": 0, "XOF": 0, "XPF": 0, "CLF": 4, "UYW": 4,
}
SYMBOLS  = {
    "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "INR": "₹", "KRW": "₩", "TRY": "₺", "NGN": "₦", "ILS": "₪",
}
ARABIC   = {
    "EGP": "ج.م", "SAR": "ر.س", "AED": "د.إ", "KWD": "د.ك", "QAR": "ر.ق", "BHD": "د.ب", "OMR": "ر.ع", "JOD": "د.أ",
    "IQD": "د.ع", "LYD": "د.ل", "MAD": "د.م", "TND": "د.ت", "DZD": "د.ج", "SDG": "ج.س", "LBP": "ل.ل", "SYP": "ل.س",
    "YER": "ر.ي",
}
CODES    = { symbol: code for code, symbol in SYMBOLS.items() } | { short: code for code, short in ARABIC.items() }
AMOUNT   = re.compile(r"[-+]?(?:\d[\d,_]*(?:\.\d+)?|\.\d+)")
ORDINALS = {
    "one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth",
    "twelve": "twelfth",
}
ROMAN    = (
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"),
    (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
)
CURRENCY = 3
THOUSAND = 1000
KIBI     = 1024
TEENS    = (10, 20)
ROMAN_MAX = 3999

ONES     = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
)
TENS     = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
SCALES   = ("", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion")
AR_ONES  = (
    "صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر",
    "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
)
AR_TENS  = ("", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون")
AR_HUNDREDS = ("", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة")
AR_SCALES   = (
    ("ألف", "ألفان", "آلاف"), ("مليون", "مليونان", "ملايين"), ("مليار", "ملياران", "مليارات"),
    ("تريليون", "تريليونان", "تريليونات"), ("كوادريليون", "كوادريليونان", "كوادريليونات"),
    ("كوينتيليون", "كوينتيليونان", "كوينتيليونات"),
)
TEEN     = 20
REACH    = 27
FLOOR    = -400
PRECISION = 34
SPELLED  = 10 ** 21
HUNDRED  = 100
FEW      = 10
PAIR     = 2

INPUT    = 4096
OUTPUT   = 100_000
PLACES   = 400
BPS      = 10_000
MAXIMUM  = 10 ** PRECISION
CONTEXT  = Context(
    prec=PRECISION, rounding=ROUND_HALF_EVEN, Emin=-999999, Emax=999999, capitals=1, clamp=0,
    flags=[], traps=[InvalidOperation, DivisionByZero, Overflow],
)

def refuse ( reason: str, value: object ) -> Fault:

    try: shown = str(value)[:64]
    except ValueError: shown = type(value).__name__

    return Fault(Code.BAD_REQUEST, "Cannot read the number", f"number.{reason}", { "value": [shown] })

def integer ( value: int, reason: str, low: int, high: int ) -> int:

    if type(value) is not int or not low <= value <= high: raise refuse(reason, value)

    return value

def read ( text: object ) -> Decimal:

    if isinstance(text, bool): raise refuse("decimal", text)
    if isinstance(text, Decimal): return bounded(text)

    if isinstance(text, int):

        if text.bit_length() > INPUT: raise refuse("range", text)

        return Decimal(text)

    raw = str(text)

    if len(raw) > INPUT: raise refuse("range", text)

    try: value = Decimal(raw.strip().replace("_", "").replace(",", ""), context=CONTEXT.copy())
    except (DecimalException, ValueError) as error: raise refuse("decimal", text) from error

    if not value.is_finite(): raise refuse("decimal", text)
    if abs(value.adjusted()) > INPUT: raise refuse("range", text)

    return value

def bounded ( value: Decimal ) -> Decimal:

    if not value.is_finite(): raise refuse("decimal", value)

    shape = value.as_tuple()

    if len(shape.digits) > INPUT or abs(value.adjusted()) > INPUT: raise refuse("range", value)

    return value

def shifted ( value: Decimal, places: int ) -> Decimal:

    shape = value.as_tuple()

    return Decimal((shape.sign, shape.digits, int(shape.exponent) + places))

def rounded ( numerator: int, denominator: int, banker: bool = False ) -> int:

    negative = (numerator < 0) != (denominator < 0)
    whole, rest = divmod(abs(numerator), abs(denominator))
    twice = rest * 2

    if twice > abs(denominator) or (twice == abs(denominator) and (not banker or whole % 2)): whole += 1

    return -whole if negative else whole

def fraction ( numerator: int, denominator: int, places: int ) -> Decimal:

    integer(places, "places", -PLACES, PLACES)

    if places >= 0: numerator *= 10 ** places
    else: denominator *= 10 ** -places

    value = rounded(numerator, denominator)

    if abs(value) >= MAXIMUM: raise refuse("range", value)

    return Decimal(f"{value}e{-places}")
