"use client";

import * as device from "engine/device";
import * as json from "engine/json";
import type * as spec from "engine/spec";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Nav } from "@/app/nav.tsx";
import { Screen } from "@/app/screen.tsx";
import { Block } from "@/elements/block.tsx";
import { navigate, redirect, usePath } from "@/hooks/use-path.ts";
import { useActive } from "@/hooks/use-session.ts";
import { useShield } from "@/hooks/use-shield.ts";
import { host } from "@/specs/app.ts";
import type { ScreenProps } from "@/specs/part.ts";
import { passing, shared } from "@/stores/box.ts";
import { live } from "@/stores/live.ts";
import { instance } from "@/stores/preferences.ts";
import { carried } from "@/stores/session.ts";
import { scheme } from "@/styles/theme.ts";

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
export function Shell ({ path }: { path: string } ) {

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

            setSettled(true);
            setTimeout(unveil, 0);

        });

    }, []);
    useEffect(() => {

        if ( restored.current ) void shared.set("active", active).catch(( caught: unknown ) => host.app.report(caught, "surface.remember"));

    }, [active]);

    useEffect(() => {

        if ( lost ) redirect(home);

    }, [lost, home]);

    return (
        <React.Fragment key={active}>
            <Nav path={path} />
            <Block as="main" gap="none" height="screen" width={frame.width}>
                <Screen path={path} />
            </Block>
        </React.Fragment>
    );

}
