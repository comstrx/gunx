import { StyleSheet } from "react-native";
import type { PreviewProps } from "@/elements/contract.ts";
import { isLens } from "@/host/camera.ts";
import { LensView } from "@/host/views.tsx";
import { radius } from "@/styles/tokens.ts";

const styles = StyleSheet.create({ lens: { aspectRatio: 3 / 4, width: "100%", borderRadius: radius.md, overflow: "hidden" } });

export function Preview ({ stream, label }: PreviewProps ) {

    return isLens(stream) ? <LensView lens={stream} label={label} style={styles.lens} /> : null;

}
