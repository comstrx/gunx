"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Link } from "@/elements/link.tsx";
import { Text } from "@/elements/text.tsx";
import { navigate } from "@/hooks/use-path.ts";
import { useMenu } from "@/hooks/use-session.ts";
import { labels } from "@/specs/runtime.ts";
import type { Locale } from "@/types/index.ts";

export type DeniedProps = { locale: Locale; at: string; page: string };

export function Denied ({ locale, at, page }: DeniedProps ) {

    const text = labels(locale, "nav");
    const [first] = useMenu(locale, at);
    const id = useId();

    return (
        <Block align="center" justify="center" padding="md" height="screen">
            <Block as="section" surface="raised" padding="lg" gap="lg" width="reading" labelledBy={id}>
                <Heading level={2} look="eyebrow">{page}</Heading>
                <Block gap="sm">
                    <Heading level={1} look="title" id={id}>{text.denied}</Heading>
                    <Text tone="muted">{text.deniedHint}</Text>
                </Block>
                {first ? <Block direction="row"><Link href={first.path} look="solid" onNavigate={navigate}>{first.title}</Link></Block> : null}
            </Block>
        </Block>
    );

}
