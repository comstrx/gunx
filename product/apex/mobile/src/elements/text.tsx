import * as string from "engine/string";
import { Text as Native } from "react-native";
import type { TextProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { texts, weights } from "@/styles/elements.ts";


export function Text ({ children, tone = "default", size = "md", weight = "regular", live, isolate = false }: TextProps ) {

    const { palette } = useTheme();
    const color = tone === "muted" ? palette.inkMuted : tone === "danger" ? palette.danger : tone === "success" ? palette.success : palette.ink;

    return (
        <Native aria-live={live} testID={`text-${tone}-${size}`} style={[texts[size], weights[weight], { color, flexShrink: 1 }]}>
            {isolate && (typeof children === "string" || typeof children === "number") ? string.isolate(String(children)) : children}
        </Native>
    );

}
