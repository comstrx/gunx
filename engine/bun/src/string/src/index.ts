export { camel, capitalize, constant, headline, kebab, pascal, sentence, slug, snake, studly, title, transliterate, uncapitalize, words } from "./case.ts";
export { type Closest, closest, dice, distance, isSimilar, similarity } from "./compare.ts";
export { base64, base64url, bytes, fromBase64, fromHex, hex, utf8 } from "./encode.ts";
export { asciiDigits, bare, digits, fold, grade, rank, score, tokens } from "./fold.ts";
export { dual, plural, pluralize, singular } from "./plural.ts";
export {
    after, afterLast, before, beforeLast, between, chopEnd, chopStart, chunk, collapse, count, type Direction, deduplicate, direction, endsWithAny,
    escapeHtml, escapeRegExp, excerpt, finish, graphemes, includesAll, includesAny, initials, isArabic, isAscii, isBlank, isolate, length, limitWords,
    lines, type MaskKind, type MaskOptions, mask, type PadSide, pad, remove, replaceFirst, replaceLast, reverse, start, startsWithAny, swap, take,
    truncate, unescapeHtml, unwrap, wordCount, wrap,
} from "./text.ts";
