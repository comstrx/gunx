import * as exception from "engine-exception";
import type { Host, Pick, Picked } from "./arch.ts";

const timed = /^(video|audio)\//;
const patient = 4000;

export function chooser ( host: Host, page: NonNullable<Host["document"]> ): { measured: ( file: Picked ) => Promise<Picked>; pick: ( options?: Pick ) => Promise<Picked[]> } {

    const browser = host.navigator;
    const measured = ( file: Picked ): Promise<Picked> => new Promise(( resolve ) => {

        const links = host.URL;
        const player = file.blob && links && timed.test(file.type) ? exception.probe(() => page.createElement?.("video")) : undefined;

        if ( !player || !file.blob || !links ) {

            resolve(file);

            return;

        }

        const url = links.createObjectURL(file.blob);
        let open = true;
        const settle = (): void => {

            if ( !open ) return;

            open = false;
            clearTimeout(timer);

            const made: Picked = { ...file };

            if ( Number.isFinite(player.duration) && player.duration > 0 ) made.duration = player.duration;
            if ( player.videoWidth > 0 && player.videoHeight > 0 ) Object.assign(made, { width: player.videoWidth, height: player.videoHeight });

            player.onloadedmetadata = null;
            player.onerror = null;
            player.src = "";
            links.revokeObjectURL(url);
            resolve(made);

        };
        const timer = setTimeout(settle, patient);

        player.preload = "metadata";
        player.onloadedmetadata = settle;
        player.onerror = settle;
        player.src = url;

    });
    const pick = ( options: Pick = {} ): Promise<Picked[]> => new Promise(( resolve ) => {

        const input = browser?.userActivation?.isActive === false ? undefined : exception.probe(() => page.createElement?.("input"));

        if ( !input ) {

            resolve([]);

            return;

        }

        input.type = "file";
        input.accept = options.accept?.join(",") ?? (options.source === "files" ? "" : "image/*");
        input.multiple = options.multiple === true;
        input.onchange = () => resolve(Promise.all(Array.from(input.files ?? [], ( file ) => measured({ name: file.name, type: file.type, size: file.size, uri: "", blob: file }))));
        input.oncancel = () => resolve([]);

        if ( options.source === "camera" ) input.capture = options.facing === "front" ? "user" : "environment";

        exception.rescue(() => {

            input.click();

        }, () => {

            resolve([]);

        });

    });
    return { measured, pick };

}
