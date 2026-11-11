"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Dialog } from "@/elements/dialog.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Text } from "@/elements/text.tsx";
import { useAsked } from "@/hooks/use-session.ts";
import { answer, labels, textOf } from "@/specs/runtime.ts";
import type { Locale } from "@/types/index.ts";

export type ConfirmProps = { locale: Locale };

function accept (): void {

    answer(true);

}
function refuse (): void {

    answer(false);

}
export function Confirm ({ locale }: ConfirmProps ) {

    const asked = useAsked();
    const text = labels(locale, "nav");
    const id = useId();

    return (
        <Dialog open={asked !== undefined} kind="alert" labelledBy={id} onDismiss={refuse}>
            <Block gap="lg" padding="lg">
                <Block gap="xs">
                    <Text tone="muted" size="sm">{text.confirm}</Text>
                    <Heading level={2} look="section" id={id}>{asked ? textOf(locale, asked.key) : ""}</Heading>
                </Block>
                <Block direction="row" gap="xs" justify="end">
                    <Button look="ghost" onPress={refuse}>{text.no}</Button>
                    <Button look="danger" onPress={accept}>{text.yes}</Button>
                </Block>
            </Block>
        </Dialog>
    );

}
