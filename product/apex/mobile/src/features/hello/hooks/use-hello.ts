import * as error from "engine/error";
import * as state from "engine/state";
import { useEffect, useMemo } from "react";
import { type Greeting, type Tone, tones, transport } from "@/api/hello.ts";
import { createClient } from "@/api/index.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { compiled, live, report, settingsOf } from "@/specs/runtime.ts";
import type { Status } from "@/types/index.ts";

export type Hello = { tone: Tone; status: Status; message: string | undefined; reason: string | undefined; refresh: () => void };

export function toneOf ( settings: Record<string, unknown> ): Tone {

    return tones.find(( tone ) => tone === settings.tone) ?? "plain";

}
export function useHello ( screen = "hello" ): Hello {

    const { locale } = usePreferences();
    const tone = toneOf(settingsOf(screen, "hello"));
    const loader = useMemo(() => {

        const client = createClient({ baseUrl: compiled.address, locale: () => locale });
        let fresh = false;
        const resource = state.resource<Greeting>({
            load: async ( signal ) => {

                const asked = fresh;

                fresh = false;

                const reply = await client.call(transport.world, { tone }, { signal, fresh: asked });

                live.bus.publish("hello.greeted", { tone, locale: reply.data.locale });

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

    }, [locale, tone]);
    const shown = useMemo(() => state.bind(loader.resource), [loader]).useState();

    useEffect(() => {

        void loader.resource.refresh();

        const stop = live.handle("hello.refresh", () => {

            loader.renew();

        });

        return () => {

            stop();
            loader.resource.abort();

        };

    }, [loader]);

    return {
        tone,
        status: shown.status,
        message: shown.data?.message,
        reason: shown.error === undefined ? undefined : error.of(shown.error).code,
        refresh: () => {

            void live.act("hello", "refresh").catch(( caught: unknown ) => report(caught, "hello.refresh"));

        },
    };

}
