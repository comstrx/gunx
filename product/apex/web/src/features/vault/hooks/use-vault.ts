import { useCallback, useEffect, useState } from "react";
import { type Kind, kinds } from "@/api/vault.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { bump, clear, count, expire, shelf } from "@/stores/vault.ts";

export type Row = { kind: Kind; volatile: boolean; count: number | undefined };
export type Vault = { rows: Row[]; seconds: number; bump: ( kind: Kind ) => void; expire: ( kind: Kind ) => void; clear: ( kind: Kind ) => void };

export function useVault ( id = "vault" ): Vault {

    const { live, screen } = useStage();
    const settings = live.settings(screen, id);
    const chosen = kinds.filter(( kind ) => !Array.isArray(settings.kinds) || settings.kinds.includes(kind));
    const seconds = typeof settings.seconds === "number" ? settings.seconds : 5;
    const [counts, setCounts] = useState<Partial<Record<Kind, number>>>({});
    const read = useCallback(( kind: Kind ) => count(kind).then(( found ) => {

        setCounts(( held ) => ({ ...held, [kind]: found }));

        return found;

    }).catch(( caught: unknown ) => host.app.report(caught, `${id}.read`)), [id]);

    useEffect(() => {

        for ( const kind of kinds ) void read(kind);

    }, [read]);

    function run ( work: Promise<unknown>, kind: Kind, verb: string ): void {

        void work.then(() => read(kind)).then(( found ) => live.set("signals.stored", { kind, count: found ?? null })).catch(( caught: unknown ) => host.app.report(caught, `${id}.${verb}`));

    }

    return {
        rows: chosen.map(( kind ) => ({ kind, volatile: shelf(kind).volatile, count: counts[kind] })),
        seconds,
        bump: ( kind ) => run(bump(kind), kind, "bump"),
        expire: ( kind ) => {

            run(expire(kind, seconds), kind, "expire");
            setTimeout(() => void read(kind), seconds * 1000 + 150);

        },
        clear: ( kind ) => run(clear(kind), kind, "clear"),
    };

}
