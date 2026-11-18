import { useCallback } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import type { LinkProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { sheeted } from "@/styles/globals.ts";

const baseOf = sheeted(( radius ) => StyleSheet.create({ button: { height: 44, paddingHorizontal: 16, borderRadius: radius.md, justifyContent: "center" }, label: { fontSize: 14, lineHeight: 20, fontWeight: "500" } }));

export function Link ({ children, href, external = false, look = "text", current = false, onNavigate }: LinkProps ) {

    const { palette, radius } = useTheme();
    const base = baseOf(radius);
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
