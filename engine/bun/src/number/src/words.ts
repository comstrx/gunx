import { finite, precision } from "./math.ts";
import { languageOf } from "./plural.ts";

export type Unit = { one: string; two: string; few: string; many: string };

const englishOnes = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const englishTens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const englishScale = ["", "thousand", "million", "billion", "trillion"];
const arabicOnes = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const arabicTens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const arabicHundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
const arabicScale: readonly Unit[] = [
    { one: "", two: "", few: "", many: "" },
    { one: "ألف", two: "ألفان", few: "آلاف", many: "ألف" },
    { one: "مليون", two: "مليونان", few: "ملايين", many: "مليون" },
    { one: "مليار", two: "ملياران", few: "مليارات", many: "مليار" },
    { one: "تريليون", two: "تريليونان", few: "تريليونات", many: "تريليون" },
];

function englishChunk ( value: number ): string {

    const parts: string[] = [];
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;

    if ( hundreds ) parts.push(`${englishOnes[hundreds]} hundred`);

    if ( rest >= 20 ) parts.push(rest % 10 ? `${englishTens[Math.floor(rest / 10)]}-${englishOnes[rest % 10]}` : englishTens[Math.floor(rest / 10)] ?? "");
    else if ( rest ) parts.push(englishOnes[rest] ?? "");

    return parts.join(" ");

}
function arabicChunk ( value: number ): string {

    const parts: string[] = [];
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;

    if ( hundreds ) parts.push(arabicHundreds[hundreds] ?? "");

    if ( rest >= 20 ) parts.push(rest % 10 ? `${arabicOnes[rest % 10]} و${arabicTens[Math.floor(rest / 10)]}` : arabicTens[Math.floor(rest / 10)] ?? "");
    else if ( rest ) parts.push(arabicOnes[rest] ?? "");

    return parts.join(" و");

}
export function unitWord ( count: number, unit: Unit ): string {

    const tail = count % 100;

    if ( count === 1 ) return unit.one;
    if ( count === 2 ) return unit.two;

    return `${arabicChunk(count)} ${tail >= 3 && tail <= 10 ? unit.few : unit.many}`;

}
function english ( value: number ): string {

    if ( value === 0 ) return "zero";

    const groups: string[] = [];
    let remaining = value;
    let index = 0;

    while ( remaining > 0 && index < englishScale.length ) {

        const chunk = remaining % 1000;

        if ( chunk ) groups.unshift(`${englishChunk(chunk)}${englishScale[index] ? ` ${englishScale[index]}` : ""}`);

        remaining = Math.floor(remaining / 1000);
        index += 1;

    }

    return groups.join(" ");

}
function arabic ( value: number ): string {

    if ( value === 0 ) return "صفر";

    const groups: string[] = [];
    let remaining = value;
    let index = 0;

    while ( remaining > 0 && index < arabicScale.length ) {

        const chunk = remaining % 1000;
        const unit = arabicScale[index];

        if ( chunk && unit ) groups.unshift(index === 0 ? arabicChunk(chunk) : unitWord(chunk, unit));

        remaining = Math.floor(remaining / 1000);
        index += 1;

    }

    return groups.join(" و");

}
export function words ( value: number, locale = "en" ): string {

    const amount = Math.min(precision(Math.abs(finite(value)), 2), 999_999_999_999_999);
    const whole = Math.trunc(amount);
    const cents = Math.round((amount - whole) * 100);
    const arab = languageOf(locale) === "ar";
    const spoken = arab ? arabic(whole) : english(whole);
    const negative = value < 0 && amount > 0 ? (arab ? "سالب " : "minus ") : "";

    if ( cents === 0 ) return `${negative}${spoken}`;

    const ones = arab ? arabicOnes : englishOnes;
    const digits = [Math.floor(cents / 10), cents % 10].map(( digit ) => ones[digit] || (arab ? "صفر" : "zero"));

    return `${negative}${spoken} ${arab ? "فاصلة" : "point"} ${digits.join(" ")}`;

}
