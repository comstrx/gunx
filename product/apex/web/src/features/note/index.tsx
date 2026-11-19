"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Text } from "@/elements/text.tsx";
import type { Placed } from "@/features/index.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/index.ts";

export function Note ({ id }: Placed ) {

    const { live, screen } = useStage();
    const { locale } = usePreferences();
    const settings = live.settings(screen, id);
    const labelId = useId();

    return (
        <Block as="section" gap="sm" width="reading" labelledBy={labelId}>
            <Heading level={2} look="title" id={labelId}>{host.app.text(locale, String(settings.title))}</Heading>
            {typeof settings.body === "string" ? <Text tone="muted">{host.app.text(locale, settings.body)}</Text> : null}
        </Block>
    );

}
