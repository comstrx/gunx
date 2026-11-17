"use client";

import * as geo from "engine/geo";
import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Image } from "@/elements/image.tsx";
import { Text } from "@/elements/text.tsx";
import type { Placed } from "@/features/index.ts";
import { useLocate } from "@/features/locate/hooks/use-locate.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";

export function Locate ({ id }: Placed ) {

    const located = useLocate(id);
    const { locale } = usePreferences();
    const text = host.app.labels(locale, "locate");
    const labelId = useId();
    const { position, track } = located;

    return (
        <Block as="section" gap="md" width="reading" labelledBy={labelId}>
            <Heading level={2} look="title" id={labelId}>{text.title}</Heading>
            <Block surface="raised" padding="md" gap="sm">
                <Text live="polite" weight="bold" isolate>{position ? geo.format(position) : text[located.status] ?? text.idle}</Text>
                {position ? <Text size="sm" tone="muted">{`${text.accuracy} ${Math.round(position.accuracy)} m · ${text.points} ${track.points.length} · ${text.walked} ${Math.round(track.meters)} m`}</Text> : null}
                {located.status === "failed" ? <Text size="sm" tone="danger" live="assertive">{`${text.failed} (${located.reason ?? ""})`}</Text> : null}
                {located.map ? <Image src={located.map} alt={text.map ?? ""} ratio="wide" /> : position ? <Text size="sm" tone="muted">{text.nokey}</Text> : null}
                <Block direction="row" gap="xs" wrap>
                    <Button look="solid" size="sm" pending={located.status === "finding"} onPress={located.find}>{text.find}</Button>
                    <Button look="soft" size="sm" disabled={located.status === "following"} onPress={located.follow}>{text.follow}</Button>
                    <Button look="ghost" size="sm" disabled={located.status !== "following"} onPress={located.stop}>{text.stop}</Button>
                </Block>
            </Block>
        </Block>
    );

}
