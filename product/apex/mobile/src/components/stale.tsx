"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Dialog } from "@/elements/dialog.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Text } from "@/elements/text.tsx";
import { useStale } from "@/hooks/use-stale.ts";
import { labels } from "@/specs/runtime.ts";
import type { Locale } from "@/types/index.ts";

export type StaleProps = { locale: Locale };

export function Stale ({ locale }: StaleProps ) {

    const { stale, dismiss, reload } = useStale();
    const text = labels(locale, "nav");
    const id = useId();

    return (
        <Dialog open={stale} kind="alert" labelledBy={id} onDismiss={dismiss}>
            <Block gap="lg" padding="lg">
                <Block gap="xs">
                    <Heading level={2} look="section" id={id}>{text.stale}</Heading>
                    <Text tone="muted" size="sm">{text.staleHint}</Text>
                </Block>
                <Block direction="row" gap="xs" justify="end">
                    <Button look="ghost" onPress={dismiss}>{text.later}</Button>
                    <Button look="solid" onPress={reload}>{text.reload}</Button>
                </Block>
            </Block>
        </Dialog>
    );

}
