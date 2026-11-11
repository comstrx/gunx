export type Category = "zero" | "one" | "two" | "few" | "many" | "other";

type Rule = ( whole: number, split: boolean ) => Category;

function millions ( whole: number, split: boolean ): boolean {

    return !split && whole !== 0 && whole % 1_000_000 === 0;

}
function single ( whole: number, split: boolean ): Category {

    return !split && whole === 1 ? "one" : "other";

}
function none (): Category {

    return "other";

}
function nil ( whole: number, split: boolean ): Category {

    return whole === 0 || (!split && whole === 1) ? "one" : "other";

}
function low ( whole: number ): Category {

    return whole <= 1 ? "one" : "other";

}
function danish ( whole: number, split: boolean ): Category {

    return (split ? whole <= 1 : whole === 1) ? "one" : "other";

}
function french ( whole: number, split: boolean ): Category {

    return whole <= 1 ? "one" : millions(whole, split) ? "many" : "other";

}
function latin ( whole: number, split: boolean ): Category {

    return millions(whole, split) ? "many" : single(whole, split);

}
function arabic ( whole: number, split: boolean ): Category {

    if ( split ) return "other";
    if ( whole <= 2 ) return whole === 0 ? "zero" : whole === 1 ? "one" : "two";

    const tail = whole % 100;

    return tail >= 3 && tail <= 10 ? "few" : tail >= 11 ? "many" : "other";

}
function hebrew ( whole: number, split: boolean ): Category {

    if ( split ) return whole === 0 ? "one" : "other";

    return whole === 1 ? "one" : whole === 2 ? "two" : "other";

}
function russian ( whole: number, split: boolean ): Category {

    if ( split ) return "other";

    const unit = whole % 10;
    const tail = whole % 100;

    if ( unit === 1 && tail !== 11 ) return "one";

    return unit >= 2 && unit <= 4 && (tail < 12 || tail > 14) ? "few" : "many";

}
function polish ( whole: number, split: boolean ): Category {

    if ( split ) return "other";
    if ( whole === 1 ) return "one";

    const unit = whole % 10;
    const tail = whole % 100;

    return unit >= 2 && unit <= 4 && (tail < 12 || tail > 14) ? "few" : "many";

}
function czech ( whole: number, split: boolean ): Category {

    if ( split ) return "many";

    return whole === 1 ? "one" : whole >= 2 && whole <= 4 ? "few" : "other";

}
function romanian ( whole: number, split: boolean ): Category {

    if ( split || whole === 0 ) return "few";
    if ( whole === 1 ) return "one";

    const tail = whole % 100;

    return tail >= 1 && tail <= 19 ? "few" : "other";

}
function lithuanian ( whole: number, split: boolean ): Category {

    if ( split ) return "many";

    const unit = whole % 10;
    const tail = whole % 100;

    if ( tail >= 11 && tail <= 19 ) return "other";

    return unit === 1 ? "one" : unit >= 2 ? "few" : "other";

}
function slovenian ( whole: number, split: boolean ): Category {

    if ( split ) return "few";

    const tail = whole % 100;

    return tail === 1 ? "one" : tail === 2 ? "two" : tail === 3 || tail === 4 ? "few" : "other";

}

const families: readonly (readonly [string, Rule])[] = [
    ["ja zh ko vi th id ms my km lo", none], ["hi bn fa gu kn am", nil], ["hy", low], ["da", danish], ["fr pt", french], ["es it ca pt-pt", latin],
    ["ar", arabic], ["he", hebrew], ["ru uk be", russian], ["pl", polish], ["cs sk", czech], ["ro", romanian], ["lt", lithuanian], ["sl", slovenian],
];
const rules = new Map(families.flatMap(([languages, rule]) => languages.split(" ").map(( language ) => [language, rule] as const)));

export function languageOf ( locale: string ): string {

    return (locale.split(/[-_]/)[0] ?? "").toLowerCase() || "en";

}
export function category ( count: number, locale = "en" ): Category {

    const size = Math.abs(count);

    if ( !Number.isFinite(size) ) return "other";

    const whole = Math.trunc(size);
    const tag = locale.toLowerCase().replace(/_/g, "-");
    const rule = rules.get(tag.slice(0, 5)) ?? rules.get(languageOf(tag)) ?? single;

    return rule(whole, size !== whole);

}
