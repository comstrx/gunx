"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Image } from "@/elements/image.tsx";
import { Input } from "@/elements/input.tsx";
import { Text } from "@/elements/text.tsx";
import { useAccount } from "@/features/account/hooks/use-account.ts";
import type { Placed } from "@/features/index.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";

export function Account ({ id }: Placed ) {

    const account = useAccount(id);
    const { locale } = usePreferences();
    const text = host.app.labels(locale, "account");
    const labelId = useId();
    const { user } = account;

    return (
        <Block as="section" surface="raised" padding="md" gap="sm" width="reading" labelledBy={labelId} busy={account.pending}>
            <Heading level={2} look="section" id={labelId}>{user ? text.signed : text.title}</Heading>
            {user ? (
                <>
                    <Block direction="row" gap="sm" align="center">
                        {account.photo ? <Image src={account.photo} alt={text.photoAlt ?? ""} ratio="avatar" /> : null}
                        <Block gap="none">
                            <Text isolate>{`${user.name} · ${user.email}`}</Text>
                            <Text size="sm" tone="muted" isolate>{`${text.roles} ${user.roles.join(", ") || text.none}`}</Text>
                        </Block>
                    </Block>
                    {account.greeting ? <Text live="polite" weight="bold">{account.greeting}</Text> : null}
                    <Block direction="row" gap="xs" wrap>
                        <Button look="soft" size="sm" pending={account.pending} onPress={account.greet}>{text.greet}</Button>
                        {account.picks ? <Button look="ghost" size="sm" onPress={account.choose}>{account.photo ? text.photoChange : text.photoAdd}</Button> : null}
                        {account.photo ? <Button look="ghost" size="sm" onPress={account.unphoto}>{text.photoRemove}</Button> : null}
                        <Button look="ghost" size="sm" onPress={account.leave}>{text.leave}</Button>
                    </Block>
                </>
            ) : (
                <>
                    <Text size="sm" tone="muted">{account.step === "email" ? text.hint : text.sent}</Text>
                    {account.step === "email"
                        ? <Input kind="email" label={text.email ?? ""} value={account.email} onChange={account.setEmail} />
                        : <Input kind="code" label={text.code ?? ""} value={account.code} onChange={account.setCode} />}
                    <Block direction="row" gap="xs" wrap>
                        {account.step === "email"
                            ? <Button look="solid" size="sm" pending={account.pending} disabled={account.email.trim() === ""} onPress={account.send}>{text.send}</Button>
                            : <Button look="solid" size="sm" pending={account.pending} disabled={account.code.trim().length !== 6} onPress={account.enter}>{text.enter}</Button>}
                    </Block>
                </>
            )}
            {account.reason ? <Text size="sm" tone="danger" live="assertive">{`${text.failed} (${account.reason})`}</Text> : null}
        </Block>
    );

}
