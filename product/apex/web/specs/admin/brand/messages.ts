export const messages = {
    ar: {
        nav: {
            menu: "القائمة", theme: "الثيم", language: "English", system: "النظام", light: "فاتح", dark: "داكن",
            denied: "هذه الصفحة خارج صلاحياتك", deniedHint: "اطلب الصلاحية من مسؤول الحساب، أو ارجع إلى صفحة متاحة لك.", confirm: "تأكيد", yes: "نعم", no: "لا",
            stale: "نسخة أحدث من التطبيق مفتوحة", staleHint: "حدّث الصفحة لتُحفظ تفضيلاتك مع النسخة الأحدث.", later: "لاحقاً", reload: "تحديث",
        },
        hello: {
            eyebrow: "مرحباً من أكمي",
            loading: "جارٍ تحضير التحية",
            failed: "تعذّر الوصول إلى الخدمة",
            hint: "تأكّد من تشغيل البوابة ثم أعد المحاولة.",
            refresh: "تحية جديدة",
            retry: "أعد المحاولة",
            switch: "English",
        },
    },
    en: {
        nav: {
            menu: "Menu", theme: "Theme", language: "العربية", system: "System", light: "Light", dark: "Dark",
            denied: "This page is outside your access", deniedHint: "Ask an account owner for access, or go back to a page you can open.", confirm: "Confirmation", yes: "Yes", no: "No",
            stale: "A newer version of the app is open", staleHint: "Reload so your preferences save with the newer version.", later: "Later", reload: "Reload",
        },
        hello: {
            eyebrow: "Hello from Acme",
            loading: "Preparing the greeting",
            failed: "The service is unreachable",
            hint: "Make sure the gateway is running, then try again.",
            refresh: "New greeting",
            retry: "Try again",
            switch: "العربية",
        },
    },
} as const;
