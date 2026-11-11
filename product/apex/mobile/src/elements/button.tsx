import { useCallback } from "react";
import { ActivityIndicator, Pressable, type PressableStateCallbackType, StyleSheet, Text } from "react-native";
import type { ButtonProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";
import { radius } from "@/styles/tokens.ts";

const sizes = StyleSheet.create({ sm: { height: 36, paddingHorizontal: 12 }, md: { height: 44, paddingHorizontal: 16 }, lg: { height: 48, paddingHorizontal: 24 } });
const base = StyleSheet.create({
    shell: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md },
    full: { alignSelf: "stretch" },
    label: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
    large: { fontSize: 16, lineHeight: 24 },
});

export function Button ( props: ButtonProps ) {

    const { palette } = useTheme();
    const { look = "solid", size = "md", width = "auto", pending = false, disabled = false } = props;
    const off = disabled || pending;
    const fill = { solid: palette.brand, soft: palette.brandSoft, ghost: "transparent", danger: palette.danger }[look];
    const pressed = { solid: palette.brandStrong, soft: palette.brandSoftStrong, ghost: palette.surfaceSunken, danger: palette.dangerStrong }[look];
    const ink = { solid: palette.onBrand, soft: palette.brandStrong, ghost: palette.ink, danger: palette.onBrand }[look];
    const styled = useCallback(
        ( state: PressableStateCallbackType ) => [base.shell, sizes[size], width === "full" ? base.full : null, { backgroundColor: state.pressed ? pressed : fill, opacity: off ? 0.5 : 1 }],
        [size, width, pressed, fill, off],
    );

    return (
        <Pressable
            role="button"
            aria-label={props.label}
            aria-busy={pending || undefined}
            aria-disabled={off}
            disabled={off}
            onPress={props.onPress}
            testID={`button-${look}-${size}`}
            style={styled}
        >
            {pending ? <ActivityIndicator size="small" color={ink} /> : null}
            {props.children !== undefined ? <Text style={[base.label, size === "lg" ? base.large : null, { color: ink }]}>{props.children}</Text> : null}
        </Pressable>
    );

}
