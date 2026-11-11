import * as json from "engine-json";
import * as number from "engine-number";
import { type Decimal, fromUnits, type Input } from "./decimal.ts";
import { type Factor, factor, product, quotient, type Rounding, safe, scaled, sum, ten, unmarked, type Whole, write } from "./exact.ts";
import { currency as coded, patterns } from "./typed.ts";

export type Money = { readonly minor: number; readonly currency: string };
export type Wire = { amount: string; currency: string; minor: number };

const none = "BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF";
const three = "BHD IQD JOD KWD LYD OMR TND";
const four = "CLF UYW";
const exponents: ReadonlyMap<string, number> = new Map([...listed(none, 0), ...listed(three, 3), ...listed(four, 4)]);
const worded = /^([A-Za-z]{3})?\s*([+-]?[\d٠-٩۰-۹.,_٫٬]+(?:\s+[\d٠-٩۰-۹.,_٫٬]+)*)\s*([A-Za-z]{3})?$/;
const longest = 80;

function listed ( names: string, digits: number ): [string, number][] {

    return names.split(" ").map(( name ) => [name, digits]);

}
function code ( currency: string ): string {

    const found = coded(currency);

    if ( !found ) throw new RangeError(`not a currency code: ${String(currency).slice(0, longest)}`);

    return found;

}
function digits ( currency: string ): number {

    return exponents.get(currency) ?? 2;

}
function counted ( value: Input ): Factor {

    const found = factor(value);

    if ( !found ) throw new RangeError(`not an amount: ${String(value).slice(0, longest)}`);

    return found;

}
function weighed ( ratio: number ): Factor {

    const found = ratio >= 0 ? factor(ratio) : undefined;

    if ( !found ) throw new RangeError("not a ratio to allocate by");

    return found;

}
function made ( minor: Whole, currency: string ): Money {

    return { minor: safe(minor), currency };

}
function same ( a: Money, b: Money ): string {

    if ( a.currency !== b.currency ) throw new RangeError(`currency mismatch: ${a.currency} and ${b.currency}`);

    return a.currency;

}
function shared ( whole: number, weights: readonly number[], weight: number ): number[] {

    const rests = weights.map(( one ) => (whole * one) % weight);
    const shares = weights.map(( one, index ) => (whole * one - (rests[index] ?? 0)) / weight);
    const order = rests.map(( _, index ) => index).sort(( a, b ) => (rests[b] ?? 0) - (rests[a] ?? 0) || a - b);
    const left = whole - shares.reduce(( all, one ) => all + one, 0);

    for ( const index of order.slice(0, left) ) shares[index] = (shares[index] ?? 0) + 1;

    return shares;

}
function sharedWide ( whole: bigint, weights: readonly bigint[], weight: bigint ): number[] {

    const rests = weights.map(( one ) => (whole * one) % weight);
    const shares = weights.map(( one ) => (whole * one) / weight);
    const order = rests.map(( _, index ) => index).sort(( a, b ) => {

        const high = rests[b] ?? 0n;
        const low = rests[a] ?? 0n;

        return high > low ? 1 : high < low ? -1 : a - b;

    });
    const left = Number(whole - shares.reduce(( all, one ) => all + one, 0n));

    for ( const index of order.slice(0, left) ) shares[index] = (shares[index] ?? 0n) + 1n;

    return shares.map(( share ) => safe(share));

}
export function exponent ( currency: string ): number {

    return digits(currency.trim().toUpperCase());

}
export function of ( amount: Input, currency: string, rounding: Rounding = "half-even" ): Money {

    const upper = code(currency);

    return made(scaled(counted(amount), digits(upper), rounding), upper);

}
export function minor ( count: number | bigint, currency: string ): Money {

    return made(count, code(currency));

}
export function zero ( currency: string ): Money {

    return made(0, code(currency));

}
export function parse ( text: unknown, fallback?: string, rounding: Rounding = "half-even" ): Money | undefined {

    const found = typeof text === "string" && text.length <= longest ? worded.exec(unmarked(text).trim()) : null;
    const lead = found?.[1]?.toUpperCase();
    const trail = found?.[3]?.toUpperCase();
    const upper = coded(lead ?? trail ?? fallback);

    if ( !found || !upper || (lead !== undefined && trail !== undefined && lead !== trail) ) return undefined;

    try {

        return of(found[2] ?? "", upper, rounding);

    } catch {

        return undefined;

    }

}
export function is ( value: unknown ): value is Money {

    return json.isRecord(value) && typeof value.minor === "number" && Number.isSafeInteger(value.minor) && typeof value.currency === "string" && patterns.currency.test(value.currency);

}
export function major ( value: Money ): number {

    return value.minor / 10 ** digits(value.currency);

}
export function decimal ( value: Money ): Decimal {

    return fromUnits(value.minor, digits(value.currency));

}
export function add ( a: Money, b: Money ): Money {

    return made(a.minor + b.minor, same(a, b));

}
export function subtract ( a: Money, b: Money ): Money {

    return made(a.minor - b.minor, same(a, b));

}
export function multiply ( value: Money, by: Input, rounding: Rounding = "half-even" ): Money {

    const found = counted(by);

    return made(quotient(product(value.minor, found.units), ten(found.scale), rounding), value.currency);

}
export function divide ( value: Money, by: Input, rounding: Rounding = "half-even" ): Money {

    const found = counted(by);

    return made(quotient(product(value.minor, ten(found.scale)), found.units, rounding), value.currency);

}
export function negate ( value: Money ): Money {

    return made(-value.minor, value.currency);

}
export function absolute ( value: Money ): Money {

    return made(Math.abs(value.minor), value.currency);

}
export function percent ( value: Money, rate: Input, rounding: Rounding = "half-even" ): Money {

    const found = counted(rate);

    return made(quotient(product(value.minor, found.units), ten(found.scale + 2), rounding), value.currency);

}
export function tax ( value: Money, rate: Input, rounding: Rounding = "half-even" ): Money {

    return percent(value, rate, rounding);

}
export function gross ( value: Money, rate: Input, rounding: Rounding = "half-even" ): Money {

    return add(value, percent(value, rate, rounding));

}
export function net ( value: Money, rate: Input, rounding: Rounding = "half-even" ): Money {

    const found = counted(rate);
    const hundred = ten(found.scale + 2);

    return made(quotient(product(value.minor, hundred), sum(hundred, found.units), rounding), value.currency);

}
export function allocate ( value: Money, ratios: readonly number[] ): Money[] {

    if ( ratios.length === 0 ) return [];

    const found = ratios.map(weighed);
    const scale = found.reduce(( deepest, one ) => Math.max(deepest, one.scale), 0);
    const weights = found.map(( one ) => product(one.units, ten(scale - one.scale)));
    const weight = weights.reduce<Whole>(( all, one ) => sum(all, one), 0);
    const whole = Math.abs(value.minor);
    const sign = value.minor < 0 ? -1 : 1;

    if ( weight <= 0 ) throw new RangeError("no weight to allocate by");

    const narrow = typeof weight === "number" && Number.isSafeInteger(whole * weight);
    const shares = narrow ? shared(whole, weights.map(Number), weight) : sharedWide(BigInt(whole), weights.map(BigInt), BigInt(weight));

    return shares.map(( share ) => made(sign * share, value.currency));

}
export function split ( value: Money, count: number ): Money[] {

    if ( !Number.isSafeInteger(count) || count < 1 ) throw new RangeError(`not a count of parts: ${count}`);

    const whole = Math.abs(value.minor);
    const sign = value.minor < 0 ? -1 : 1;
    const rest = whole % count;
    const share = (whole - rest) / count;

    return Array.from({ length: count }, ( _, index ) => made(sign * (index < rest ? share + 1 : share), value.currency));

}
export function total ( values: readonly Money[], currency?: string ): Money {

    const upper = currency === undefined ? values[0]?.currency : code(currency);
    let whole = 0;

    if ( upper === undefined ) throw new RangeError("no currency for an empty total");

    for ( const value of values ) {

        if ( value.currency !== upper ) throw new RangeError(`currency mismatch: ${upper} and ${value.currency}`);

        whole = safe(whole + value.minor);

    }

    return made(whole, upper);

}
export function compare ( a: Money, b: Money ): -1 | 0 | 1 {

    same(a, b);

    return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;

}
export function equal ( a: Money, b: Money ): boolean {

    return a.currency === b.currency && a.minor === b.minor;

}
export function lesser ( a: Money, b: Money ): Money {

    return compare(a, b) <= 0 ? a : b;

}
export function greater ( a: Money, b: Money ): Money {

    return compare(a, b) >= 0 ? a : b;

}
export function isZero ( value: Money ): boolean {

    return value.minor === 0;

}
export function isNegative ( value: Money ): boolean {

    return value.minor < 0;

}
export function isPositive ( value: Money ): boolean {

    return value.minor > 0;

}
export function convert ( value: Money, currency: string, rate: Input, rounding: Rounding = "half-even" ): Money {

    const upper = code(currency);
    const found = counted(rate);

    if ( found.units <= 0 ) throw new RangeError(`not a rate: ${String(rate).slice(0, longest)}`);

    const shift = digits(upper) - digits(value.currency) - found.scale;
    const raw = product(value.minor, found.units);

    return made(shift >= 0 ? product(raw, ten(shift)) : quotient(raw, ten(-shift), rounding), upper);

}
function shown ( value: Money ): number.Amount {

    return Math.abs(value.minor) < 2 ** 52 ? major(value) : write(BigInt(value.minor), digits(value.currency));

}
export function format ( value: Money, options: number.FormatOptions = {} ): string {

    return number.currency(shown(value), value.currency, { digits: digits(value.currency), ...options });

}
export function parts ( value: Money, options: number.FormatOptions = {} ): number.CurrencyParts {

    return number.currencyParts(shown(value), value.currency, { digits: digits(value.currency), ...options });

}
export function toJson ( value: Money ): Wire {

    return { amount: write(BigInt(value.minor), digits(value.currency)), currency: value.currency, minor: value.minor };

}
export function fromJson ( value: unknown ): Money | undefined {

    if ( !json.isRecord(value) ) return undefined;

    const { amount, minor: count } = value;
    const upper = coded(value.currency);

    if ( !upper || (amount === undefined && count === undefined) ) return undefined;
    if ( amount !== undefined && typeof amount !== "string" && typeof amount !== "number" ) return undefined;
    if ( count !== undefined && typeof count !== "number" ) return undefined;

    try {

        const told = amount === undefined ? undefined : of(amount, upper);
        const kept = count === undefined ? told : made(count, upper);

        return told && kept && told.minor !== kept.minor ? undefined : kept;

    } catch {

        return undefined;

    }

}
