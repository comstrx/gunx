import { useEffect } from "react";
import { host } from "@/specs/index.ts";

export function useShield ( wanted: boolean ): void {

    useEffect(() => {

        if ( !wanted ) return undefined;

        let live = true;
        let lower: (() => void) | undefined;

        void import("@/stores/device.ts").then(( device ) => device.held().shield()).then(( made ) => {

            if ( live ) lower = made;
            else made?.();

        }).catch(( caught: unknown ) => host.app.report(caught, "surface.shield"));

        return () => {

            live = false;
            lower?.();

        };

    }, [wanted]);

}
