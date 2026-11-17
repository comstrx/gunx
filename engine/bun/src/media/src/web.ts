import * as device from "engine-device";
import * as exception from "engine-exception";
import type { Adapter, Facts, Host, Link, Picked } from "./arch.ts";
import { chooser } from "./choose.ts";
import { sizer } from "./image.ts";
import { recorder } from "./roll.ts";

const timed = /^(video|audio)\//;

export function webAdapter ( host: Host = device.host<Host>() ): Adapter | undefined {

    const page = host.document;

    if ( !page ) return undefined;

    const { measured, pick } = chooser(host, page);
    const sized = sizer(host);
    const size = async ( file: Picked ): Promise<Facts> => {

        if ( timed.test(file.type) ) {

            const { width, height, duration } = await measured(file);

            return { width, height, duration };

        }

        const bitmap = file.blob && host.createImageBitmap ? await exception.probeAsync(() => host.createImageBitmap?.(file.blob as Blob, { imageOrientation: "from-image" })) : undefined;

        if ( !bitmap ) return { width: file.width, height: file.height };

        const { width, height } = bitmap;

        bitmap.close?.();

        return { width, height };

    };
    const link = ( file: Picked ): Link => {

        const links = host.URL;

        if ( !file.blob || !links ) return { url: file.uri, release: () => undefined };

        const url = links.createObjectURL(file.blob);

        return { url, release: () => links.revokeObjectURL(url) };

    };
    return { pick: page.createElement ? pick : undefined, resize: host.createImageBitmap && host.OffscreenCanvas ? sized : undefined, size: page.createElement || host.createImageBitmap ? size : undefined, link, ...recorder(host, page) };

}
