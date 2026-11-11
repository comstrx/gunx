from typing import Literal

import re

type Locale = Literal["en", "ar"]

DIGITS   = {
    "BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
    "JPY": 0, "KRW": 0, "VND": 0, "CLP": 0, "ISK": 0, "UGX": 0,
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
