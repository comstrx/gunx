import * as event from "engine-event";
import { type Form, root } from "./form.ts";

export type Steps = readonly (readonly string[])[];
export type StepState = { index: number; total: number; fields: readonly string[]; first: boolean; last: boolean; done: boolean };
export type Stepper = {
    state: () => StepState;
    index: () => number;
    fields: () => readonly string[];
    first: () => boolean;
    last: () => boolean;
    done: () => boolean;
    total: () => number;
    valid: () => boolean;
    next: () => boolean;
    back: () => void;
    go: ( index: number ) => void;
    watch: ( listener: ( state: StepState ) => void ) => () => void;
};

function stateOf ( steps: Steps, index: number ): StepState {

    return { index, total: steps.length, fields: steps[index] ?? [], first: index <= 0, last: index >= steps.length - 1, done: index >= steps.length };

}
export function stepper<V extends object, O, R> ( form: Form<V, O, R>, steps: Steps ): Stepper {

    const state = event.signal<StepState>(stateOf(steps, 0), ( a, b ) => a.index === b.index);
    const valid = (): boolean => {

        const { fields, last } = state.get();
        const wanted = last ? [...fields, root] : fields;

        form.check(wanted);

        return form.valid(wanted);

    };

    return {
        state: state.get,
        index: () => state.get().index,
        fields: () => state.get().fields,
        first: () => state.get().first,
        last: () => state.get().last,
        done: () => state.get().done,
        total: () => steps.length,
        valid,
        next: () => {

            if ( !valid() ) return false;

            state.set(stateOf(steps, Math.min(steps.length, state.get().index + 1)));

            return true;

        },
        back: () => state.set(stateOf(steps, Math.max(0, state.get().index - 1))),
        go: ( index ) => state.set(stateOf(steps, Math.max(0, Math.min(steps.length, Math.trunc(index) || 0)))),
        watch: ( listener ) => state.watch(( value ) => listener(value)),
    };

}
