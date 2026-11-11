import { StyleSheet, Text } from "react-native";
import type { HeadingProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";

const looks = StyleSheet.create({
    display: { fontSize: 36, lineHeight: 44, fontWeight: "600" },
    title: { fontSize: 24, lineHeight: 32, fontWeight: "600" },
    section: { fontSize: 18, lineHeight: 26, fontWeight: "600" },
    eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
});
const latin = StyleSheet.create({ display: { letterSpacing: -0.5 }, title: {}, section: {}, eyebrow: { letterSpacing: 0.8, textTransform: "uppercase" } });

export function Heading ({ children, level = 2, look, id }: HeadingProps ) {

    const { palette, direction } = useTheme();
    const chosen = look ?? (level === 1 ? "display" : level === 2 ? "title" : "section");

    return (
        <Text role="heading" aria-level={level} nativeID={id} testID={`heading-${chosen}`} style={[looks[chosen], direction === "ltr" ? latin[chosen] : null, { color: chosen === "eyebrow" ? palette.inkMuted : palette.ink }]}>
            {children}
        </Text>
    );

}
