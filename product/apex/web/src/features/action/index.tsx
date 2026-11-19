"use client";

import { useEffect, useState } from "react";
import { Button } from "@/elements/button.tsx";
import type { Placed } from "@/features/index.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host, type Look, looks } from "@/specs/index.ts";

export function Action ({ id }: Placed ) {

    const { live, screen } = useStage();
    const { locale } = usePreferences();
    const [pending, setPending] = useState(false);
    const settings = live.settings(screen, id);
    const look: Look = looks.find(( one ) => one === settings.look) ?? "solid";

    useEffect(() => live.handle(`${id}.press`, () => undefined), [live, id]);

    function press (): void {

        setPending(true);
        void live.act(id, "press").catch(( caught: unknown ) => host.app.report(caught, `${id}.press`)).finally(() => setPending(false));

    }

    return <Button look={look} pending={pending} onPress={press}>{host.app.text(locale, String(settings.label))}</Button>;

}
