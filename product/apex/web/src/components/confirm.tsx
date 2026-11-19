"use client";

import { useId, useState } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Dialog } from "@/elements/dialog.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Text } from "@/elements/text.tsx";
import { useAsked } from "@/hooks/use-session.ts";
import { host } from "@/specs/index.ts";

export type ConfirmProps = { locale: string };

function accept (): void {

    host.app.answer(true);

}
function refuse (): void {

    host.app.answer(false);

}
export function Confirm ({ locale }: ConfirmProps ) {

    const asking = useAsked();
    const [asked, setAsked] = useState(asking);

    if ( asking !== undefined && asking !== asked ) setAsked(asking);
    const text = host.app.labels(locale, "nav");
    const id = useId();

    return (
        <Dialog open={asking !== undefined} kind="alert" labelledBy={id} onDismiss={refuse}>
            <Block gap="lg" padding="lg">
                <Block gap="xs">
                    <Text tone="muted" size="sm">{text.confirm}</Text>
                    <Heading level={2} look="section" id={id}>{asked ? host.app.text(locale, asked.key) : ""}</Heading>
                </Block>
                <Block direction="row" gap="xs" justify="end">
                    <Button look="ghost" onPress={refuse}>{text.no}</Button>
                    <Button look="danger" onPress={accept}>{text.yes}</Button>
                </Block>
            </Block>
        </Dialog>
    );

}
