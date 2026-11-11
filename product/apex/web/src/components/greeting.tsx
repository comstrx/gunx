"use client";

import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Skeleton } from "@/elements/skeleton.tsx";
import { Text } from "@/elements/text.tsx";
import { useGreeting } from "@/hooks/use-greeting.ts";
import type { Status } from "@/types/index.ts";

export type GreetingProps = { status: Status; message: string | undefined; onRefresh: () => void };

export function Greeting ({ status, message, onRefresh }: GreetingProps ) {

    const view = useGreeting();
    const waiting = status === "idle" || status === "pending";

    return (
        <Block as="section" surface="raised" padding="lg" gap="lg" width="reading" labelledBy={view.labelId} busy={waiting}>
            <Heading level={2} look="eyebrow" id={view.labelId}>
                {view.text.eyebrow}
            </Heading>
            <Block gap="sm" live="polite">
                {status === "done" && message ? <Heading level={1}>{message}</Heading> : null}
                {waiting ? <Skeleton size="display" width="most" /> : null}
                {waiting ? <Text tone="muted" size="sm">{view.text.loading}</Text> : null}
                {status === "failed" ? <Heading level={1} look="title">{view.text.failed}</Heading> : null}
                {status === "failed" ? <Text tone="muted" size="sm">{view.text.hint}</Text> : null}
            </Block>
            <Block direction="row" gap="sm" wrap>
                <Button look={status === "failed" ? "solid" : "soft"} pending={status === "pending"} onPress={onRefresh}>
                    {status === "failed" ? view.text.retry : view.text.refresh}
                </Button>
                <Button look="ghost" onPress={view.toggleLocale}>
                    {view.text.switch}
                </Button>
            </Block>
        </Block>
    );

}
