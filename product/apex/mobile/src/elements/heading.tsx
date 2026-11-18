import { Text } from "react-native";
import type { HeadingProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { headings, latin } from "@/styles/elements.ts";

export function Heading ({ children, level = 2, look, id }: HeadingProps ) {

    const { palette, direction } = useTheme();
    const chosen = look ?? (level === 1 ? "display" : level === 2 ? "title" : "section");

    return (
        <Text role="heading" aria-level={level} nativeID={id} testID={`heading-${chosen}`} style={[headings[chosen], direction === "ltr" ? latin[chosen] : null, { color: chosen === "eyebrow" ? palette.inkMuted : palette.ink }]}>
            {children}
        </Text>
    );

}
