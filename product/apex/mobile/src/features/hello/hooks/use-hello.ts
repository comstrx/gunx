import * as exception from "engine/exception";
import * as state from "engine/state";
import { useEffect, useMemo } from "react";
import { type Greeting, type Tone, tones, transport } from "@/api/hello.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { bind } from "@/stores/bind.ts";
import { client } from "@/stores/client.ts";
import type { Status } from "@/types/index.ts";

export type Hello = { tone: Tone; status: Status; message: string | undefined; reason: string | undefined; refresh: () => void };

export function toneOf ( settings: Record<string, unknown> ): Tone {

    return tones.find(( tone ) => tone === settings.tone) ?? "plain";

}
export function useHello ( id = "hello" ): Hello {

    const { live, screen } = useStage();
    const { locale } = usePreferences();
    const { bus } = host.app;
    const call = client();
    const tone = toneOf(live.settings(screen, id));
    const loader = useMemo(() => {

        let fresh = false;
        const resource = state.resource<Greeting>({
            load: async ( signal ) => {

                const asked = fresh;

                fresh = false;

                const reply = await call.call(transport.world, { tone }, { signal, fresh: asked, budget: 8000, locale });

                bus.publish("hello.greeted", { tone, locale: reply.data.locale });

                return reply.data;

            },
        });

        return {
            resource,
            renew: () => {

                fresh = true;
                void resource.refresh();

            },
        };

    }, [locale, tone, call, bus]);
    const shown = useMemo(() => bind(loader.resource), [loader]).useState();

    useEffect(() => {

        void loader.resource.refresh();

        const stop = live.handle(`${id}.refresh`, () => {

            loader.renew();

        });

        return () => {

            stop();
            loader.resource.abort();

        };

    }, [loader, live, id]);

    return {
        tone,
        status: shown.status,
        message: shown.data?.message,
        reason: shown.error === undefined ? undefined : exception.of(shown.error).code,
        refresh: () => {

            void live.act(id, "refresh").catch(( caught: unknown ) => host.app.report(caught, `${id}.refresh`));

        },
    };

}
