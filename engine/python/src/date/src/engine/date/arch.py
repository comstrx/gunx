
from datetime import UTC, datetime as DateTime, timedelta as TimeDelta
import re

ISO     = "%Y-%m-%dT%H:%M:%S.%f%z"
LIMIT   = 64
SOON    = 10
TWO     = 2
FEW     = 10
MONTHS  = 12
HOURS   = 24
MINUTES = 60
QUARTER = 3
WEEK    = 7
SECONDS = { "seconds": 1.0, "minutes": 60.0, "hours": 3600.0, "days": 86400.0, "weeks": 604800.0 }
UNITS   = (
    ("year", 31536000), ("month", 2592000), ("week", 604800), ("day", 86400), ("hour", 3600), ("minute", 60),
    ("second", 1),
)
SHORT   = { "year": "y", "month": "mo", "week": "w", "day": "d", "hour": "h", "minute": "m", "second": "s" }
ARABIC  = {
    "year"   : ("سنة", "سنتين", "سنوات"),
    "month"  : ("شهر", "شهرين", "شهور"),
    "week"   : ("أسبوع", "أسبوعين", "أسابيع"),
    "day"    : ("يوم", "يومين", "أيام"),
    "hour"   : ("ساعة", "ساعتين", "ساعات"),
    "minute" : ("دقيقة", "دقيقتين", "دقائق"),
    "second" : ("ثانية", "ثانيتين", "ثواني"),
}
MONTH_NAMES = (
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
)
DAY_NAMES   = ("الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد")
WEEKEND     = (5, 6)

FORMATS  = (
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d",
    "%m/%d/%Y", "%Y%m%d", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y", "%d.%m.%Y",
)
DAYS     = {
    "now": None, "today": 0, "tomorrow": 1, "yesterday": -1, "الآن": None, "الان": None, "اليوم": 0, "النهارده": 0,
    "النهاردة": 0, "غدا": 1, "غداً": 1, "بكرة": 1, "بكره": 1, "أمس": -1, "امس": -1, "امبارح": -1, "إمبارح": -1,
}
ENGLISH  = {
    "seconds": ("second", "seconds", "sec", "secs", "s"),
    "minutes": ("minute", "minutes", "min", "mins", "m"),
    "hours"  : ("hour", "hours", "hr", "hrs", "h"),
    "days"   : ("day", "days", "d"),
    "weeks"  : ("week", "weeks", "w"),
    "months" : ("month", "months", "mo"),
    "years"  : ("year", "years", "yr", "yrs", "y"),
}
WORDS_ARABIC   = {
    "seconds": ("ثانية", "ثانيه", "ثواني", "ثوان"),
    "minutes": ("دقيقة", "دقيقه", "دقائق"),
    "hours"  : ("ساعة", "ساعه", "ساعات"),
    "days"   : ("يوم", "أيام", "ايام"),
    "weeks"  : ("أسبوع", "اسبوع", "أسابيع", "اسابيع"),
    "months" : ("شهر", "شهور", "أشهر", "اشهر"),
    "years"  : ("سنة", "سنه", "سنوات", "سنين", "عام", "أعوام", "اعوام"),
}
DUAL     = {
    "ثانيتين": "seconds", "دقيقتين": "minutes", "ساعتين": "hours", "يومين": "days", "أسبوعين": "weeks",
    "اسبوعين": "weeks", "شهرين": "months", "سنتين": "years", "عامين": "years",
}
WORDS_UNITS    = {
    **{ word: (unit, 1) for unit, words in (*ENGLISH.items(), *WORDS_ARABIC.items()) for word in words },
    **{ word: (unit, 2) for word, unit in DUAL.items() },
}
NEXT     = frozenset({ "next", "coming", "القادم", "القادمة", "الجاي", "الجاية", "المقبل", "المقبلة" })
LAST     = frozenset({ "last", "past", "الماضي", "الماضية", "السابق", "السابقة", "الفائت", "فات" })
FORWARD  = frozenset({ "in", "after", "بعد" }) | NEXT
BACKWARD = frozenset({ "ago", "before", "منذ", "قبل", "من" }) | LAST
ONES     = {
    "a": 1, "an": 1, "one": 1, "واحد": 1, "واحدة": 1, "two": 2, "اثنين": 2, "اثنان": 2, "three": 3, "ثلاث": 3,
    "ثلاثة": 3,
}
FILLER   = frozenset({ "from", "now", "the", "اللي", "الذي", "و" })
GLUED    = re.compile(r"(\d)([^\d\s])")
CLOCK    = re.compile(r"\s*(?:at|الساعة|الساعه)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?\s*$", re.IGNORECASE)
EPOCH_MS = 1e12
NOON     = 12
CLOCKED  = 3
COMPACT  = { 8: "%Y%m%d", 14: "%Y%m%d%H%M%S" }
ENDLESS  = float("inf")
EPOCH    = DateTime(1970, 1, 1, tzinfo=UTC)
END      = DateTime.max.replace(tzinfo=UTC)
MILLI    = TimeDelta(milliseconds=1)
MICRO    = TimeDelta(microseconds=1)
DIRECTIVE = re.compile(r"%[%AaBbp]")
STEPS    = {
    "minute": { "minutes": 1 }, "hour": { "hours": 1 }, "day": { "days": 1 }, "week": { "weeks": 1 },
    "month": { "months": 1 }, "quarter": { "months": QUARTER }, "year": { "years": 1 },
}
