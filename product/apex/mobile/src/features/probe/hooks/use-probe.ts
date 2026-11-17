import type * as device from "engine/device";
import * as exception from "engine/exception";
import * as media from "engine/media";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Outcome, type Permission, permissions, type Tool } from "@/api/probe.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { held } from "@/stores/device.ts";

export type Probe = {
    info: device.Info;
    grants: { permission: Permission; grant: device.Grant }[];
    results: Partial<Record<Tool, Outcome>>;
    picked: Partial<Record<Tool, string>>;
    stream: unknown;
    played: media.Picked | undefined;
    ask: ( permission: Permission ) => void;
    run: ( tool: Tool, text: string ) => void;
};

const watched: readonly device.Watched[] = ["online", "scheme", "size", "visibility"];

function told ( file: media.Picked ): string {

    const sized = file.width !== undefined && file.height !== undefined ? ` ${file.width}×${file.height}` : "";
    const long = file.duration === undefined ? "" : ` ${file.duration.toFixed(1)}s`;

    return `${file.name}${sized}${long} ${Math.max(1, Math.round(file.size / 1024))} kB`;

}

export function useProbe ( id = "probe" ): Probe {

    const { live, screen } = useStage();
    const settings = live.settings(screen, id);
    const chosen = permissions.filter(( permission ) => !Array.isArray(settings.permissions) || settings.permissions.includes(permission));
    const [info, setInfo] = useState(() => held().info());
    const [grants, setGrants] = useState<Partial<Record<Permission, device.Grant>>>({});
    const [results, setResults] = useState<Partial<Record<Tool, Outcome>>>({});
    const [picked, setPicked] = useState<Partial<Record<Tool, string>>>({});
    const taken = useRef<{ made: media.Recording; still: boolean } | undefined>(undefined);
    const [stream, setStream] = useState<unknown>(undefined);
    const [played, setPlayed] = useState<media.Picked | undefined>(undefined);
    const read = useCallback(( permission: Permission ) => Promise.resolve(held().state(permission)).then(( grant ) => setGrants(( known ) => ({ ...known, [permission]: grant }))).catch(( caught: unknown ) => host.app.report(caught, `${id}.state`)), [id]);

    useEffect(() => {

        const stops = watched.map(( what ) => held().watch(what, setInfo));

        for ( const permission of permissions ) void read(permission);

        return () => {

            for ( const stop of stops ) stop();

        };

    }, [read]);

    function ask ( permission: Permission ): void {

        void held().ask(permission).then(( grant ) => {

            setGrants(( known ) => ({ ...known, [permission]: grant }));
            live.set("signals.grants", { permission, grant });

        }).catch(( caught: unknown ) => host.app.report(caught, `${id}.ask`));

    }
    function run ( tool: Tool, text: string ): void {

        const unit = held();
        const chose = ( options: media.Pick ): Promise<boolean> | undefined => (media.can("pick") ? media.pick(options).then(( found ) => {

            setPicked(( known ) => ({ ...known, [tool]: found.map(told).join(" · ") }));

            return found.length > 0;

        }) : undefined);
        const taped = async ( take: media.Take, still = false ): Promise<boolean | undefined> => {

            const live = taken.current;

            if ( live?.still ) {

                const photo = await live.made.snap({ side: 1024 });

                live.made.drop();

                setPicked(( known ) => ({ ...known, [tool]: photo ? told(photo) : "" }));

                return photo !== undefined;

            }

            if ( live ) return (await live.made.stop()) !== undefined;
            if ( !media.can(take.video ? "camera" : "voice") ) return undefined;

            const made = media.record(take);
            const why = ( fault: exception.Fault ): boolean | undefined => {

                setPicked(( known ) => ({ ...known, [tool]: fault.reason ?? fault.message }));

                return fault.code === "unavailable" ? undefined : false;

            };
            const opened = await exception.attempt(() => made.open());

            if ( !opened.ok ) return why(opened.fault);

            taken.current = { made, still };
            setStream(take.video ? made.stream() : undefined);
            setPicked(( known ) => ({ ...known, [tool]: "●" }));
            void made.done.then(( clip ) => {

                taken.current = undefined;
                setStream(undefined);

                if ( clip ) setPlayed(clip);
                setPicked(( known ) => ({ ...known, [tool]: clip ? told(clip) : known[tool] === "●" ? "" : known[tool] }));

            });

            if ( still ) return true;

            const begun = await exception.attempt(() => made.start());

            if ( begun.ok ) return true;

            made.drop();

            return why(begun.fault);

        };
        const work: Record<Tool, () => Promise<boolean | undefined> | boolean | undefined> = {
            photo: () => chose({ source: "library", multiple: true, limit: 3, image: { side: 1024, quality: 0.8 } }),
            shot: () => chose({ source: "camera", image: { side: 1024, format: "jpeg" } }),
            file: () => chose({ source: "files" }),
            video: () => chose({ source: "library", accept: ["video/*"] }),
            film: () => chose({ source: "camera", accept: ["video/*"], seconds: 15 }),
            audio: () => chose({ source: "files", accept: ["audio/*"] }),
            voice: () => taped({ seconds: 30 }),
            record: () => taped({ video: { facing: "front", side: 720 }, seconds: 15 }),
            snap: () => taped({ video: { facing: "front" }, audio: false }, true),
            copy: () => (unit.can("copy") ? unit.copy(text) : undefined),
            share: () => (unit.can("share") ? unit.share({ title: text, text }) : undefined),
            buzz: () => (unit.can("haptic") ? unit.haptic("success") : unit.can("vibrate") ? unit.vibrate(40) : undefined),
            notify: () => (unit.can("notify") ? unit.notify({ title: text, tag: id }) : undefined),
        };

        void Promise.resolve().then(() => work[tool]()).then(( done ) => setResults(( known ) => ({ ...known, [tool]: done === undefined ? "unsupported" : done ? "done" : "refused" }))).catch(( caught: unknown ) => {

            setResults(( known ) => ({ ...known, [tool]: "refused" }));
            host.app.report(caught, `${id}.${tool}`);

        });

    }

    return { picked, stream, played, info, grants: chosen.map(( permission ) => ({ permission, grant: grants[permission] ?? "prompt" })), results, ask, run };

}
