const pairs: Record<string, string> = {
    person: "people", man: "men", woman: "women", child: "children", tooth: "teeth", foot: "feet", mouse: "mice", goose: "geese",
    ox: "oxen", leaf: "leaves", life: "lives", knife: "knives", wife: "wives", half: "halves", datum: "data", medium: "media",
    criterion: "criteria", phenomenon: "phenomena", index: "indices", matrix: "matrices", analysis: "analyses", crisis: "crises", status: "statuses",
};
const uncountable = new Set(["sheep", "fish", "deer", "series", "species", "money", "rice", "information", "equipment", "news", "software", "metadata"]);
const irregular = new Map(Object.entries(pairs));
const singulars = new Map(Object.entries(pairs).map(([one, many]) => [many, one]));
const pluralRules: readonly (readonly [RegExp, string])[] = [
    [/(quiz)$/i, "$1zes"], [/([ml])ouse$/i, "$1ice"], [/(matr|vert|ind)(?:ix|ex)$/i, "$1ices"], [/(x|ch|ss|sh)$/i, "$1es"],
    [/([^aeiouy]|qu)y$/i, "$1ies"], [/(hive)$/i, "$1s"], [/(?:([^f])fe|([lr])f)$/i, "$1$2ves"], [/sis$/i, "ses"], [/([ti])um$/i, "$1a"],
    [/(buffal|tomat|potat|her)o$/i, "$1oes"], [/(bu)s$/i, "$1ses"], [/(alias)$/i, "$1es"], [/(octop|vir)us$/i, "$1i"], [/(ax|test)is$/i, "$1es"],
    [/s$/i, "s"], [/$/, "s"],
];
const singularRules: readonly (readonly [RegExp, string])[] = [
    [/(quiz)zes$/i, "$1"], [/(matr)ices$/i, "$1ix"], [/(vert|ind)ices$/i, "$1ex"], [/(alias|status)es$/i, "$1"], [/(octop|vir)i$/i, "$1us"],
    [/(cris|ax|test)es$/i, "$1is"], [/(shoe)s$/i, "$1"], [/(o)es$/i, "$1"], [/(bus)es$/i, "$1"], [/([ml])ice$/i, "$1ouse"], [/(x|ch|ss|sh)es$/i, "$1"],
    [/(m)ovies$/i, "$1ovie"], [/(s)eries$/i, "$1eries"], [/([^aeiouy]|qu)ies$/i, "$1y"], [/([lr])ves$/i, "$1f"], [/(tive)s$/i, "$1"], [/(hive)s$/i, "$1"],
    [/([^f])ves$/i, "$1fe"], [/(^analy)ses$/i, "$1sis"], [/([ti])a$/i, "$1um"], [/(n)ews$/i, "$1ews"], [/s$/i, ""],
];

function matchCase ( sample: string, word: string ): string {

    if ( sample === sample.toUpperCase() && sample !== sample.toLowerCase() ) return word.toUpperCase();
    if ( sample[0] === sample[0]?.toUpperCase() && sample[0] !== sample[0]?.toLowerCase() ) return `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;

    return word;

}
export function plural ( word: string ): string {

    const lower = word.toLowerCase();

    if ( word === "" || uncountable.has(lower) ) return word;

    const known = irregular.get(lower);

    if ( known ) return matchCase(word, known);

    for ( const [pattern, replacement] of pluralRules ) if ( pattern.test(word) ) return word.replace(pattern, replacement);

    return word;

}
export function singular ( word: string ): string {

    const lower = word.toLowerCase();

    if ( word === "" || uncountable.has(lower) ) return word;

    const known = singulars.get(lower);

    if ( known ) return matchCase(word, known);

    for ( const [pattern, replacement] of singularRules ) if ( pattern.test(word) ) return word.replace(pattern, replacement);

    return word;

}
export function dual ( word: string ): string {

    if ( word.endsWith("ة") ) return `${word.slice(0, -1)}تان`;
    if ( /[؀-ۿ]/.test(word) ) return `${word}ان`;

    return `two ${plural(word)}`;

}
export function pluralize ( count: number, one: string, many?: string, locale = "en" ): string {

    const amount = Math.abs(count);

    if ( locale.startsWith("ar") ) {

        if ( amount === 1 ) return one;
        if ( amount === 2 ) return dual(one);

        return many ?? plural(one);

    }

    return amount === 1 ? one : (many ?? plural(one));

}
