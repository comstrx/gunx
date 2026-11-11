import * as string from "engine-string";

export type ClassValue = string | number | null | undefined | false | readonly ClassValue[] | Readonly<Record<string, boolean | null | undefined>>;
export type Axes = Record<string, Record<string, string>>;
export type Choice<O> = keyof O | ("true" extends keyof O ? true : never) | ("false" extends keyof O ? false : never);
export type Picked<A extends Axes> = { [K in keyof A]?: Choice<A[K]> | null | undefined };
export type When<A extends Axes> = { [K in keyof A]?: Choice<A[K]> | readonly Choice<A[K]>[] | undefined };
export type Recipe<A extends Axes> = {
    base?: ClassValue | undefined;
    axes: A;
    defaults?: Picked<A> | undefined;
    compound?: readonly { when: When<A>; add: ClassValue }[] | undefined;
};
export type Variants<A extends Axes> = (( picked?: Picked<A> & { className?: ClassValue | undefined } ) => string) & {
    readonly axes: A;
    readonly defaults: Readonly<Picked<A>>;
    options: ( axis: keyof A ) => string[];
};

type Plan = { name: string; index: Map<string, number>; added: string[]; fallback: number };
type Rule = { when: readonly (readonly [number, ReadonlySet<number>])[]; add: string };

const deepest = 8;
const held = 1024;
const plain = /^[a-z][a-z0-9-]*$/;

function split ( text: string, seen: Set<string> ): void {

    let from = -1;

    for ( let at = 0; at <= text.length; at += 1 ) {

        const code = at === text.length ? 32 : text.charCodeAt(at);
        const gap = code <= 32 || code === 160 || code === 8232 || code === 8233;

        if ( !gap && from === -1 ) from = at;

        if ( gap && from !== -1 ) {

            seen.add(text.slice(from, at));
            from = -1;

        }

    }

}
function collect ( value: unknown, seen: Set<string>, depth: number ): void {

    if ( typeof value === "string" ) {

        split(value, seen);

        return;

    }

    if ( typeof value === "number" ) {

        if ( Number.isFinite(value) ) seen.add(String(value));

        return;

    }

    if ( typeof value !== "object" || value === null || depth >= deepest ) return;

    if ( Array.isArray(value) ) {

        for ( const item of value ) collect(item, seen, depth + 1);

        return;

    }

    const flags = value as Readonly<Record<string, unknown>>;

    for ( const name of Object.keys(flags) ) if ( flags[name] ) split(name, seen);

}
function joined ( seen: ReadonlySet<string> ): string {

    return seen.size === 0 ? "" : [...seen].join(" ");

}
function worded ( value: unknown ): string | undefined {

    if ( typeof value === "string" ) return value;

    return typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;

}
function pick ( plan: Plan, own: unknown ): number {

    const text = worded(own);

    return text === undefined ? plan.fallback : (plan.index.get(text) ?? 0);

}
function planned ( axes: Axes ): Plan[] {

    if ( typeof axes !== "object" || axes === null ) throw new RangeError("not a recipe");

    return Object.keys(axes).map(( name ) => {

        const options = axes[name];
        const plan: Plan = { name, index: new Map(), added: [""], fallback: 0 };

        if ( typeof options !== "object" || options === null || name === "className" ) throw new RangeError("not an axis");

        for ( const option of Object.keys(options) ) {

            plan.index.set(option, plan.added.length);
            plan.added.push(classes(options[option]));

        }

        return plan;

    });

}
function ruled ( plans: readonly Plan[], compound: readonly { when: object; add: ClassValue }[] ): Rule[] {

    const places = new Map(plans.map(( plan, at ) => [plan.name, at]));

    return compound.map(( rule ) => {

        const when: (readonly [number, ReadonlySet<number>])[] = [];

        if ( typeof rule !== "object" || rule === null || typeof rule.when !== "object" || rule.when === null ) throw new RangeError("not a recipe");

        const asked = rule.when as Readonly<Record<string, unknown>>;

        for ( const name of Object.keys(asked) ) {

            const at = places.get(name);
            const plan = at === undefined ? undefined : plans[at];
            const given = asked[name];
            const wanted = new Set<number>();

            if ( at === undefined || plan === undefined ) throw new RangeError("not an axis");
            if ( given === undefined ) continue;

            for ( const value of Array.isArray(given) ? given : [given] ) {

                const text = worded(value);

                if ( text === undefined ) throw new RangeError("not a choice");
                if ( !plan.index.has(text) ) {

                    plan.index.set(text, plan.added.length);
                    plan.added.push("");

                }

                wanted.add(plan.index.get(text) ?? 0);

            }

            when.push([at, wanted]);

        }

        return { when, add: classes(rule.add) };

    });

}

export function classes ( ...values: readonly ClassValue[] ): string {

    const seen = new Set<string>();

    for ( const value of values ) collect(value, seen, 0);

    return joined(seen);

}
export function variants<const A extends Axes> ( recipe: Recipe<A> ): Variants<A> {

    const { axes, compound = [] } = recipe;
    const plans = planned(axes);
    const rules = ruled(plans, compound);
    const root = classes(recipe.base);
    const defaults: Readonly<Picked<A>> = Object.freeze({ ...recipe.defaults } as Picked<A>);
    const picks = new Array<number>(plans.length).fill(0);
    const memo = new Map<number, string>();
    let span = 1;

    for ( const plan of plans ) {

        plan.fallback = pick(plan, (defaults as Readonly<Record<string, unknown>>)[plan.name]);
        span *= plan.added.length;

    }

    const safe = span <= Number.MAX_SAFE_INTEGER;
    const mixed = (): string => {

        const seen = new Set<string>();

        split(root, seen);

        for ( let at = 0; at < plans.length; at += 1 ) split(plans[at]?.added[picks[at] ?? 0] ?? "", seen);

        for ( const rule of rules ) if ( rule.when.every(([at, wanted]) => wanted.has(picks[at] ?? 0)) ) split(rule.add, seen);

        return joined(seen);

    };
    const made = ( picked: Picked<A> & { className?: ClassValue | undefined } = {} ): string => {

        const asked = (typeof picked === "object" && picked !== null ? picked : {}) as Readonly<Record<string, unknown>>;
        const extra = asked.className;
        let key = 0;

        for ( let at = 0; at < plans.length; at += 1 ) {

            const plan = plans[at] as Plan;
            const own = asked[plan.name];
            const chosen = own === undefined || own === null ? plan.fallback : pick(plan, own);

            picks[at] = chosen;
            key = key * plan.added.length + chosen;

        }

        let found = safe ? memo.get(key) : undefined;

        if ( found === undefined ) {

            found = mixed();

            if ( safe && memo.size < held ) memo.set(key, found);

        }

        return extra === undefined || extra === null || extra === false || extra === "" ? found : classes(found, extra as ClassValue);

    };

    return Object.assign(made, {
        axes,
        defaults,
        options: ( axis: keyof A ): string[] => (Object.hasOwn(axes, axis) ? Object.keys(axes[axis] ?? {}) : []),
    });

}
export function states ( flags: Readonly<Record<string, boolean | string | number | null | undefined>> ): Record<`data-${string}`, string> {

    const out: Record<`data-${string}`, string> = {};

    for ( const name of Object.keys(flags) ) {

        const value = flags[name];
        const key = plain.test(name) ? name : string.kebab(name);

        if ( key === "" ) continue;

        if ( value === true ) out[`data-${key}`] = "";
        else if ( typeof value === "string" ) out[`data-${key}`] = value;
        else if ( typeof value === "number" && Number.isFinite(value) ) out[`data-${key}`] = String(value);

    }

    return out;

}
