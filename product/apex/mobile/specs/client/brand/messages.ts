export const messages = {
    ar: {
        nav: {
            menu: "القائمة", theme: "الثيم", language: "English", system: "النظام", light: "فاتح", dark: "داكن",
            denied: "هذه الصفحة خارج صلاحياتك", deniedHint: "اطلب الصلاحية من مسؤول الحساب، أو ارجع إلى صفحة متاحة لك.", confirm: "تأكيد", yes: "نعم", no: "لا",
            stale: "تفضيلاتك محفوظة بنسخة أحدث من التطبيق", staleHint: "حدّث التطبيق لتستعيدها؛ وحتى ذلك الحين لن تُحفظ تغييراتك هنا.", later: "لاحقاً", reload: "تحقّق مجدداً",
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
            stale: "Your preferences were saved by a newer version of the app", staleHint: "Update the app to get them back; until then, changes here are not saved.", later: "Later", reload: "Check again",
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
