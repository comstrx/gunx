import { useCallback } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import type { LinkProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";
import { radius } from "@/styles/tokens.ts";

const base = StyleSheet.create({ button: { height: 44, paddingHorizontal: 16, borderRadius: radius.md, justifyContent: "center" }, label: { fontSize: 14, lineHeight: 20, fontWeight: "500" } });

export function Link ({ children, href, external = false, look = "text", current = false, onNavigate }: LinkProps ) {

    const { palette } = useTheme();
    const filled = look === "solid";
    const open = useCallback(() => {

        if ( onNavigate && !external ) onNavigate(href);
        else void Linking.openURL(href);

    }, [href, external, onNavigate]);

    return (
        <Pressable role="link" aria-current={current ? "page" : undefined} onPress={open} testID={`link-${look}`} style={look === "text" ? null : [base.button, { backgroundColor: filled ? palette.brand : current ? palette.brandSoft : "transparent" }]}>
            <Text style={[base.label, { color: filled ? palette.onBrand : palette.brandStrong, textDecorationLine: look === "text" ? "underline" : "none" }]}>{children}</Text>
        </Pressable>
    );

}
