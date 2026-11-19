"use client";

import { useId } from "react";
import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Heading } from "@/elements/heading.tsx";
import { Player } from "@/elements/player.tsx";
import { Preview } from "@/elements/preview.tsx";
import { Text } from "@/elements/text.tsx";
import type { Placed } from "@/features/index.ts";
import { useProbe } from "@/features/probe/hooks/use-probe.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host, tools } from "@/specs/index.ts";

export function Probe ({ id }: Placed ) {

    const probe = useProbe(id);
    const { locale } = usePreferences();
    const text = host.app.labels(locale, "probe");
    const labelId = useId();
    const { info } = probe;
    const facts = [
        [text.platform, [info.platform, info.os, info.version, info.browser, info.model].filter(Boolean).join(" · ")],
        [text.screen, `${info.width}×${info.height} @${info.pixelRatio} · ${info.orientation}`],
        [text.network, `${info.online ? text.online : text.offline} · ${info.network}`],
        [text.look, `${info.scheme} · ${info.language} · ${info.timeZone}`],
    ];

    return (
        <Block as="section" gap="md" width="reading" labelledBy={labelId}>
            <Heading level={2} look="title" id={labelId}>{text.title}</Heading>
            <Block surface="raised" padding="md" gap="xs">
                {facts.map(([name, value]) => (
                    <Block key={name} direction="row" gap="sm" justify="between" wrap>
                        <Text size="sm" tone="muted">{name}</Text>
                        <Text size="sm" isolate>{value}</Text>
                    </Block>
                ))}
            </Block>
            <Block surface="raised" padding="md" gap="sm">
                <Heading level={3} look="section">{text.permissions}</Heading>
                {probe.grants.map(( row ) => (
                    <Block key={row.permission} direction="row" gap="sm" align="center" justify="between" wrap>
                        <Text>{text[row.permission] ?? row.permission}</Text>
                        <Block direction="row" gap="sm" align="center" width="auto">
                            <Text size="sm" live="polite" tone={row.grant === "granted" ? "success" : row.grant === "prompt" ? "muted" : "danger"}>{text[row.grant] ?? row.grant}</Text>
                            <Button look="soft" size="sm" disabled={row.grant === "unsupported" || row.grant === "granted"} onPress={() => probe.ask(row.permission)} label={`${text.ask} ${text[row.permission] ?? row.permission}`}>{text.ask}</Button>
                        </Block>
                    </Block>
                ))}
            </Block>
            <Block surface="raised" padding="md" gap="sm">
                <Heading level={3} look="section">{text.tools}</Heading>
                {probe.stream === undefined ? null : <Preview stream={probe.stream} label={text.preview ?? ""} />}
                {probe.played === undefined || probe.stream !== undefined ? null : <Player file={probe.played} label={text.player ?? ""} />}
                {tools.map(( tool ) => (
                    <Block key={tool} direction="row" gap="sm" align="center" justify="between" wrap>
                        <Button look="ghost" size="sm" onPress={() => probe.run(tool, text.sample ?? "")}>{text[tool] ?? tool}</Button>
                        <Text size="sm" live="polite" tone={probe.results[tool] === "done" ? "success" : probe.results[tool] === undefined ? "muted" : "danger"}>{probe.picked[tool] || (text[probe.results[tool] ?? "idle"] ?? "")}</Text>
                    </Block>
                ))}
            </Block>
        </Block>
    );

}
