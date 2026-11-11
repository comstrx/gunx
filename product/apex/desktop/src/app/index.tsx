import { createRoot } from "react-dom/client";
import { Nav } from "@/app/nav.tsx";
import { Screen } from "@/app/screen.tsx";
import { host } from "@/native/bridge.ts";
import { boot } from "@/native/index.ts";

export function App () {

    return (
        <>
            <Nav path="/" />
            <main>
                <Screen path="/" />
            </main>
        </>
    );

}

const mount = (globalThis as { document?: { getElementById: ( id: string ) => Element | null } }).document?.getElementById("root");

if ( mount ) {

    boot();
    createRoot(mount).render(<App />);
    void host.opened().then(( inside ) => {

        if ( inside ) host.mark();

    });

}
