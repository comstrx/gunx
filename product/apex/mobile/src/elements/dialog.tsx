import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { DialogProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";
import { paddings, radius } from "@/styles/tokens.ts";

const widths = { sm: 448, md: 640, lg: 896 } as const;
const base = StyleSheet.create({
    scrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: paddings.md },
    filled: { flex: 1 },
    sheet: { width: "100%", borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
    whole: { flex: 1, width: "100%" },
    mark: { position: "absolute", top: 8, end: 8, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.md, zIndex: 1 },
});

export function Dialog ({ children, open, kind = "plain", size = "sm", label, labelledBy, closeLabel, onDismiss }: DialogProps ) {

    const { palette, direction } = useTheme();
    const full = size === "full";

    return (
        <Modal visible={open} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onDismiss}>
            <View style={[full ? base.filled : base.scrim, { backgroundColor: palette.scrim }]}>
                <View
                    role={kind === "alert" ? "alertdialog" : "dialog"}
                    aria-modal
                    aria-label={label}
                    aria-labelledby={labelledBy}
                    testID={`dialog-${kind}`}
                    style={[full ? base.whole : [base.sheet, { maxWidth: widths[size] }], { backgroundColor: palette.surfaceRaised, borderColor: palette.line, direction, boxShadow: [{ offsetX: 0, offsetY: 16, blurRadius: 40, spreadDistance: -16, color: palette.shade }] }]}
                >
                    {closeLabel ? <Pressable role="button" aria-label={closeLabel} testID="dialog-close" onPress={onDismiss} style={base.mark}><Text style={{ color: palette.inkMuted, fontSize: 20 }}>×</Text></Pressable> : null}
                    {children}
                </View>
            </View>
        </Modal>
    );

}
