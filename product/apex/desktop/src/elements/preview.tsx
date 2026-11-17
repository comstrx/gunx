"use client";

import { useEffect, useRef } from "react";
import type { PreviewProps } from "@/elements/contract.ts";

const look = "aspect-video w-full rounded-[var(--radius-md)] border border-line bg-surface-sunken object-cover";

export function Preview ({ stream, label }: PreviewProps ) {

    const node = useRef<HTMLVideoElement>(null);

    useEffect(() => {

        const shown = node.current;

        if ( shown ) shown.srcObject = (stream ?? null) as MediaProvider | null;

        return () => {

            if ( shown ) shown.srcObject = null;

        };

    }, [stream]);

    return <video ref={node} className={look} data-ui="preview" aria-label={label} autoPlay muted playsInline />;

}
