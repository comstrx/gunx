import { Nav } from "@/app/nav.tsx";
import { Screen } from "@/app/screen.tsx";
import { boot } from "@/native/index.ts";
import { Frame } from "@/native/screen.tsx";
import { useTheme } from "@/styles/theme.ts";

boot();

export function App () {

    const { palette } = useTheme();

    return (
        <Frame background={palette.surface}>
            <Nav path="/" />
            <Screen path="/" />
        </Frame>
    );

}
