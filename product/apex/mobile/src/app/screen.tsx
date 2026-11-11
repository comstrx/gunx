"use client";

import type * as spec from "engine/spec";
import { useEffect, useMemo } from "react";
import { Confirm } from "@/components/confirm.tsx";
import { Denied } from "@/components/denied.tsx";
import { Stale } from "@/components/stale.tsx";
import { Block } from "@/elements/block.tsx";
import { Title } from "@/elements/title.tsx";
import { registry } from "@/features/index.ts";
import { usePath, useQuery } from "@/hooks/use-path.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useOpens, useVisible } from "@/hooks/use-session.ts";
import { answer, compiled, live, report, screenAt, title, titleOf } from "@/specs/runtime.ts";
import type { StackProps } from "@/specs/surface.ts";

type Keyed = { block: spec.Block; key: string };

function keyed ( blocks: readonly spec.Block[], at: string ): Keyed[] {

    return blocks.map(( block, index ) => ({ block, key: `${at}.${index}` }));

}
function Placed ({ name }: { name: string } ) {

    const Feature = registry[name];
    const shown = useVisible(name);

    return Feature && shown ? <Feature /> : null;

}
function Piece ({ block, at }: { block: spec.Block; at: string } ) {

    if ( block.kind === "feature" ) return <Placed name={String(block.props.name)} />;

    return (
        <Block {...(block.props as StackProps)} id={block.id}>
            {keyed(block.children, at).map(( child ) => <Piece key={child.key} block={child.block} at={child.key} />)}
        </Block>
    );

}
export function Screen ({ path }: { path: string } ) {

    const at = usePath(path);
    const query = useQuery();
    const { locale } = usePreferences();
    const matched = useMemo(() => screenAt(at), [at]);
    const screen = matched ? compiled.byName[matched.screen.name] : undefined;
    const params = matched?.params;
    const open = useOpens(screen?.name);

    useEffect(() => {

        live.patch({ locale });

    }, [locale]);
    useEffect(() => {

        if ( !screen || !open ) return undefined;

        const mounted = live.mount(screen.name, { params, query }).catch(( caught: unknown ) => report(caught, `${screen.name}.mount`));

        return () => {

            answer(false);
            void mounted.then(( found ) => found?.unmount()).catch(( caught: unknown ) => report(caught, `${screen.name}.unmount`));

        };

    }, [screen, params, query, open]);

    if ( !screen ) return null;

    return (
        <>
            <Title text={titleOf(screen, locale)} />
            {open ? keyed(screen.blocks, screen.name).map(( child ) => <Piece key={child.key} block={child.block} at={child.key} />) : null}
            {open ? <Confirm locale={locale} /> : <Denied locale={locale} at={at} page={title(screen, locale)} />}
            <Stale locale={locale} />
        </>
    );

}
