import { StyleSheet } from "react-native";
import { reading, type Shape } from "@/styles/tokens.ts";

export const frame = StyleSheet.create({ fill: { flex: 1 } });
export const widths = StyleSheet.create({ auto: {}, full: { width: "100%" }, reading: { width: "100%", maxWidth: reading, alignSelf: "center" } });
export const heights = StyleSheet.create({ auto: {}, screen: { flex: 1 } });

export function sheeted<T> ( make: ( radius: Shape ) => T ): ( radius: Shape ) => T {

    const made = new WeakMap<Shape, T>();

    return ( radius ) => {

        const known = made.get(radius);

        if ( known !== undefined ) return known;

        const fresh = make(radius);

        made.set(radius, fresh);

        return fresh;

    };

}
