import { StyleSheet, View } from "react-native";
import type { BlockProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";
import { gaps, paddings, radius, reading } from "@/styles/tokens.ts";

const aligns = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;
const justifies = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const roles = { div: undefined, section: "region", nav: "navigation", header: "banner", footer: "contentinfo", main: "main", aside: "complementary" } as const;
const widths = StyleSheet.create({ auto: {}, full: { width: "100%" }, reading: { width: "100%", maxWidth: reading, alignSelf: "center" } });
const heights = StyleSheet.create({ auto: {}, screen: { flex: 1 } });

export function Block ( props: BlockProps ) {

    const { palette, direction: dir } = useTheme();
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
