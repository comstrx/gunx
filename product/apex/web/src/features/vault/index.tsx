"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Text } from "@/elements/text.tsx";
import type { Placed } from "@/features/index.ts";
import { useVault } from "@/features/vault/hooks/use-vault.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";

export function Vault ({ id }: Placed ) {

    const vault = useVault(id);
    const { locale } = usePreferences();
    const text = host.app.labels(locale, "vault");
    const labelId = useId();

    return (
        <Block as="section" gap="md" width="reading" labelledBy={labelId}>
            <Heading level={2} look="title" id={labelId}>{text.title}</Heading>
            <Text tone="muted">{text.body}</Text>
            {vault.rows.map(( row ) => (
                <Block key={row.kind} surface="raised" padding="md" gap="sm">
                    <Block direction="row" gap="sm" align="center" justify="between" wrap>
                        <Heading level={3} look="section">{text[row.kind] ?? row.kind}</Heading>
                        <Text size="sm" tone={row.volatile ? "danger" : "success"}>{row.volatile ? text.volatile : text.kept}</Text>
                    </Block>
                    <Text live="polite" weight="bold">{row.count === undefined ? text.empty : `${text.count} ${row.count}`}</Text>
                    <Block direction="row" gap="xs" wrap>
                        <Button look="soft" size="sm" onPress={() => vault.bump(row.kind)} label={`${text.bump} ${text[row.kind] ?? row.kind}`}>{text.bump}</Button>
                        <Button look="ghost" size="sm" onPress={() => vault.expire(row.kind)} label={`${text.expire} ${text[row.kind] ?? row.kind}`}>{text.expire}</Button>
                        <Button look="ghost" size="sm" onPress={() => vault.clear(row.kind)} label={`${text.clear} ${text[row.kind] ?? row.kind}`}>{text.clear}</Button>
                    </Block>
                </Block>
            ))}
        </Block>
    );

}
