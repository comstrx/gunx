export type Locale = "ar" | "en";
export type Country = "EG" | "SA" | "AE" | "KW" | "QA" | "JO";
export type Pool = {
    first: readonly string[];
    last: readonly string[];
    city: readonly string[];
    street: readonly string[];
    company: readonly string[];
    words: readonly string[];
    goods: readonly string[];
    traits: readonly string[];
};
export type Plan = { dial: string; heads: readonly string[]; rest: number };

export const pools: Readonly<Record<Locale, Pool>> = {
    en: {
        first: ["Adam", "Ann", "Omar", "Lina", "Sara", "Yusuf", "Mona", "Karim", "Hana", "Ali", "Nour", "Tarek", "Dina", "Hassan", "Laila", "Sami", "Farah", "Ziad", "Reem", "Khaled", "Salma", "Mazen", "Yara", "Bilal"],
        last: ["Hassan", "Youssef", "Ibrahim", "Mansour", "Farid", "Saleh", "Khalil", "Nasser", "Rashid", "Zaki", "Fahmy", "Amin", "Haddad", "Sabry", "Darwish", "Qasim"],
        city: ["Cairo", "Giza", "Alexandria", "Mansoura", "Riyadh", "Jeddah", "Dammam", "Dubai", "Abu Dhabi", "Doha", "Amman", "Beirut", "Kuwait City", "Muscat"],
        street: ["Nile", "Palm", "Olive", "Market", "Garden", "Harbor", "Station", "Cedar", "Rose", "Union"],
        company: ["Trading", "Logistics", "Foods", "Textiles", "Pharma", "Tech", "Motors", "Holdings", "Studios", "Crafts"],
        words: [
            "order", "market", "fresh", "quick", "safe", "bright", "simple", "local", "daily", "trusted", "smart", "clear", "open", "green", "warm", "soft", "value", "plan", "route", "stock",
            "store", "basket", "offer", "season", "family", "garden", "city", "river", "table", "light", "story", "gift",
        ],
        goods: ["Coffee", "Tea", "Honey", "Dates", "Olive Oil", "Rice", "Soap", "Candle", "Notebook", "Backpack", "Lamp", "Blanket", "Headphones", "Charger", "Perfume", "Sandals"],
        traits: ["Classic", "Organic", "Premium", "Handmade", "Compact", "Golden", "Everyday", "Royal", "Fresh", "Smart"],
    },
    ar: {
        first: ["آدم", "آية", "عمر", "لينا", "سارة", "يوسف", "منى", "كريم", "هنا", "علي", "نور", "طارق", "دينا", "حسن", "ليلى", "سامي", "فرح", "زياد", "ريم", "خالد", "سلمى", "مازن", "يارا", "بلال"],
        last: ["حسن", "يوسف", "إبراهيم", "منصور", "فريد", "صالح", "خليل", "ناصر", "راشد", "زكي", "فهمي", "أمين", "حداد", "صبري", "درويش", "قاسم"],
        city: ["القاهرة", "الجيزة", "الإسكندرية", "المنصورة", "الرياض", "جدة", "الدمام", "دبي", "أبوظبي", "الدوحة", "عمّان", "بيروت", "الكويت", "مسقط"],
        street: ["النيل", "النخيل", "الزيتون", "السوق", "الحديقة", "الميناء", "المحطة", "الأرز", "الورد", "الاتحاد"],
        company: ["للتجارة", "للنقل", "للأغذية", "للمنسوجات", "للأدوية", "للتقنية", "للسيارات", "القابضة", "للإنتاج", "للحرف"],
        words: [
            "طلب", "سوق", "طازج", "سريع", "آمن", "مشرق", "بسيط", "محلي", "يومي", "موثوق", "ذكي", "واضح", "مفتوح", "أخضر", "دافئ", "ناعم", "قيمة", "خطة", "مسار", "مخزون",
            "متجر", "سلة", "عرض", "موسم", "عائلة", "حديقة", "مدينة", "نهر", "طاولة", "ضوء", "حكاية", "هدية",
        ],
        goods: ["قهوة", "شاي", "عسل", "تمر", "زيت زيتون", "أرز", "صابون", "شمعة", "دفتر", "حقيبة", "مصباح", "بطانية", "سماعات", "شاحن", "عطر", "صندل"],
        traits: ["كلاسيكي", "عضوي", "فاخر", "يدوي", "صغير", "ذهبي", "يومي", "ملكي", "طازج", "ذكي"],
    },
};
export const plans: Readonly<Record<Country, Plan>> = {
    EG: { dial: "20", heads: ["10", "11", "12", "15"], rest: 8 },
    SA: { dial: "966", heads: ["50", "53", "54", "55", "56", "58", "59"], rest: 7 },
    AE: { dial: "971", heads: ["50", "52", "54", "55", "56", "58"], rest: 7 },
    KW: { dial: "965", heads: ["5", "6", "9"], rest: 7 },
    QA: { dial: "974", heads: ["33", "55", "66", "77"], rest: 6 },
    JO: { dial: "962", heads: ["77", "78", "79"], rest: 7 },
};
export const domains: readonly string[] = ["example.com", "example.net", "example.org", "mail.test", "shop.test"];
export const statuses = ["pending", "active", "paused", "done", "failed"] as const;
export const zones: readonly string[] = ["Africa/Cairo", "Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Asia/Qatar", "Asia/Amman", "Europe/London", "Europe/Berlin", "America/New_York", "UTC"];
export const locales: readonly string[] = ["ar", "en", "ar-EG", "ar-SA", "en-US", "en-GB", "fr", "de", "tr"];
export const coins: readonly string[] = ["EGP", "SAR", "AED", "QAR", "USD", "EUR", "GBP"];
export const files: readonly (readonly [string, string])[] = [["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["pdf", "application/pdf"], ["csv", "text/csv"], ["txt", "text/plain"]];
export const nets: readonly string[] = ["192.0.2", "198.51.100", "203.0.113"];
export const fallback = {
    countries: ["EG", "SA", "AE", "QA", "KW", "JO", "MA", "US", "GB", "DE", "FR", "TR"],
    currencies: ["EGP", "SAR", "AED", "QAR", "KWD", "USD", "EUR", "GBP"],
    languages: ["ar", "en", "fr", "de", "tr", "ur"],
    emoji: ["😀", "🎉", "🚀", "✅", "📦", "🛒", "💡", "🔥"],
} as const;
