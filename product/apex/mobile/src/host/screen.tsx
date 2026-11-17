import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export function Frame ({ children, background }: { children: ReactNode; background: string } ) {

    return (
        <SafeAreaProvider>
            <SafeAreaView style={{ flex: 1, backgroundColor: background }}>
                <StatusBar style="auto" />
                {children}
            </SafeAreaView>
        </SafeAreaProvider>
    );

}
