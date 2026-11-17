import { Shell } from "@/app/shell.tsx";
import { boot } from "@/host/index.ts";
import { Frame } from "@/host/screen.tsx";
import { useTheme } from "@/styles/theme.ts";

boot();

export function App () {

    const { palette } = useTheme();

    return (
        <Frame background={palette.surface}>
            <Shell path="/" />
        </Frame>
    );

}
