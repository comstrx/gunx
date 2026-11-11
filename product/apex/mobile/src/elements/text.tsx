import { Text as Native, StyleSheet } from "react-native";
import type { TextProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";

const sizes = StyleSheet.create({ sm: { fontSize: 14, lineHeight: 24 }, md: { fontSize: 16, lineHeight: 28 }, lg: { fontSize: 18, lineHeight: 28 } });
const weights = StyleSheet.create({ regular: { fontWeight: "400" }, medium: { fontWeight: "500" }, bold: { fontWeight: "600" } });

export function Text ({ children, tone = "default", size = "md", weight = "regular", live }: TextProps ) {

    const { palette } = useTheme();
    const color = tone === "muted" ? palette.inkMuted : tone === "danger" ? palette.danger : tone === "success" ? palette.success : palette.ink;

    return (
        <Native aria-live={live} testID={`text-${tone}-${size}`} style={[sizes[size], weights[weight], { color }]}>
            {children}
        </Native>
    );

}
