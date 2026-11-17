"use client";

import type * as spec from "engine/spec";
import * as React from "react";
import { useEffect, useMemo } from "react";
import { Confirm } from "@/components/confirm.tsx";
import { Denied } from "@/components/denied.tsx";
import { Stale } from "@/components/stale.tsx";
import { Block } from "@/elements/block.tsx";
import { Dialog } from "@/elements/dialog.tsx";
import { Reveal } from "@/elements/reveal.tsx";
import { Title } from "@/elements/title.tsx";
import { registry } from "@/features/index.ts";
import { useLinked } from "@/hooks/use-linked.ts";
import { redirect, usePath, useQuery } from "@/hooks/use-path.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useLeaving } from "@/hooks/use-presence.ts";
import { useOpens, usePopups, useSigning, useVisible } from "@/hooks/use-session.ts";
import { StageContext, useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import type { PopupProps, StackProps } from "@/specs/part.ts";
import { motion } from "@/styles/tokens.ts";
import type { Locale } from "@/types/index.ts";

type Keyed = { block: spec.Block; key: string };

let moved = false;

function keyed ( blocks: readonly spec.Block[], at: string ): Keyed[] {

    return blocks.map(( block, index ) => ({ block, key: `${at}.${index}` }));

}
function dismiss (): void {

    void host.app.close();

}
function Placed ({ id }: { id: string } ) {

    const { live, screen } = useStage();
    const found = live.placed(screen, id);
    const Feature = found ? registry[found.name] : undefined;
    const shown = useVisible(id);

    if ( !Feature ) return null;
    if ( found?.when === undefined ) return shown ? <React.Suspense fallback={null}><Feature id={id} /></React.Suspense> : null;

    return <Reveal shown={shown}><React.Suspense fallback={null}><Feature id={id} /></React.Suspense></Reveal>;

}
function Piece ({ block, at }: { block: spec.Block; at: string } ) {

    if ( block.kind === "feature" ) return <Placed id={String(block.props.name)} />;

    return (
        <Block {...(block.props as StackProps)} id={block.id}>
            {keyed(block.children, at).map(( child ) => <Piece key={child.key} block={child.block} at={child.key} />)}
        </Block>
    );

}
function Board ({ screen, live }: { screen: spec.CompiledScreen; live: spec.Runtime } ) {

    const stage = useMemo(() => ({ live, screen: screen.name }), [live, screen]);

    return <StageContext value={stage}>{keyed(screen.blocks, screen.name).map(( child ) => <Piece key={child.key} block={child.block} at={child.key} />)}</StageContext>;

}
export function Popups ({ locale }: { locale: Locale } ) {

    const popups = useLeaving(usePopups(), motion.base);
    const text = host.app.labels(locale, "nav");

    useLinked();

    return popups.map(({ item: popup, open }) => (
        <Dialog key={popup.key} open={open} size={(popup.props as PopupProps).size ?? "md"} label={host.app.title(popup.screen, locale)} closeLabel={text.close} onDismiss={dismiss}>
            <Board screen={popup.screen} live={popup.live} />
        </Dialog>
    ));

}
export function Screen ({ path }: { path: string } ) {

    const at = usePath(path);
    const query = useQuery();
    const { locale } = usePreferences();
    const { app } = host;
    const matched = useMemo(() => app.screenAt(at), [at]);
    const screen = matched ? app.compiled.byName[matched.screen.name] : undefined;
    const params = matched?.params;
    const open = useOpens(screen?.name);
    const signing = useSigning();
    const guarded = screen !== undefined && (screen.auth || screen.guest);
    const away = guarded && signing.ready ? app.gate(screen) : undefined;
    const meta = useMemo(() => (screen ? app.meta(screen, locale) : undefined), [screen, locale]);

    useEffect(() => {

        app.live.patch({ locale });

    }, [locale]);
    useEffect(() => {

        moved = true;

    }, []);
    useEffect(() => {

        if ( !screen || !open ) return undefined;

        const mounted = app.live.mount(screen.name, { params, query }).catch(( caught: unknown ) => app.report(caught, `${screen.name}.mount`));

        return () => {

            app.answer(false);
            void mounted.then(( found ) => found?.unmount()).catch(( caught: unknown ) => app.report(caught, `${screen.name}.unmount`));

        };

    }, [screen, params, query, open]);

    useEffect(() => {

        if ( away !== undefined ) redirect(away);

    }, [away]);

    if ( !screen || (guarded && (!signing.ready || away !== undefined)) ) return null;

    return (
        <>
            <Title text={app.heading(screen, locale)} meta={meta} />
            {open ? <Reveal key={screen.name} fresh={moved} fill><Board screen={screen} live={app.live} /></Reveal> : null}
            {open ? <Popups locale={locale} /> : null}
            {open ? <Confirm locale={locale} /> : <Denied locale={locale} at={at} page={app.title(screen, locale)} />}
            <Stale locale={locale} />
        </>
    );

}
