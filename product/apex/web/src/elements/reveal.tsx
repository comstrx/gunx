import { useState } from "react";
import type { RevealProps } from "@/elements/contract.ts";
import { useMotion } from "@/hooks/use-motion.ts";
import { usePresence } from "@/hooks/use-presence.ts";

const base = "contents *:transition-[opacity,translate] *:duration-[var(--motion-base)] *:ease-[var(--ease-standard)] data-[leaving]:*:translate-y-1 data-[leaving]:*:opacity-0";
const entering = "*:starting:translate-y-1 *:starting:opacity-0";

export function Reveal ({ children, shown = true, fresh = false }: RevealProps ) {

    const motion = useMotion();
    const { mounted, leaving } = usePresence(shown, motion.base);
    const [enters, setEnters] = useState(fresh || !shown);

    if ( leaving && !enters ) setEnters(true);

    return mounted ? <div data-ui="reveal" data-leaving={leaving || undefined} className={enters ? `${base} ${entering}` : base}>{children}</div> : null;

}
