import * as spec from "engine/spec";
import { useEffect } from "react";
import type { TitleProps } from "@/elements/contract.ts";

export function Title ({ text, meta }: TitleProps ) {

    useEffect(() => spec.publish(meta), [meta]);

    return <title>{text}</title>;

}
