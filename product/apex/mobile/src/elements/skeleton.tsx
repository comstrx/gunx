import { StyleSheet, View } from "react-native";
import type { SkeletonProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";

const sizes = StyleSheet.create({ text: { height: 16 }, title: { height: 28 }, display: { height: 44 } });
const widths = StyleSheet.create({ third: { width: "33%" }, half: { width: "50%" }, most: { width: "66%" }, full: { width: "100%" } });

export function Skeleton ({ size = "text", width = "full" }: SkeletonProps ) {

    const { palette, radius } = useTheme();

    return <View aria-hidden testID={`skeleton-${size}-${width}`} style={[sizes[size], widths[width], { borderRadius: radius.md, backgroundColor: palette.surfaceSunken }]} />;

}
