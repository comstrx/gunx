import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import type { RevealProps } from "@/elements/contract.ts";
import { usePresence } from "@/hooks/use-presence.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { held } from "@/stores/device.ts";

const rise = 6;
const base = StyleSheet.create({ whole: { alignSelf: "stretch" }, fill: { flexGrow: 1 } });

export function Reveal ({ children, shown = true, fresh = false, fill = false }: RevealProps ) {

    const { motion } = useTheme();
    const pace = motion.base;
    const { mounted, leaving } = usePresence(shown, pace);
    const [enters] = useState(fresh || !shown);
    const seen = useRef(new Animated.Value(enters ? 0 : 1)).current;
    const on = mounted && !leaving;

    useEffect(() => {

        if ( !mounted ) return undefined;

        const run = Animated.timing(seen, { toValue: on ? 1 : 0, duration: held().info().reducedMotion ? 0 : pace, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" });

        run.start();

        return () => run.stop();

    }, [mounted, on, seen, pace]);

    return mounted ? (
        <Animated.View testID="reveal" style={[base.whole, fill ? base.fill : undefined, { opacity: seen, transform: [{ translateY: seen.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] }]}>
            {children}
        </Animated.View>
    ) : null;

}
