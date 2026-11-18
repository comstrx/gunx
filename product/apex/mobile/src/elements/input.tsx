import { StyleSheet, Text, TextInput, View } from "react-native";
import type { InputProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { sheeted } from "@/styles/globals.ts";

const baseOf = sheeted(( radius ) => StyleSheet.create({ field: { alignSelf: "stretch", gap: 4 }, label: { fontSize: 14, lineHeight: 20, fontWeight: "500" }, input: { height: 44, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 } }));
const kinds = { text: { keyboard: "default", fill: "off" }, email: { keyboard: "email-address", fill: "email" }, code: { keyboard: "number-pad", fill: "one-time-code" } } as const;

export function Input ({ value, onChange, label, kind = "text", placeholder, invalid = false, disabled = false }: InputProps ) {

    const { palette, radius } = useTheme();
    const base = baseOf(radius);

    return (
        <View style={base.field} testID={`field-${kind}`}>
            <Text style={[base.label, { color: palette.ink }]}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={palette.inkMuted}
                keyboardType={kinds[kind].keyboard}
                autoComplete={kinds[kind].fill}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!disabled}
                aria-label={label}
                aria-invalid={invalid || undefined}
                style={[base.input, { color: palette.ink, backgroundColor: palette.surface, borderColor: invalid ? palette.danger : palette.line, opacity: disabled ? 0.5 : 1, textAlign: kind === "text" ? undefined : "left" }]}
            />
        </View>
    );

}
