import { report } from "@/specs/runtime.ts";
import { bind } from "@/stores/bind.ts";
import { faults, instance } from "@/stores/preferences.ts";

export type Stale = { stale: boolean; dismiss: () => void; reload: () => Promise<void> };

const watched = bind(faults);

export function dismiss (): void {

    faults.set(undefined);

}
export function reload (): Promise<void> {

    return import("engine/device").then(( device ) => (device.create(device.port.get()).reload() ? undefined : instance.reload())).catch(( caught: unknown ) => report(caught, "stale.reload"));

}
export function useStale (): Stale {

    const stale = watched.useSelect(( fault ) => fault?.reason === "state.newer");

    return { stale, dismiss, reload };

}
