import { Modal, StyleSheet, View } from "react-native";
import type { DialogProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";
import { paddings, radius } from "@/styles/tokens.ts";

const base = StyleSheet.create({
    scrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: paddings.md },
    sheet: { width: "100%", maxWidth: 448, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});

export function Dialog ({ children, open, kind = "plain", label, labelledBy, onDismiss }: DialogProps ) {

    const { palette, direction } = useTheme();

    return (
        <Modal visible={open} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onDismiss}>
            <View style={[base.scrim, { backgroundColor: palette.scrim }]}>
                <View
                    role={kind === "alert" ? "alertdialog" : "dialog"}
                    aria-modal
                    aria-label={label}
                    aria-labelledby={labelledBy}
                    testID={`dialog-${kind}`}
                    style={[base.sheet, { backgroundColor: palette.surfaceRaised, borderColor: palette.line, direction, boxShadow: [{ offsetX: 0, offsetY: 16, blurRadius: 40, spreadDistance: -16, color: palette.shade }] }]}
                >
                    {children}
                </View>
            </View>
        </Modal>
    );

}
