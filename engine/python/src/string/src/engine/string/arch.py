from typing import Literal

import re

type Side = Literal["both", "left", "right"]

UNCOUNTABLE = frozenset({
    "equipment", "information", "rice", "money", "species", "series", "fish", "sheep", "jeans", "police", "news",
    "data", "metadata", "software", "hardware", "feedback", "advice", "aircraft", "deer", "moose", "traffic",
    "luggage", "furniture", "staff", "swine", "bison", "offspring", "wheat", "music", "evidence",
})
IRREGULAR   = {
    "person": "people", "man": "men", "woman": "women", "child": "children", "sex": "sexes", "move": "moves",
    "zombie": "zombies", "tooth": "teeth", "foot": "feet", "goose": "geese", "die": "dice", "penny": "pence",
    "criterion": "criteria", "phenomenon": "phenomena", "genus": "genera", "corpus": "corpora", "opus": "opera",
    "medium": "media", "datum": "data", "alumnus": "alumni", "syllabus": "syllabi", "radius": "radii",
    "stimulus": "stimuli", "cactus": "cacti", "focus": "foci", "fungus": "fungi", "nucleus": "nuclei",
}
INVERSE     = { many: one for one, many in IRREGULAR.items() }
PLURALS     = tuple((re.compile(pattern, re.IGNORECASE), result) for pattern, result in (
    (r"(quiz)$", r"\1zes"), (r"^(oxen)$", r"\1"), (r"^(ox)$", r"\1en"), (r"^(m|l)ice$", r"\1ice"),
    (r"^(m|l)ouse$", r"\1ice"), (r"(matr|vert|ind)(?:ix|ex)$", r"\1ices"), (r"(x|ch|ss|sh)$", r"\1es"),
    (r"([^aeiouy]|qu)y$", r"\1ies"), (r"(hive)$", r"\1s"), (r"(?:([^f])fe|([lr])f)$", r"\1\2ves"), (r"sis$", "ses"),
    (r"([ti])a$", r"\1a"), (r"([ti])um$", r"\1a"), (r"(buffal|tomat|potat|her|ech|vet|torped|embarg)o$", r"\1oes"),
    (r"(bu)s$", r"\1ses"), (r"(alias|status)$", r"\1es"), (r"(octop|vir)i$", r"\1i"), (r"(octop|vir)us$", r"\1i"),
    (r"^(ax|test)is$", r"\1es"), (r"s$", "s"), (r"$", "s"),
))
SINGULARS   = tuple((re.compile(pattern, re.IGNORECASE), result) for pattern, result in (
    (r"(database)s$", r"\1"), (r"(quiz)zes$", r"\1"), (r"(matr)ices$", r"\1ix"), (r"(vert|ind)ices$", r"\1ex"),
    (r"^(ox)en", r"\1"), (r"(alias|status)(es)?$", r"\1"), (r"(octop|vir)(us|i)$", r"\1us"), (r"^(a)x[ie]s$", r"\1xis"),
    (r"(cris|test)(is|es)$", r"\1is"), (r"(shoe)s$", r"\1"), (r"(o)es$", r"\1"), (r"(bus)(es)?$", r"\1"),
    (r"^(m|l)ice$", r"\1ouse"), (r"(x|ch|ss|sh)es$", r"\1"), (r"(m)ovies$", r"\1ovie"), (r"(s)eries$", r"\1eries"),
    (r"([^aeiouy]|qu)ies$", r"\1y"), (r"([lr])ves$", r"\1f"), (r"(tive)s$", r"\1"), (r"(hive)s$", r"\1"),
    (r"([^f])ves$", r"\1fe"), (r"(^analy)(sis|ses)$", r"\1sis"),
    (r"((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$", r"\1sis"), (r"([ti])a$", r"\1um"),
    (r"(n)ews$", r"\1ews"), (r"(ss)$", r"\1"), (r"s$", ""),
))
INFLECT_SHORT       = 4

ARABIC     = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
RTL        = re.compile(r"^[^\w]*[؀-ۿ֐-׿]")
DIACRITICS = re.compile(r"[ً-ْٰـ]")
DIGITS     = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
EASTERN    = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
SIMPLE     = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه", "ـ": None,
})
LATIN      = str.maketrans({
    "æ": "ae", "Æ": "AE", "ø": "o", "Ø": "O", "ß": "ss", "œ": "oe", "Œ": "OE", "đ": "d", "Đ": "D", "ł": "l", "Ł": "L",
    "þ": "th", "Þ": "Th", "ð": "d", "Ð": "D", "ı": "i", "ħ": "h", "Ħ": "H", "ŧ": "t", "Ŧ": "T", "ŋ": "ng", "Ŋ": "NG",
})
ROMAN      = str.maketrans({
    "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ٱ": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",
    "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
    "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "ى": "a",
    "ة": "h", "ء": "a", "ؤ": "o", "ئ": "e", "پ": "p", "چ": "ch", "ژ": "zh", "گ": "g", "ک": "k", "ی": "y", "ڤ": "v",
})

SCRIPT   = r"\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF"
SLUG     = re.compile(f"[^a-z0-9{SCRIPT}]+")
SPACES   = re.compile(r"\s+")
CAMEL    = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")
WORD     = re.compile(f"[A-Za-z0-9]+|[{SCRIPT}]+")
TOKEN    = re.compile(r"\w+")
SENTENCE = re.compile(r"(?<=[.!?؟。…])\s+")
NUMBER   = re.compile(r"[-+]?\d+(?:[.,]\d+)*")
TAG      = re.compile(r"<[^>]*>")
HTML     = (("&", "&amp;"), ("<", "&lt;"), (">", "&gt;"), ('"', "&quot;"), ("'", "&#39;"))
URLSAFE  = str.maketrans("-_", "+/")
OTHERS   = re.compile(r"[^0-9]+")
ANSI     = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
SYMBOL   = re.compile(r"[^\w\s]")
MINOR    = frozenset({
    "a", "an", "and", "as", "at", "but", "by", "for", "if", "in", "nor", "of", "off", "on", "or", "per", "so", "the",
    "to", "up", "via", "yet",
})
WPM      = 200
SHORT    = 3
WIDE     = 1 << 20
