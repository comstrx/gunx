import { Image as Picture, StyleSheet } from "react-native";
import type { ImageProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { sheeted } from "@/styles/globals.ts";

const ratiosOf = sheeted(( radius ) => StyleSheet.create({ wide: { aspectRatio: 2, width: "100%", borderRadius: radius.md }, square: { aspectRatio: 1, width: "100%", borderRadius: radius.md }, avatar: { width: 56, height: 56, borderRadius: 28 } }));

export function Image ({ src, alt, ratio = "wide" }: ImageProps ) {

    const { palette, radius } = useTheme();
    const ratios = ratiosOf(radius);

    return <Picture source={{ uri: src }} accessibilityLabel={alt} resizeMode="cover" testID={`image-${ratio}`} style={[ratios[ratio], { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, backgroundColor: palette.surfaceSunken }]} />;

}
