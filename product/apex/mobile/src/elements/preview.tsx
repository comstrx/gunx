import { StyleSheet } from "react-native";
import type { PreviewProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { isLens } from "@/render/host/lens.ts";
import { LensView } from "@/render/host/views.tsx";
import { sheeted } from "@/styles/globals.ts";

const stylesOf = sheeted(( radius ) => StyleSheet.create({ lens: { aspectRatio: 3 / 4, width: "100%", borderRadius: radius.md, overflow: "hidden" } }));

export function Preview ({ stream, label }: PreviewProps ) {

    const styles = stylesOf(useTheme().radius);

    return isLens(stream) ? <LensView lens={stream} label={label} style={styles.lens} /> : null;

}
