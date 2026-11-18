import { Shell } from "@/app/shell.tsx";
import { useTheme } from "@/hooks/use-theme.ts";
import { boot } from "@/render/bridge/index.ts";
import { Frame } from "@/render/host/screen.tsx";

boot();

export function App () {

    const { palette } = useTheme();

    return (
        <Frame background={palette.surface}>
            <Shell path="/" />
        </Frame>
    );

}
