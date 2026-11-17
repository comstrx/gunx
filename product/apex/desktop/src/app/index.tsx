import { createRoot } from "react-dom/client";
import { Shell } from "@/app/shell.tsx";
import { host } from "@/host/bridge.ts";
import { boot } from "@/host/index.ts";

export function App () {

    return <Shell path="/" />;

}

const mount = (globalThis as { document?: { getElementById: ( id: string ) => Element | null } }).document?.getElementById("root");

if ( mount ) {

    boot();
    createRoot(mount).render(<App />);
    void host.opened().then(( inside ) => {

        if ( inside ) host.mark();

    });

}
