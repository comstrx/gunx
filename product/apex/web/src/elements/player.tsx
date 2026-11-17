"use client";

import * as media from "engine/media";
import { useEffect, useState } from "react";
import type { PlayerProps } from "@/elements/contract.ts";

const film = "aspect-video w-full rounded-[var(--radius-md)] border border-line bg-surface-sunken";
const sound = "w-full";

export function Player ({ file, label, captions }: PlayerProps ) {

    const [url, setUrl] = useState("");

    useEffect(() => {

        const made = media.link(file);

        setUrl(made.url);

        return made.release;

    }, [file]);

    if ( url === "" ) return null;

    const words = captions ? { src: captions } : {};

    if ( media.kindOf(file.type) === "audio" ) return (
        <audio className={sound} data-ui="player" aria-label={label} src={url} controls>
            <track kind="captions" label={label} {...words} />
        </audio>
    );

    return (
        <video className={film} data-ui="player" aria-label={label} src={url} controls playsInline>
            <track kind="captions" label={label} {...words} />
        </video>
    );

}
