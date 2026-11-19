import { useEffect } from "react";
import type { TitleProps } from "@/elements/contract.ts";
import { host } from "@/specs/index.ts";

export function Title ({ text, meta }: TitleProps ) {

    useEffect(() => host.app.publish(meta), [meta]);

    return <title>{text}</title>;

}
