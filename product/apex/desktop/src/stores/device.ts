import * as device from "engine/device";

let bound: device.Adapter | undefined;
let made: device.Device | undefined;

export function held (): device.Device {

    const adapter = device.port.get();

    if ( made === undefined || adapter !== bound ) {

        bound = adapter;
        made = device.create(adapter);

    }

    return made;

}
export function linked ( go: ( path: string ) => void ): () => void {

    return held().links(( link ) => {

        const path = device.pathOf(link);

        if ( path !== undefined ) go(path);

    });

}
export function reload (): boolean {

    return held().reload();

}
