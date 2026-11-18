import type { Adapter, Follow, Found, Host, Position, Wanted } from "./arch.ts";
import { finite, idle } from "./guard.ts";

function span ( given: number | undefined ): given is number {

    return typeof given === "number" && given >= 0;

}
function positionOf ( found: Found ): Position | undefined {

    const { coords, timestamp } = found;

    if ( !finite(coords.latitude) || !finite(coords.longitude) ) return undefined;

    const made: Position = { lat: coords.latitude, lng: coords.longitude, accuracy: finite(coords.accuracy) ? coords.accuracy : 0, at: timestamp };

    if ( finite(coords.altitude) ) made.altitude = coords.altitude;
    if ( finite(coords.speed) ) made.speed = coords.speed;
    if ( finite(coords.heading) ) made.heading = coords.heading;

    return made;

}
function wantedOf ( options: Follow ): Wanted {

    const made: Wanted = { enableHighAccuracy: options.accuracy === "high" };

    if ( span(options.maxAge) ) made.maximumAge = options.maxAge;
    if ( span(options.timeout) ) made.timeout = options.timeout;

    return made;

}

export function placed ( browser: NonNullable<Host["navigator"]> ): Pick<Adapter, "position" | "follow"> {

    const position = ( options: Follow = {} ): Promise<Position | undefined> => new Promise(( resolve ) => {

        const geolocation = browser.geolocation;

        if ( !geolocation ) {

            resolve(undefined);

            return;

        }

        geolocation.getCurrentPosition(( found ) => resolve(positionOf(found)), () => resolve(undefined), wantedOf(options));

    });
    const follow = ( options: Follow, listener: ( position: Position ) => void ): (() => void) => {

        const geolocation = browser.geolocation;

        if ( !geolocation ) return idle;

        const id = geolocation.watchPosition(( found ) => {

            const made = positionOf(found);

            if ( made ) listener(made);

        }, undefined, wantedOf(options));

        return () => geolocation.clearWatch(id);

    };

    return { position: browser.geolocation ? position : undefined, follow: browser.geolocation ? follow : undefined };

}
