import type * as device from "engine/device";
import * as exception from "engine/exception";
import * as json from "engine/json";
import * as state from "engine/state";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Status } from "@/api/index.ts";
import { type Notice, transport } from "@/api/notices.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { bind } from "@/stores/bind.ts";
import { client } from "@/stores/client.ts";
import { held } from "@/stores/device.ts";

export type Notices = {
    status: Status;
    rows: readonly Notice[];
    total: number;
    reason: string | undefined;
    alerts: device.Grant | undefined;
    pending: boolean;
    test: () => void;
    read: ( notice: string ) => void;
    allow: () => void;
};

type Listed = { rows: Notice[]; total: number };

function alert ( data: unknown, id: string ): void {

    const unit = held();

    if ( !json.isRecord(data) || typeof data.title !== "string" || !unit.can("notify") ) return;

    void Promise.resolve(unit.state("notifications")).then(( grant ) => (grant === "granted" ? unit.notify({ title: String(data.title), body: typeof data.body === "string" ? data.body : undefined, tag: typeof data.id === "string" ? data.id : id }) : false)).catch(( caught: unknown ) => host.app.report(caught, `${id}.alert`));

}
export function useNotices ( id = "notices" ): Notices {

    const { live, screen } = useStage();
    const { bus } = host.app;
    const call = client();
    const asked = live.settings(screen, id).limit;
    const limit = typeof asked === "number" ? asked : 5;
    const resource = useMemo(() => state.resource<Listed>({
        load: async ( signal ) => {

            const reply = await call.call(transport.list, { limit }, { signal, fresh: true, budget: 8000 });

            return { rows: reply.data, total: reply.page?.total ?? reply.data.length };

        },
    }), [call, limit]);
    const shown = useMemo(() => bind(resource), [resource]).useState();
    const [alerts, setAlerts] = useState<device.Grant>();
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState<string>();
    const told = useCallback(( caught: unknown, where: string ) => {

        setFailed(exception.of(caught).code);
        host.app.report(caught, `${id}.${where}`);

    }, [id]);

    useEffect(() => {

        void resource.refresh();
        void Promise.resolve(held().state("notifications")).then(setAlerts).catch(( caught: unknown ) => host.app.report(caught, `${id}.state`));

        const stops = [
            live.handle(`${id}.refresh`, () => {

                void resource.refresh();

            }),
            bus.subscribe("notifications.created", ( data ) => alert(data, id)),
        ];

        return () => {

            for ( const stop of stops ) stop();

            resource.abort();

        };

    }, [resource, live, bus, id]);

    return {
        status: shown.status,
        rows: shown.data?.rows ?? [],
        total: shown.data?.total ?? 0,
        reason: failed ?? (shown.error === undefined ? undefined : exception.of(shown.error).code),
        alerts,
        pending,
        test: () => {

            setPending(true);
            setFailed(undefined);
            void call.call(transport.test, {}, { budget: 8000 }).then(() => resource.refresh()).catch(( caught: unknown ) => told(caught, "test")).finally(() => setPending(false));

        },
        read: ( notice ) => {

            setFailed(undefined);
            void call.call(transport.read, { notice }, { budget: 8000 }).then(() => resource.refresh()).catch(( caught: unknown ) => told(caught, "read"));

        },
        allow: () => {

            void held().ask("notifications").then(setAlerts).catch(( caught: unknown ) => told(caught, "allow"));

        },
    };

}
