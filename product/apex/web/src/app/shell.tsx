"use client";

import * as device from "engine/device";
import * as json from "engine/json";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Nav } from "@/app/nav.tsx";
import { Screen } from "@/app/screen.tsx";
import { Block } from "@/elements/block.tsx";
import { arrived, navigate, redirect, usePath, watched } from "@/hooks/use-path.ts";
import { Spoken } from "@/hooks/use-preferences.ts";
import { useActive } from "@/hooks/use-session.ts";
import { useShield } from "@/hooks/use-shield.ts";
import type * as spec from "@/specs/index.ts";
import type { ScreenProps } from "@/specs/index.ts";
import { host } from "@/specs/index.ts";
import { passing, shared } from "@/stores/box.ts";
import { live } from "@/stores/live.ts";
import { instance } from "@/stores/preferences.ts";
import { scheme } from "@/stores/scheme.ts";
import { carried } from "@/stores/session.ts";

host.bind({ live });

function reload ( path: string ): void {

    navigate(path);
    void passing.set("handed", { to: host.active.getState(), map: host.carried() }).then(() => import("@/stores/device.ts")).then(( device ) => device.reload()).catch(( caught: unknown ) => host.app.report(caught, "surface.reload"));

}
function unveil (): void {

    const root = device.host().document?.documentElement;

    if ( root?.dataset ) delete root.dataset.pending;

}
function carry ( _: unknown, asked: spec.Handing ): Record<string, unknown> {

    return { ...(asked.inherit ? { locale: instance().getState().locale, scheme: scheme().preference() } : {}), ...carried(asked.names) };

}
async function restore (): Promise<boolean> {

    const [saved, handed] = await Promise.all([shared.get<string>("active"), passing.pull<{ to?: unknown; map?: unknown }>("handed")]);

    if ( typeof saved !== "string" ) return false;

    const map = handed?.to === saved && json.isRecord(handed.map) ? handed.map : undefined;

    return saved === host.active.getState() && map === undefined ? false : host.resume(saved, map);

}
export function Shell ({ path, locale }: { path: string; locale?: string | undefined } ) {

    const active = useActive();
    const at = usePath(path);
    const restored = useRef(false);
    const [settled, setSettled] = useState(false);
    const found = host.app.screenAt(at);
    const frame: ScreenProps = found?.screen.settings ?? {};
    const lost = settled && found === undefined;

    useShield(frame.shield === true);
    const { home } = host.app;

    useEffect(() => host.bind({ navigate, reload, carry }), []);
    useEffect(watched, []);
    useEffect(() => {

        let stop: () => void = () => undefined;
        let live = true;

        void import("@/stores/device.ts").then(( device ) => {

            if ( live ) stop = device.linked(navigate);

        }).catch(( caught: unknown ) => host.app.report(caught, "surface.links"));

        return () => {

            live = false;
            stop();

        };

    }, []);
    useEffect(() => {

        void restore().catch(( caught: unknown ) => host.app.report(caught, "surface.restore")).finally(() => {

            restored.current = true;

            arrived();
            setSettled(true);
            setTimeout(unveil, 0);

        });

    }, []);
    useEffect(() => {

        if ( restored.current ) void shared.set("active", active).catch(( caught: unknown ) => host.app.report(caught, "surface.remember"));

    }, [active]);

    useEffect(() => {

        if ( !lost ) return;

        void host.owner(at).then(async ( name ) => {

            if ( name === undefined ) redirect(home);
            else await host.resume(name);

        }).catch(( caught: unknown ) => host.app.report(caught, "surface.lost"));

    }, [lost, at, home]);

    return (
        <Spoken value={locale}>
            <React.Fragment key={active}>
                <Nav path={path} />
                <Block as="main" gap="none" height="screen" width={frame.width}>
                    <Screen path={path} />
                </Block>
            </React.Fragment>
        </Spoken>
    );

}
