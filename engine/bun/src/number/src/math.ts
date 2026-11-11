const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function places ( digits: number ): number {

    return clamp(Math.trunc(finite(digits)), 0, 15);

}
function fraction ( value: number ): number {

    const text = String(value);
    const dot = text.indexOf(".");

    return text.includes("e") ? 15 : dot === -1 ? 0 : text.length - dot - 1;

}
function lifted ( value: number, digits: number ): number {

    const raw = value * 10 ** digits;
    const twice = raw * 2;

    if ( !Number.isFinite(raw) || Math.abs(twice - Math.round(twice)) > Math.abs(twice) * 4 * Number.EPSILON ) return raw;

    const text = String(value);

    return text.includes("e") ? raw : Number(`${text}e${digits}`);

}
function nearest ( raw: number ): number {

    return raw < 0 ? 0 - Math.round(0 - raw) : Math.round(raw);

}
function settled ( value: number, digits: number, edge: ( raw: number ) => number ): number {

    const count = places(digits);
    const raw = Number.isInteger(value) ? Number.NaN : lifted(value, count);

    return Math.abs(raw) < 2 ** 52 ? edge(raw) / 10 ** count + 0 : value + 0;

}

export function finite ( value: unknown, fallback = 0 ): number {

    return typeof value === "number" && Number.isFinite(value) ? value : fallback;

}
export function isNumeric ( value: unknown ): boolean {

    if ( typeof value === "number" ) return Number.isFinite(value);
    if ( typeof value !== "string" || value.length > 64 ) return false;

    return numeric.test(value.trim()) && Number.isFinite(Number(value));

}
export function clamp ( value: number, low: number, high: number ): number {

    return Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));

}
export function between ( value: number, low: number, high: number ): boolean {

    return value >= Math.min(low, high) && value <= Math.max(low, high);

}
export function wrap ( value: number, low: number, high: number ): number {

    const span = high - low;

    if ( span <= 0 ) return low;

    return ((((value - low) % span) + span) % span) + low;

}
export function precision ( value: number, digits = 2 ): number {

    return settled(value, digits, nearest);

}
export function round ( value: number, digits = 0 ): number {

    return precision(value, digits);

}
export function floor ( value: number, digits = 0 ): number {

    return settled(value, digits, Math.floor);

}
export function ceil ( value: number, digits = 0 ): number {

    return settled(value, digits, Math.ceil);

}
export function trunc ( value: number, digits = 0 ): number {

    return settled(value, digits, Math.trunc);

}
export function sign ( value: number ): -1 | 0 | 1 {

    return value > 0 ? 1 : value < 0 ? -1 : 0;

}
export function isEven ( value: number ): boolean {

    return Number.isInteger(value) && value % 2 === 0;

}
export function isOdd ( value: number ): boolean {

    return Number.isInteger(value) && Math.abs(value % 2) === 1;

}
export function sum ( values: readonly number[] ): number {

    let total = 0;
    let lost = 0;

    for ( const value of values ) {

        const next = finite(value);
        const grown = total + next;

        lost += Math.abs(total) >= Math.abs(next) ? total - grown + next : next - grown + total;
        total = grown;

    }

    return Number.isFinite(total + lost) ? total + lost : total;

}
export function mean ( values: readonly number[] ): number {

    return values.length === 0 ? 0 : sum(values) / values.length;

}
export function median ( values: readonly number[] ): number {

    if ( values.length === 0 ) return 0;

    const sorted = values.map(( value ) => finite(value)).sort(( a, b ) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const upper = sorted[middle] ?? 0;
    const lower = sorted[middle - 1] ?? upper;

    return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;

}
export function quantile ( values: readonly number[], share: number ): number {

    const sorted = values.filter(( value ) => Number.isFinite(value)).sort(( a, b ) => a - b);
    const at = clamp(finite(share), 0, 1) * (sorted.length - 1);
    const low = sorted[Math.floor(at)] ?? 0;
    const high = sorted[Math.ceil(at)] ?? low;

    return low + (high - low) * (at - Math.floor(at));

}
export function deviation ( values: readonly number[] ): number {

    const kept = values.filter(( value ) => Number.isFinite(value));
    const middle = mean(kept);

    return kept.length < 2 ? 0 : Math.sqrt(sum(kept.map(( value ) => (value - middle) ** 2)) / (kept.length - 1));

}
export function min ( values: readonly number[] ): number {

    let found: number | undefined;

    for ( const value of values ) if ( Number.isFinite(value) && (found === undefined || value < found) ) found = value;

    return found ?? 0;

}
export function max ( values: readonly number[] ): number {

    let found: number | undefined;

    for ( const value of values ) if ( Number.isFinite(value) && (found === undefined || value > found) ) found = value;

    return found ?? 0;

}
export function percent ( part: number, whole: number, digits = 2 ): number {

    return whole === 0 ? 0 : precision((part / whole) * 100, digits);

}
export function ratio ( part: number, whole: number ): number {

    return whole === 0 ? 0 : part / whole;

}
export function change ( from: number, to: number, digits = 2 ): number {

    return from === 0 ? 0 : precision(((to - from) / Math.abs(from)) * 100, digits);

}
export function snap ( value: number, step: number, origin = 0 ): number {

    if ( !(step > 0) || !Number.isFinite(value) ) return value;

    return precision(Math.round((value - origin) / step) * step + origin, Math.max(fraction(step), fraction(origin)));

}
export function near ( a: number, b: number, tolerance = 1e-9 ): boolean {

    return a === b || Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));

}
export function lerp ( from: number, to: number, amount: number ): number {

    return from + (to - from) * clamp(amount, 0, 1);

}
export function scale ( value: number, from: readonly [number, number], to: readonly [number, number] ): number {

    const [fromLow, fromHigh] = from;
    const [toLow, toHigh] = to;

    if ( fromHigh === fromLow ) return toLow;

    return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);

}
export function gcd ( a: number, b: number ): number {

    let x = Math.abs(Math.trunc(finite(a)));
    let y = Math.abs(Math.trunc(finite(b)));

    while ( y > 0 ) {

        const rest = x % y;

        x = y;
        y = rest;

    }

    return x;

}
export function lcm ( a: number, b: number ): number {

    const divisor = gcd(a, b);

    return divisor === 0 ? 0 : Math.abs((Math.trunc(finite(a)) / divisor) * Math.trunc(finite(b)));

}
