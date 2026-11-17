"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Text } from "@/elements/text.tsx";
import type { Placed } from "@/features/index.ts";
import { useNotices } from "@/features/notices/hooks/use-notices.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";

export function Notices ({ id }: Placed ) {

    const notices = useNotices(id);
    const { locale } = usePreferences();
    const text = host.app.labels(locale, "notices");
    const labelId = useId();

    return (
        <Block as="section" surface="raised" padding="md" gap="sm" width="reading" labelledBy={labelId} busy={notices.status === "pending"}>
            <Block direction="row" gap="sm" justify="between" align="center" wrap>
                <Heading level={2} look="section" id={labelId}>{text.title}</Heading>
                {notices.total > 0 ? <Text size="sm" tone="muted" live="polite" isolate>{`${notices.rows.length} / ${notices.total}`}</Text> : null}
            </Block>
            <Block direction="row" gap="xs" wrap>
                <Button look="soft" size="sm" pending={notices.pending} onPress={notices.test}>{text.test}</Button>
                {notices.alerts === "prompt" ? <Button look="ghost" size="sm" onPress={notices.allow}>{text.allow}</Button> : null}
            </Block>
            {notices.rows.length === 0 && notices.status !== "pending" ? <Text size="sm" tone="muted">{text.empty}</Text> : null}
            {notices.rows.map(( row ) => (
                <Block key={row.id} direction="row" gap="sm" justify="between" align="center">
                    <Block gap="none">
                        <Text weight={row.unread ? "bold" : undefined} isolate>{row.title}</Text>
                        <Text size="sm" tone="muted" isolate>{row.body}</Text>
                    </Block>
                    {row.unread ? <Button look="ghost" size="sm" onPress={() => notices.read(row.id)}>{text.read}</Button> : null}
                </Block>
            ))}
            {notices.alerts === "denied" ? <Text size="sm" tone="muted">{text.denied}</Text> : null}
            {notices.reason ? <Text size="sm" tone="danger" live="assertive">{`${text.failed} (${notices.reason})`}</Text> : null}
        </Block>
    );

}
