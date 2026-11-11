from collections.abc import Mapping
from dataclasses import dataclass
import string

@dataclass(frozen=True, slots=True)
class Country:

    code     : str
    dial     : str
    mobile   : tuple[str, ...]
    digits   : int
    currency : str
    bank     : tuple[int, int]
    names    : Mapping[str, str]
    cities   : Mapping[str, tuple[str, ...]]
    spots    : tuple[tuple[float, float], ...]

LOCALES = ("en", "ar")
GENDERS = ("male", "female")
FIRST   = {
    "en": {
        "male": (
            "Adam", "Omar", "Yusuf", "Karim", "Ali", "Zain", "Khaled", "Tarek", "Samir", "Ibrahim", "Mostafa", "Faisal",
        ),
        "female": (
            "Sara", "Lina", "Maya", "Nour", "Hana", "Layla", "Mariam", "Salma", "Farah", "Dina", "Rana", "Huda",
        ),
    },
    "ar": {
        "male"   : ("آدم", "عمر", "يوسف", "كريم", "علي", "زين", "خالد", "طارق", "سمير", "إبراهيم", "مصطفى", "فيصل"),
        "female" : ("سارة", "لينا", "مايا", "نور", "هنا", "ليلى", "مريم", "سلمى", "فرح", "دينا", "رنا", "هدى"),
    },
}
LAST = {
    "en": (
        "Hassan", "Saleh", "Mansour", "Farid", "Nasser", "Rashid", "Khalil", "Said", "Amin", "Tahir", "Younis",
        "Darwish", "Sabry", "Fahmy", "Aziz", "Hamdan",
    ),
    "ar": (
        "حسن", "صالح", "منصور", "فريد", "ناصر", "راشد", "خليل", "سعيد", "أمين", "طاهر", "يونس", "درويش", "صبري", "فهمي",
        "عزيز", "حمدان",
    ),
}
STREETS = {
    "en": (
        "Corniche Rd", "Palm St", "University St", "Airport Rd", "Market St", "Garden St", "Station Rd", "Harbor St",
    ),
    "ar": (
        "طريق الكورنيش", "شارع النخيل", "شارع الجامعة", "طريق المطار", "شارع السوق", "شارع الحدائق", "طريق المحطة",
        "شارع الميناء",
    ),
}
PRODUCTS = {
    "en": (
        "Cotton Shirt", "Leather Bag", "Wireless Charger", "Olive Oil", "Running Shoes", "Desk Lamp", "Green Tea",
        "Wool Scarf", "Ceramic Mug", "Date Syrup", "Travel Backpack", "Oud Perfume",
    ),
    "ar": (
        "قميص قطن", "حقيبة جلد", "شاحن لاسلكي", "زيت زيتون", "حذاء رياضي", "مصباح مكتب", "شاي أخضر", "وشاح صوف",
        "كوب خزف", "دبس تمر", "حقيبة سفر", "عطر عود",
    ),
}
WORDS = {
    "en": (
        "fast", "clean", "simple", "strong", "quiet", "bright", "local", "fresh", "smart", "warm", "open", "clear",
        "light", "solid", "calm", "sharp", "steady", "modern", "classic", "natural", "golden", "silver", "royal",
        "prime", "urban", "rapid", "gentle", "bold", "pure", "noble", "vivid", "lively",
    ),
    "ar": (
        "سريع", "نظيف", "بسيط", "قوي", "هادئ", "مشرق", "محلي", "طازج", "ذكي", "دافئ", "مفتوح", "واضح", "خفيف", "متين",
        "ساكن", "حاد", "ثابت", "عصري", "أصيل", "طبيعي", "ذهبي", "فضي", "ملكي", "ممتاز", "حضري", "عاجل", "لطيف", "جريء",
        "نقي", "نبيل", "زاهي", "حيوي",
    ),
}
JOBS = {
    "en": (
        "Engineer", "Accountant", "Designer", "Teacher", "Pharmacist", "Driver", "Chef", "Nurse", "Lawyer", "Analyst",
        "Merchant", "Technician",
    ),
    "ar": ("مهندس", "محاسب", "مصمم", "معلم", "صيدلي", "سائق", "طاهٍ", "ممرض", "محامٍ", "محلل", "تاجر", "فني"),
}
HEADS = {
    "en": ("Delta", "Oasis", "Summit", "Horizon", "Crescent", "Atlas", "Falcon", "Pearl", "Cedar", "Zenith"),
    "ar": ("الدلتا", "الواحة", "القمة", "الأفق", "الهلال", "أطلس", "الصقر", "اللؤلؤة", "الأرز", "الذروة"),
}
TAILS = {
    "en": ("Trading", "Logistics", "Foods", "Technologies", "Holdings", "Contracting", "Pharma", "Textiles"),
    "ar": ("للتجارة", "للنقل", "للأغذية", "للتقنية", "القابضة", "للمقاولات", "للأدوية", "للمنسوجات"),
}
COUNTRIES = (
    Country(
        "EG", "20", ("10", "11", "12", "15"), 8, "EGP", (0, 25), { "en": "Egypt", "ar": "مصر" },
        { "en": ("Cairo", "Alexandria", "Giza", "Mansoura"), "ar": ("القاهرة", "الإسكندرية", "الجيزة", "المنصورة") },
        ((30.0444, 31.2357), (31.2001, 29.9187), (30.0131, 31.2089), (31.0409, 31.3785)),
    ),
    Country(
        "SA", "966", ("50", "53", "54", "55", "56", "58", "59"), 7, "SAR", (0, 20),
        { "en": "Saudi Arabia", "ar": "السعودية" },
        { "en": ("Riyadh", "Jeddah", "Dammam", "Medina"), "ar": ("الرياض", "جدة", "الدمام", "المدينة المنورة") },
        ((24.7136, 46.6753), (21.4858, 39.1925), (26.4207, 50.0888), (24.5247, 39.5692)),
    ),
    Country(
        "AE", "971", ("50", "52", "54", "55", "56", "58"), 7, "AED", (0, 19),
        { "en": "United Arab Emirates", "ar": "الإمارات" },
        { "en": ("Dubai", "Abu Dhabi", "Sharjah"), "ar": ("دبي", "أبوظبي", "الشارقة") },
        ((25.2048, 55.2708), (24.4539, 54.3773), (25.3463, 55.4209)),
    ),
    Country(
        "QA", "974", ("33", "55", "66", "77"), 6, "QAR", (4, 21), { "en": "Qatar", "ar": "قطر" },
        { "en": ("Doha", "Al Wakrah"), "ar": ("الدوحة", "الوكرة") },
        ((25.2854, 51.5310), (25.1659, 51.5976)),
    ),
    Country(
        "JO", "962", ("77", "78", "79"), 7, "JOD", (4, 22), { "en": "Jordan", "ar": "الأردن" },
        { "en": ("Amman", "Irbid", "Aqaba"), "ar": ("عمّان", "إربد", "العقبة") },
        ((31.9539, 35.9106), (32.5556, 35.8500), (29.5321, 35.0063)),
    ),
    Country(
        "OM", "968", ("92", "95", "96", "99"), 6, "OMR", (0, 19), { "en": "Oman", "ar": "عُمان" },
        { "en": ("Muscat", "Salalah"), "ar": ("مسقط", "صلالة") },
        ((23.5880, 58.3829), (17.0151, 54.0924)),
    ),
    Country(
        "KW", "965", ("50", "55", "60", "66", "90", "99"), 6, "KWD", (4, 22), { "en": "Kuwait", "ar": "الكويت" },
        { "en": ("Kuwait City", "Hawalli"), "ar": ("مدينة الكويت", "حولي") },
        ((29.3759, 47.9774), (29.3328, 48.0286)),
    ),
    Country(
        "BH", "973", ("33", "34", "36", "39"), 6, "BHD", (4, 14), { "en": "Bahrain", "ar": "البحرين" },
        { "en": ("Manama", "Riffa"), "ar": ("المنامة", "الرفاع") },
        ((26.2285, 50.5860), (26.1300, 50.5550)),
    ),
)
LANDS      = { country.code: country for country in COUNTRIES }
CURRENCIES = (*(country.currency for country in COUNTRIES), "USD", "EUR")
DOMAINS    = ("example.com", "example.net", "example.org")
NETS       = ("192.0.2", "198.51.100", "203.0.113")
PREFIX     = 0x20010DB8 << 96
CARDS      = (
    "4242424242424242", "4000056655665556", "4111111111111111", "5555555555554444", "2223003122003222",
    "5200828282828210", "5105105105105100", "378282246310005", "371449635398431", "6011111111111117",
    "6011000990139424", "3056930009020004", "36227206271667", "3566002020360505", "6200000000000005",
)
BLINK      = "AppleWebKit/537.36 (KHTML, like Gecko)"
WEBKIT     = "AppleWebKit/605.1.15 (KHTML, like Gecko)"
AGENTS     = (
    f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) {BLINK} Chrome/141.0.0.0 Safari/537.36",
    f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) {WEBKIT} Version/26.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
    f"Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) {WEBKIT} Mobile/15E148",
    f"Mozilla/5.0 (Linux; Android 16; Pixel 10) {BLINK} Chrome/141.0.0.0 Mobile Safari/537.36",
)
EXTENSIONS = ("pdf", "png", "jpg", "csv", "txt", "docx", "xlsx", "zip", "mp4", "json")
DIGITS     = string.digits
UPPER      = string.ascii_uppercase
DAY        = 86400
DRIFT      = 0.05
WORD       = 64
HANDLE     = 32
EXTENSION  = 8
COUNT      = 1000
MANY       = 100_000
TRIES      = 32
DAYS       = 36_500
TEXT       = 65_536
PLACES     = 12
SPAN       = 10 ** 15
AGE        = 120
