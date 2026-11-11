import * as number from "engine-number";

export type Spring = { damping: number; stiffness: number; mass: number };
export type Path = { duration: number; points: readonly number[] };
export type Curve = readonly [number, number, number, number];
export type Easing = "linear" | "standard" | "emphasized" | "decelerate" | "accelerate" | "overshoot";

const settled = Math.log(1000);
const longest = 10;
const finest = 512;
const property = /^-{0,2}[a-zA-Z_][\w-]*$/;

export const durations = { instant: 0, fast: 120, base: 200, slow: 320, expressive: 480 } as const;
export const curves: Readonly<Record<Exclude<Easing, "linear">, Curve>> = {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.3, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
    overshoot: [0.34, 1.56, 0.64, 1],
};
export const easings: Readonly<Record<Easing, string>> = {
    linear: "linear",
    standard: bent(curves.standard),
    emphasized: bent(curves.emphasized),
    decelerate: bent(curves.decelerate),
    accelerate: bent(curves.accelerate),
    overshoot: bent(curves.overshoot),
};

function bent ( curve: Curve ): string {

    return `cubic-bezier(${curve.join(", ")})`;

}
function inside ( value: unknown ): boolean {

    return typeof value === "number" && value >= 0 && value <= 1;

}
function sure ( curve: Curve ): Curve {

    const parts: readonly unknown[] = Array.isArray(curve) ? curve : [];

    if ( parts.length !== 4 || !parts.every(( part ) => Number.isFinite(part)) || !inside(parts[0]) || !inside(parts[2]) ) throw new RangeError("not a curve");

    return curve;

}
function curveOf ( easing: Exclude<Easing, "linear"> | Curve ): Curve {

    if ( typeof easing !== "string" ) return sure(easing);
    if ( !Object.hasOwn(curves, easing) ) throw new RangeError("not an easing");

    return curves[easing];

}
function sprung ( given: Spring ): Spring {

    const { damping, stiffness, mass } = given;

    if ( !(Number.isFinite(damping) && damping >= 0 && Number.isFinite(stiffness) && stiffness > 0 && Number.isFinite(mass) && mass > 0) ) throw new RangeError("not a spring");

    return given;

}
function bezier ( curve: Curve, t: number ): number {

    const [x1, y1, x2, y2] = curve;
    const sample = ( a1: number, a2: number, u: number ): number => ((1 - 3 * a2 + 3 * a1) * u + (3 * a2 - 6 * a1)) * u * u + 3 * a1 * u;
    let guess = t;
    let low = 0;
    let high = 1;

    for ( let round = 0; round < 8; round += 1 ) {

        const gap = sample(x1, x2, guess) - t;
        const slope = (3 * (1 - 3 * x2 + 3 * x1) * guess + 2 * (3 * x2 - 6 * x1)) * guess + 3 * x1;

        if ( Math.abs(gap) < 1e-7 ) return sample(y1, y2, guess);
        if ( Math.abs(slope) < 1e-6 ) break;

        guess -= gap / slope;

    }

    guess = t;

    for ( let round = 0; round < 40; round += 1 ) {

        const gap = sample(x1, x2, guess) - t;

        if ( Math.abs(gap) < 1e-7 ) break;

        if ( gap < 0 ) low = guess;
        else high = guess;

        guess = (low + high) / 2;

    }

    return sample(y1, y2, guess);

}

export function spring ( ratio = 0.8, stiffness = 180, mass = 1 ): Spring {

    if ( !(Number.isFinite(ratio) && ratio >= 0) ) throw new RangeError("not a spring");

    return sprung({ damping: ratio * 2 * Math.sqrt(stiffness * mass), stiffness, mass });

}
export function path ( given: Spring, samples = 32 ): Path {

    const { damping, stiffness, mass } = sprung(given);
    const count = Number.isNaN(samples) ? 32 : Math.max(2, Math.min(finest, Math.trunc(samples)));
    const omega = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const critical = Math.abs(zeta - 1) < 1e-6;
    const spread = critical ? 0 : omega * Math.sqrt(Math.abs(zeta * zeta - 1));
    const decay = zeta < 1 || critical ? zeta * omega : (omega * omega) / (zeta * omega + spread);
    const at = ( time: number ): number => {

        if ( critical ) return 1 - Math.exp(-omega * time) * (1 + omega * time);
        if ( zeta < 1 ) return 1 - Math.exp(-zeta * omega * time) * (Math.cos(spread * time) + ((zeta * omega) / spread) * Math.sin(spread * time));

        const fast = -zeta * omega - spread;
        const slow = -decay;

        return 1 + (fast * Math.exp(slow * time) - slow * Math.exp(fast * time)) / (slow - fast);

    };
    const seconds = Math.min(longest, settled / Math.max(decay, 1e-6));
    const points = Array.from({ length: count + 1 }, ( _, step ) => (step === 0 ? 0 : step === count ? 1 : number.precision(at((seconds * step) / count), 4)));

    return { duration: Math.round(seconds * 1000), points };

}
export function toLinear ( given: Path ): string {

    const points: readonly unknown[] = Array.isArray(given.points) ? given.points : [];

    if ( points.length < 2 || !points.every(( point ) => Number.isFinite(point)) ) throw new RangeError("not a path");

    return `linear(${points.join(", ")})`;

}
export function ease ( kind: Easing | Curve ): string {

    if ( typeof kind !== "string" ) return bent(sure(kind));
    if ( !Object.hasOwn(easings, kind) ) throw new RangeError("not an easing");

    return easings[kind];

}
export function transition ( properties: readonly string[], duration: number = durations.base, easing: Easing | Curve = "standard", delay = 0 ): string {

    const curve = ease(easing);

    if ( !(Number.isFinite(duration) && duration >= 0) || !Number.isFinite(delay) ) throw new RangeError("not a duration");

    const tail = delay === 0 ? "" : ` ${delay}ms`;

    return properties.map(( name ) => {

        if ( typeof name !== "string" || !property.test(name) ) throw new RangeError("not a property");

        return `${name} ${duration}ms ${curve}${tail}`;

    }).join(", ");

}
export function reduced ( duration: number, reduce: boolean ): number {

    return reduce ? 0 : duration;

}
export function stagger ( index: number, step = 40, cap = 400 ): number {

    const wait = Math.min(cap, Math.max(0, index) * step);

    return Number.isNaN(wait) ? 0 : Math.max(0, wait);

}
export function tween ( from: number, to: number, progress: number, easing: Easing | Curve = "standard" ): number {

    const curve = easing === "linear" ? undefined : curveOf(easing);
    const t = progress > 0 ? Math.min(progress, 1) : 0;

    if ( t === 0 ) return from;
    if ( t === 1 ) return to;

    return from + (to - from) * (curve ? bezier(curve, t) : t);

}
