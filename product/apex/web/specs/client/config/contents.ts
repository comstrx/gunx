export const contents = {
    name: { key: "brand.name" },
    tagline: { key: "brand.tagline" },
    description: { en: "Shop the Acme store, follow your orders and catch the offers of the week.", ar: "تسوّق من متجر أكمي، تابع طلباتك والحق عروض الأسبوع." },
    url: "https://store.acme.example",
    logo: "/images/logo.svg",
    icon: "/images/icon.svg",
    email: "hello@acme.example",
    phone: "+20 100 000 0000",
    address: { en: "12 Market Street, Cairo", ar: "١٢ شارع السوق، القاهرة" },
    socials: [{ name: "github", href: "https://github.com/acme" }],
    seo: {
        image: "/images/share.jpg",
        twitter: "@acme",
        keywords: ["acme", "store", "offers"],
        robots: { allow: ["/"], disallow: ["/account", "/login"] },
    },
} as const;
