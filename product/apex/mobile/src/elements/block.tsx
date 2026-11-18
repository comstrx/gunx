import { ScrollView, StyleSheet, View } from "react-native";
import type { BlockProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { heights, widths } from "@/styles/globals.ts";
import { gaps, paddings } from "@/styles/tokens.ts";

const aligns = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;
const justifies = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const roles = { div: undefined, section: "region", nav: "navigation", header: "banner", footer: "contentinfo", main: "main", aside: "complementary" } as const;

export function Block ( props: BlockProps ) {

    const { palette, direction: dir, radius } = useTheme();
    const { as = "div", direction = "column", gap = "md", padding = "none", surface = "plain", width = "auto", height = "auto", wrap = false } = props;
    const raised = surface === "raised"
        ? { backgroundColor: palette.surfaceRaised, borderColor: palette.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, boxShadow: [{ offsetX: 0, offsetY: 12, blurRadius: 32, spreadDistance: -16, color: palette.shade }] }
        : undefined;
    const layout = {
        flexDirection: direction,
        flexWrap: wrap ? ("wrap" as const) : ("nowrap" as const),
        gap: gaps[gap],
        padding: paddings[padding],
        alignItems: props.align ? aligns[props.align] : undefined,
        justifyContent: props.justify ? justifies[props.justify] : undefined,
        direction: dir,
    };

    if ( as === "main" ) return (
        <ScrollView nativeID={props.id} role="main" aria-label={props.label} testID="block-main" style={heights.screen} contentContainerStyle={[layout, widths[width], { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
            {props.children}
        </ScrollView>
    );

    return (
        <View
            nativeID={props.id}
            role={roles[as]}
            aria-label={props.label}
            aria-labelledby={props.labelledBy}
            aria-live={props.live}
            aria-busy={props.busy || undefined}
            testID={`block-${direction}-${surface}`}
            style={[layout, widths[width], heights[height], raised]}
        >
            {props.children}
        </View>
    );

}
