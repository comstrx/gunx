import { useEffect, useRef } from "react";
import { navigator, useQuery } from "@/hooks/use-path.ts";
import { usePopups } from "@/hooks/use-session.ts";
import type { PopupProps } from "@/specs/index.ts";
import { host } from "@/specs/index.ts";

const key = "open";

export function useLinked (): void {

    const popups = usePopups();
    const query = useQuery();
    const asked = query[key];
    const wanted = typeof asked === "string" && asked !== "" ? asked : undefined;
    const shown = popups.findLast(( popup ) => (popup.props as PopupProps).url === true)?.path;
    const last = useRef<{ wanted: string | undefined; shown: string | undefined }>({ wanted: undefined, shown: undefined });

    useEffect(() => {

        const before = last.current;
        const { app } = host;

        last.current = { wanted, shown };

        if ( wanted !== before.wanted ) {

            if ( wanted !== undefined && wanted !== shown && app.screenAt(wanted) !== undefined ) void app.open(wanted, { url: true }).catch(( caught: unknown ) => app.report(caught, "popup.link"));
            else if ( wanted === undefined && shown !== undefined ) void app.close().catch(( caught: unknown ) => app.report(caught, "popup.link"));

            return;

        }

        if ( shown === before.shown || shown === wanted ) return;

        const { path } = navigator().current();
        const rest = Object.fromEntries(Object.entries(query).filter(([name]) => name !== key));

        if ( shown === undefined ) navigator().replace({ path, query: rest });
        else navigator().push({ path, query: { ...rest, [key]: shown } });

    }, [wanted, shown, query]);

}
