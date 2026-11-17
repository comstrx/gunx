import * as json from "engine/json";
import type * as spec from "engine/spec";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { bind } from "@/stores/bind.ts";
import { session } from "@/stores/session.ts";
import type { Locale } from "@/types/index.ts";

type Bound = { session: ReturnType<typeof bind<spec.Context>>; viewing: ReturnType<typeof bind<spec.Visibility>> };

const bindings = new WeakMap<spec.Runtime, Bound>();
const surface = bind(host.active);
const asking = host.own(( app ) => bind(app.confirmations));
const stacked = host.own(( app ) => bind(app.popups));
const signing = host.own(() => bind(session().state));

function boundTo ( live: spec.Runtime ): Bound {

    const known = bindings.get(live);

    if ( known ) return known;

    const made: Bound = { session: bind(live.state), viewing: bind(live.view) };

    bindings.set(live, made);

    return made;

}

export function useSigning (): { ready: boolean; signed: boolean } {

    const state = signing().useState();

    return { ready: state.ready, signed: state.user !== null };

}
export function useActive (): string {

    return surface.useState();

}
export function useOpens ( screen: string | undefined ): boolean {

    const { live } = useStage();

    return boundTo(live).session.useSelect(() => screen !== undefined && live.opens(screen));

}
export function useVisible ( id: string ): boolean {

    const { live } = useStage();
    const placed = boundTo(live).viewing.useSelect(() => live.visible(id));

    return boundTo(live).session.useSelect(() => live.visible(id)) && placed;

}
export function useMenu ( locale: Locale, at: string ): spec.MenuItem[] {

    return boundTo(host.app.live).session.useSelect(() => host.app.menu(locale, at), json.equal);

}
export function useAsked (): spec.Asked | undefined {

    return asking().useState();

}
export function usePopups (): readonly spec.Popup[] {

    return stacked().useState();

}
