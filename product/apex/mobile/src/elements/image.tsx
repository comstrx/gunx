import { Image as Picture, StyleSheet } from "react-native";
import type { ImageProps } from "@/elements/contract.ts";
import { useTheme } from "@/styles/theme.ts";
import { radius } from "@/styles/tokens.ts";

const ratios = StyleSheet.create({ wide: { aspectRatio: 2, width: "100%", borderRadius: radius.md }, square: { aspectRatio: 1, width: "100%", borderRadius: radius.md }, avatar: { width: 56, height: 56, borderRadius: 28 } });

export function Image ({ src, alt, ratio = "wide" }: ImageProps ) {

    const { palette } = useTheme();

    return <Picture source={{ uri: src }} accessibilityLabel={alt} resizeMode="cover" testID={`image-${ratio}`} style={[ratios[ratio], { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, backgroundColor: palette.surfaceSunken }]} />;

}
