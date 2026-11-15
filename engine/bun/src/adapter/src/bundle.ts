import type { AnyPort, Bindings, Bundle, Ports } from "./arch.ts";
import { drain, scoped } from "./port.ts";
import { probe } from "./runtime.ts";

export function bundle<P extends Ports> ( ports: P ): Bundle<P> {

    const entries = Object.entries(ports) as [keyof P & string, AnyPort][];
    const use = ( bindings: Bindings<P> ): (() => void) => {

        const restores: (() => void)[] = [];
        const undo = (): void => drain(restores.splice(0).reverse());

        try {

            for ( const [key, port] of entries ) if ( Object.hasOwn(bindings, key) && bindings[key] !== undefined ) restores.push(port.use(bindings[key] as never));

        } catch ( caught ) {

            probe(undo);

            throw caught;

        }

        return undo;

    };

    return {
        ports,
        use,
        with: ( bindings, work ) => scoped(use(bindings), work),
        watch: ( listener ) => {

            const stops = entries.map(([, port]) => port.watch(listener));

            return () => drain(stops);

        },
        names: () => entries.map(([key]) => key).sort(),
        matrix: () => Object.fromEntries(entries.map(([key, port]) => [key, port.bound() ? "bound" : port.has() ? "fallback" : "unbound"])),
        missing: () => entries.filter(([, port]) => !port.has()).map(([key]) => key).sort(),
        reset: () => drain(entries.map(([, port]) => port.reset)),
    };

}
