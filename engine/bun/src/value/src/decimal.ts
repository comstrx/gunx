import { deepest, divided, type Exact, factor, longest, power, type Rounding, read, rescaled, safe, scaled, write } from "./exact.ts";
import type { Typed } from "./typed.ts";

export type Decimal = Typed<string, "decimal">;
export type Input = Decimal | string | number | bigint;

function exact ( value: Input ): Exact {

    const found = read(value);

    if ( !found ) throw new RangeError(`not a decimal: ${String(value).slice(0, longest)}`);

    return found;

}
function places ( digits: number, lowest = 0 ): number {

    if ( !Number.isInteger(digits) || digits < lowest || digits > deepest ) throw new RangeError(`not a count of fraction digits: ${digits}`);

    return digits;

}
function made ( units: bigint, scale: number ): Decimal {

    let cut = Math.min(scale, deepest);
    let rest = scale > deepest ? divided(units, power(scale - deepest), "half-even") : units;

    while ( cut > 0 && rest % 10n === 0n ) {

        rest /= 10n;
        cut -= 1;

    }

    const text = write(rest, cut);

    if ( text.length > longest ) throw new RangeError("decimal out of range");

    return text as Decimal;

}
function paired ( a: Input, b: Input ): [bigint, bigint, number] {

    const left = exact(a);
    const right = exact(b);
    const scale = Math.max(left.scale, right.scale);

    return [left.units * power(scale - left.scale), right.units * power(scale - right.scale), scale];

}
export function of ( value: Input ): Decimal {

    const found = exact(value);

    return made(found.units, found.scale);

}
export function parse ( value: unknown ): Decimal | undefined {

    const found = read(value);

    try {

        return found ? made(found.units, found.scale) : undefined;

    } catch {

        return undefined;

    }

}
export function is ( value: unknown ): value is Decimal {

    return typeof value === "string" && parse(value) === value;

}
export function add ( a: Input, b: Input ): Decimal {

    const [left, right, scale] = paired(a, b);

    return made(left + right, scale);

}
export function subtract ( a: Input, b: Input ): Decimal {

    const [left, right, scale] = paired(a, b);

    return made(left - right, scale);

}
export function multiply ( a: Input, b: Input ): Decimal {

    const left = exact(a);
    const right = exact(b);

    return made(left.units * right.units, left.scale + right.scale);

}
export function divide ( a: Input, b: Input, digits = 20, rounding: Rounding = "half-even" ): Decimal {

    const top = exact(a);
    const bottom = exact(b);

    return made(divided(top.units * power(places(digits) + bottom.scale), bottom.units * power(top.scale), rounding), digits);

}
export function percent ( value: Input, rate: Input ): Decimal {

    const left = exact(value);
    const right = exact(rate);

    return made(left.units * right.units, left.scale + right.scale + 2);

}
export function negate ( value: Input ): Decimal {

    const found = exact(value);

    return made(-found.units, found.scale);

}
export function absolute ( value: Input ): Decimal {

    const found = exact(value);

    return made(found.units < 0n ? -found.units : found.units, found.scale);

}
export function round ( value: Input, digits = 0, rounding: Rounding = "half-even" ): Decimal {

    const found = exact(value);

    if ( found.scale <= places(digits, -deepest) ) return made(found.units, found.scale);

    const cut = divided(found.units, power(found.scale - digits), rounding);

    return digits < 0 ? made(cut * power(-digits), 0) : made(cut, digits);

}
export function fixed ( value: Input, digits: number, rounding: Rounding = "half-even" ): string {

    return write(rescaled(exact(value), places(digits), rounding), digits);

}
export function compare ( a: Input, b: Input ): -1 | 0 | 1 {

    const [left, right] = paired(a, b);

    return left < right ? -1 : left > right ? 1 : 0;

}
export function equal ( a: Input, b: Input ): boolean {

    return compare(a, b) === 0;

}
export function lesser ( a: Input, b: Input ): Decimal {

    return of(compare(a, b) <= 0 ? a : b);

}
export function greater ( a: Input, b: Input ): Decimal {

    return of(compare(a, b) >= 0 ? a : b);

}
export function isZero ( value: Input ): boolean {

    return exact(value).units === 0n;

}
export function isNegative ( value: Input ): boolean {

    return exact(value).units < 0n;

}
export function isPositive ( value: Input ): boolean {

    return exact(value).units > 0n;

}
export function sum ( values: readonly Input[] ): Decimal {

    let units = 0n;
    let scale = 0;

    for ( const value of values ) {

        const found = exact(value);
        const deeper = Math.max(scale, found.scale);

        units = units * power(deeper - scale) + found.units * power(deeper - found.scale);
        scale = deeper;

    }

    return made(units, scale);

}
export function scale ( value: Input ): number {

    const text = of(value);
    const dot = text.indexOf(".");

    return dot === -1 ? 0 : text.length - dot - 1;

}
export function toNumber ( value: Input ): number {

    return Number(of(value));

}
export function units ( value: Input, digits = 0, rounding: Rounding = "half-even" ): number {

    const found = factor(value);

    if ( !found ) throw new RangeError(`not a decimal: ${String(value).slice(0, longest)}`);

    return safe(scaled(found, places(digits), rounding));

}
export function fromUnits ( count: number | bigint, digits = 0 ): Decimal {

    if ( typeof count === "number" && !Number.isSafeInteger(count) ) throw new RangeError(`not a whole count of units: ${count}`);

    return made(BigInt(count), places(digits));

}
