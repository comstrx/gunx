import { StyleSheet } from "react-native";

export const headings = StyleSheet.create({
    display: { fontSize: 36, lineHeight: 44, fontWeight: "600" },
    title: { fontSize: 24, lineHeight: 32, fontWeight: "600" },
    section: { fontSize: 18, lineHeight: 26, fontWeight: "600" },
    eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
});
export const latin = StyleSheet.create({ display: { letterSpacing: -0.5 }, title: {}, section: {}, eyebrow: { letterSpacing: 0.8, textTransform: "uppercase" } });
export const texts = StyleSheet.create({ sm: { fontSize: 14, lineHeight: 24 }, md: { fontSize: 16, lineHeight: 28 }, lg: { fontSize: 18, lineHeight: 28 } });
export const weights = StyleSheet.create({ regular: { fontWeight: "400" }, medium: { fontWeight: "500" }, bold: { fontWeight: "600" } });
