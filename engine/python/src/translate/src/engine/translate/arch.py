from collections.abc import Iterable, Mapping
from typing import Any

import re

type Catalog = Mapping[str, Any]
type Texts   = dict[str, str]
type Forms   = dict[str, str]
type Layer   = tuple[str, Texts, dict[str, Forms]]
type Chain   = tuple[Layer, ...]
type Sources = Iterable[tuple[str, object, object]]
type Homes   = dict[str, dict[str, str]]
type Span    = tuple[int, int]
type Term    = tuple[int, int, bool, tuple[Span, ...]]
type Test    = tuple[tuple[Term, ...], ...]
type Facts   = tuple[int | None, int, int, int, int, int, int, int]
type Rule    = tuple[tuple[tuple[str, Test], ...], tuple[str, ...], tuple[str, ...]]

FORMS  = ("zero", "one", "two", "few", "many", "other")
OTHER  = "other"
SLOTS  = "nivwftec"
SPAN   = 256
DIGITS = 64
DEPTH  = 16
KEPT   = 512
WANTED = 128
HEADER = 256
OFFERS = 16
ANY    = "*"
ROOT   = "catalog"
PLAIN  = (str, int, float)
UNTAGGED = "is not a language tag"
WHOLE: Rule = ((), (OTHER,) * SPAN, (OTHER,))
TAG    = re.compile(
    r"(?P<language>[A-Za-z]{2,3})(?:[-_](?P<script>[A-Za-z]{4}))?(?:[-_](?P<region>[A-Za-z]{2}|[0-9]{3}))?"
    r"(?P<rest>(?:[-_][A-Za-z0-9]{1,8}){0,4})",
)
TERM   = re.compile(r"(?P<slot>[nivwftec])(?: mod (?P<base>[0-9]+))?(?P<wanted> not)? in (?P<spans>[0-9.,]+)")

PLURALS: dict[str, dict[str, str]] = {
    (
        "af an asa az bal bem bez bg brx ce cgg chr ckb dv ee el eo eu fo fur gsw ha haw hu jgo jmc ka kaj kcg kk kkj "
        "kl ks ksb ku ky lb lg mas mgo ml mn mr nb nd ne nn nnh no nr ny nyn om or os pap ps rm rof rwk saq sd sdh seh "
        "sn so sq ss ssy st syr ta te teo tig tk tn tr ts ug uz ve vo vun wae xh xog"
    ): {
        "one" : "n in 1",
    },
    "ast de en et fi fy gl ia io ji lij nl sc sv sw ur yi": { "one": "i in 1 and v in 0" },
    "ca it lld pt-AO pt-CH pt-CV pt-GQ pt-GW pt-LU pt-MO pt-MZ pt-PT pt-ST pt-TL scn vec": {
        "one"  : "i in 1 and v in 0",
        "many" : "e in 0 and i not in 0 and i mod 1000000 in 0 and v in 0 or e not in 0..5",
    },
    "am as bn doi fa gu hi kn pcm zu": { "one": "i in 0 or n in 1" },
    "ak bho csw ln mg nso pa ti wa": { "one": "n in 0..1" },
    "iu naq sat se sma smj smn sms": { "one": "n in 1", "two": "n in 2" },
    "bs hr sh sr": {
        "one" : "v in 0 and i mod 10 in 1 and i mod 100 not in 11 or f mod 10 in 1 and f mod 100 not in 11",
        "few" : "v in 0 and i mod 10 in 2..4 and i mod 100 not in 12..14 or f mod 10 in 2..4 and f mod 100 not in "
                "12..14",
    },
    "ff hy kab": { "one": "i in 0,1" },
    "blo ksh": { "zero": "n in 0", "one": "n in 1" },
    "ceb fil tl": {
        "one" : "v in 0 and i in 1,2,3 or v in 0 and i mod 10 not in 4,6,9 or v not in 0 and f mod 10 not in 4,6,9",
    },
    "cs sk": { "one": "i in 1 and v in 0", "few": "i in 2..4 and v in 0", "many": "v not in 0" },
    "dsb hsb": {
        "one" : "v in 0 and i mod 100 in 1 or f mod 100 in 1",
        "two" : "v in 0 and i mod 100 in 2 or f mod 100 in 2",
        "few" : "v in 0 and i mod 100 in 3..4 or f mod 100 in 3..4",
    },
    "fr ht": { "one": "i in 0,1", "many": "e in 0 and i not in 0 and i mod 1000000 in 0 and v in 0 or e not in 0..5" },
    "lv prg": {
        "zero" : "n mod 10 in 0 or n mod 100 in 11..19 or v in 2 and f mod 100 in 11..19",
        "one"  : "n mod 10 in 1 and n mod 100 not in 11 or v in 2 and f mod 10 in 1 and f mod 100 not in 11 or v not "
                 "in 2 and f mod 10 in 1",
    },
    "ru uk": {
        "one"  : "v in 0 and i mod 10 in 1 and i mod 100 not in 11",
        "few"  : "v in 0 and i mod 10 in 2..4 and i mod 100 not in 12..14",
        "many" : "v in 0 and i mod 10 in 0 or v in 0 and i mod 10 in 5..9 or v in 0 and i mod 100 in 11..14",
    },
    "ar ars": {
        "zero" : "n in 0",
        "one"  : "n in 1",
        "two"  : "n in 2",
        "few"  : "n mod 100 in 3..10",
        "many" : "n mod 100 in 11..99",
    },
    "be": {
        "one"  : "n mod 10 in 1 and n mod 100 not in 11",
        "few"  : "n mod 10 in 2..4 and n mod 100 not in 12..14",
        "many" : "n mod 10 in 0 or n mod 10 in 5..9 or n mod 100 in 11..14",
    },
    "br": {
        "one"  : "n mod 10 in 1 and n mod 100 not in 11,71,91",
        "two"  : "n mod 10 in 2 and n mod 100 not in 12,72,92",
        "few"  : "n mod 10 in 3..4,9 and n mod 100 not in 10..19,70..79,90..99",
        "many" : "n not in 0 and n mod 1000000 in 0",
    },
    "cy": { "zero": "n in 0", "one": "n in 1", "two": "n in 2", "few": "n in 3", "many": "n in 6" },
    "da": { "one": "n in 1 or t not in 0 and i in 0,1" },
    "es": { "one": "n in 1", "many": "e in 0 and i not in 0 and i mod 1000000 in 0 and v in 0 or e not in 0..5" },
    "ga": { "one": "n in 1", "two": "n in 2", "few": "n in 3..6", "many": "n in 7..10" },
    "gd": { "one": "n in 1,11", "two": "n in 2,12", "few": "n in 3..10,13..19" },
    "gv": {
        "one"  : "v in 0 and i mod 10 in 1",
        "two"  : "v in 0 and i mod 10 in 2",
        "few"  : "v in 0 and i mod 100 in 0,20,40,60,80",
        "many" : "v not in 0",
    },
    "he iw": { "one": "i in 1 and v in 0 or i in 0 and v not in 0", "two": "i in 2 and v in 0" },
    "is": { "one": "t in 0 and i mod 10 in 1 and i mod 100 not in 11 or t mod 10 in 1 and t mod 100 not in 11" },
    "kw": {
        "zero" : "n in 0",
        "one"  : "n in 1",
        "two"  : "n mod 100 in 2,22,42,62,82 or n mod 1000 in 0 and n mod 100000 in 1000..20000,40000,60000,80000 or "
                 "n not in 0 and n mod 1000000 in 100000",
        "few"  : "n mod 100 in 3,23,43,63,83",
        "many" : "n not in 1 and n mod 100 in 1,21,41,61,81",
    },
    "lag": { "zero": "n in 0", "one": "i in 0,1 and n not in 0" },
    "lt": {
        "one"  : "n mod 10 in 1 and n mod 100 not in 11..19",
        "few"  : "n mod 10 in 2..9 and n mod 100 not in 11..19",
        "many" : "f not in 0",
    },
    "mk": { "one": "v in 0 and i mod 10 in 1 and i mod 100 not in 11 or f mod 10 in 1 and f mod 100 not in 11" },
    "mt": { "one": "n in 1", "two": "n in 2", "few": "n in 0 or n mod 100 in 3..10", "many": "n mod 100 in 11..19" },
    "pl": {
        "one"  : "i in 1 and v in 0",
        "few"  : "v in 0 and i mod 10 in 2..4 and i mod 100 not in 12..14",
        "many" : "v in 0 and i not in 1 and i mod 10 in 0..1 or v in 0 and i mod 10 in 5..9 or v in 0 and i mod 100 "
                 "in 12..14",
    },
    "pt": { "one": "i in 0..1", "many": "e in 0 and i not in 0 and i mod 1000000 in 0 and v in 0 or e not in 0..5" },
    "mo ro": { "one": "i in 1 and v in 0", "few": "v not in 0 or n in 0 or n not in 1 and n mod 100 in 1..19" },
    "shi": { "one": "i in 0 or n in 1", "few": "n in 2..10" },
    "si": { "one": "n in 0,1 or i in 0 and f in 1" },
    "sl": {
        "one" : "v in 0 and i mod 100 in 1",
        "two" : "v in 0 and i mod 100 in 2",
        "few" : "v in 0 and i mod 100 in 3..4 or v not in 0",
    },
    "tzm": { "one": "n in 0..1 or n in 11..99" },
}
