import * as json from "engine/json";
import type * as spec from "engine/spec";
import * as state from "engine/state";
import { type Asked, confirmations, live, menu } from "@/specs/runtime.ts";
import type { Locale } from "@/types/index.ts";

const session = state.bind(live.state);
const viewing = state.bind(live.view);
const asking = state.bind(confirmations);

export function useOpens ( screen: string | undefined ): boolean {

    return session.useSelect(() => screen !== undefined && live.opens(screen));

}
export function useVisible ( id: string ): boolean {

    const placed = viewing.useSelect(() => live.visible(id));

    return session.useSelect(() => live.visible(id)) && placed;

}
export function useMenu ( locale: Locale, at: string ): spec.MenuItem[] {

    return session.useSelect(() => menu(locale, at), json.equal);

}
export function useAsked (): Asked | undefined {

    return asking.useState();

}
