import * as string from "engine-string";

export type Rounding = "half-even" | "half-up" | "half-down" | "up" | "down" | "ceil" | "floor";
export type Whole = number | bigint;
export type Exact = { units: bigint; scale: number };
export type Factor = { units: Whole; scale: number };

export const longest = 64;
export const deepest = 40;

const shape = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d{1,3}))?$/i;
const separators = /[\s,_٬]/g;
const marks = /[\u061c\u200e\u200f]/g;
const misgrouped = /(?:^|\D)[,٬]|\.\d*[,٬]|[,٬](?!\d{3}(?!\d)|\d{2}[,٬])/;
const tens: readonly number[] = [1, 10, 100, 1_000, 10_000, 100_000, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];
const powers: bigint[] = [1n];

function scan ( text: string ): Exact | undefined {

    const found = shape.exec(text);
    const whole = found?.[2] ?? "";
    const fraction = found?.[3] ?? "";

    if ( !found || whole.length + fraction.length === 0 ) return undefined;

    const scale = fraction.length - Number(found[4] ?? 0);
    const units = BigInt(`${found[1] === "-" ? "-" : ""}${whole}${fraction}`);

    if ( scale > deepest || scale < -deepest ) return undefined;

    return scale < 0 ? { units: units * power(-scale), scale: 0 } : { units, scale };

}
function plain ( value: number ): Factor | undefined {

    if ( Number.isSafeInteger(value) ) return { units: value, scale: 0 };

    const text = String(value);
    const dot = text.indexOf(".");

    if ( dot === -1 || text.includes("e") ) return undefined;

    const units = Number(text.slice(0, dot) + text.slice(dot + 1));

    return Number.isSafeInteger(units) ? { units, scale: text.length - dot - 1 } : undefined;

}
export function power ( exponent: number ): bigint {

    for ( let index = powers.length; index <= exponent; index += 1 ) powers.push((powers[index - 1] ?? 1n) * 10n);

    return powers[exponent] ?? 1n;

}
export function ten ( exponent: number ): Whole {

    return tens[exponent] ?? power(exponent);

}
export function unmarked ( text: string ): string {

    return text.replace(marks, "").replace("\u2212", "-");

}
export function ungrouped ( text: string ): string | undefined {

    const word = unmarked(text).replace("٫", ".");

    return misgrouped.test(word) ? undefined : word.replace(separators, "");

}
export function read ( value: unknown ): Exact | undefined {

    if ( typeof value === "bigint" ) return { units: value, scale: 0 };
    if ( typeof value === "number" ) return Number.isFinite(value) ? scan(String(value)) : undefined;
    if ( typeof value !== "string" ) return undefined;

    const text = value.trim();
    const word = text.length > longest ? undefined : ungrouped(string.asciiDigits(text));

    return word === undefined ? undefined : scan(word);

}
export function factor ( value: unknown ): Factor | undefined {

    return (typeof value === "number" ? plain(value) : undefined) ?? read(value);

}
export function write ( units: bigint, scale: number ): string {

    const digits = (units < 0n ? -units : units).toString().padStart(scale + 1, "0");
    const sign = units < 0n ? "-" : "";

    return scale === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;

}
export function safe ( value: Whole ): number {

    const found = typeof value === "bigint" ? Number(value) : value;

    if ( !Number.isSafeInteger(found) ) throw new RangeError(`not a safe whole number: ${String(value)}`);

    return found === 0 ? 0 : found;

}
export function product ( a: Whole, b: Whole ): Whole {

    if ( typeof a === "number" && typeof b === "number" ) {

        const made = a * b;

        if ( Number.isSafeInteger(made) ) return made;

    }

    return BigInt(a) * BigInt(b);

}
export function sum ( a: Whole, b: Whole ): Whole {

    if ( typeof a === "number" && typeof b === "number" ) {

        const made = a + b;

        if ( Number.isSafeInteger(made) ) return made;

    }

    return BigInt(a) + BigInt(b);

}
export function away ( rounding: Rounding, negative: boolean, odd: boolean, half: number ): boolean {

    if ( rounding === "half-even" ) return half > 0 || (half === 0 && odd);
    if ( rounding === "half-up" ) return half >= 0;
    if ( rounding === "half-down" ) return half > 0;
    if ( rounding === "up" ) return true;
    if ( rounding === "ceil" ) return !negative;
    if ( rounding === "floor" ) return negative;

    return false;

}
export function divided ( top: bigint, bottom: bigint, rounding: Rounding ): bigint {

    if ( bottom === 0n ) throw new RangeError("division by zero");

    const negative = top < 0n !== bottom < 0n;
    const size = top < 0n ? -top : top;
    const under = bottom < 0n ? -bottom : bottom;
    const whole = size / under;
    const rest = size % under;
    const twice = rest * 2n;
    const grown = rest !== 0n && away(rounding, negative, whole % 2n === 1n, twice > under ? 1 : twice < under ? -1 : 0) ? whole + 1n : whole;

    return negative ? -grown : grown;

}
export function quotient ( top: Whole, bottom: Whole, rounding: Rounding ): Whole {

    if ( typeof top !== "number" || typeof bottom !== "number" ) return divided(BigInt(top), BigInt(bottom), rounding);
    if ( bottom === 0 ) throw new RangeError("division by zero");

    const negative = top < 0 !== bottom < 0;
    const size = Math.abs(top);
    const under = Math.abs(bottom);
    const rest = size % under;
    const whole = (size - rest) / under;
    const grown = rest !== 0 && away(rounding, negative, whole % 2 === 1, Math.sign(rest * 2 - under)) ? whole + 1 : whole;

    return negative ? 0 - grown : grown;

}
export function rescaled ( exact: Exact, scale: number, rounding: Rounding ): bigint {

    return exact.scale <= scale ? exact.units * power(scale - exact.scale) : divided(exact.units, power(exact.scale - scale), rounding);

}
export function scaled ( found: Factor, scale: number, rounding: Rounding ): Whole {

    return found.scale <= scale ? product(found.units, ten(scale - found.scale)) : quotient(found.units, ten(found.scale - scale), rounding);

}
