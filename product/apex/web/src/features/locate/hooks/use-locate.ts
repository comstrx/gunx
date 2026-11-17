import type * as device from "engine/device";
import * as exception from "engine/exception";
import * as geo from "engine/geo";
import { useEffect, useRef, useState } from "react";
import { accuracies } from "@/api/locate.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { held } from "@/stores/device.ts";
import { mapOf, stretched, type Track } from "@/stores/locate.ts";

export type Located = {
    status: "idle" | "finding" | "following" | "failed";
    position: device.Position | undefined;
    track: Track;
    reason: string | undefined;
    map: string | undefined;
    find: () => void;
    follow: () => void;
    stop: () => void;
};

const empty: Track = { points: [], meters: 0 };

export function useLocate ( id = "locate" ): Located {

    const { live, screen } = useStage();
    const settings = live.settings(screen, id);
    const accuracy = accuracies.find(( one ) => one === settings.accuracy) ?? "balanced";
    const zoom = typeof settings.zoom === "number" ? settings.zoom : 15;
    const every = typeof settings.every === "number" ? settings.every : 5;
    const [status, setStatus] = useState<Located["status"]>("idle");
    const [position, setPosition] = useState<device.Position>();
    const [track, setTrack] = useState<Track>(empty);
    const [reason, setReason] = useState<string>();
    const following = useRef<() => void>(undefined);
    const key = host.app.config.contracts.maps.key;

    function moved ( found: device.Position ): void {

        setPosition(found);
        setTrack(( known ) => stretched(known, found));
        live.set("signals.position", { lat: found.lat, lng: found.lng, accuracy: found.accuracy });
        host.app.bus.publish("locate.moved", { lat: found.lat, lng: found.lng });

    }
    function failed ( caught: unknown ): void {

        setStatus("failed");
        setReason(exception.of(caught).reason || exception.of(caught).code);
        host.app.report(caught, `${id}.locate`);

    }
    function stop (): void {

        following.current?.();
        following.current = undefined;
        setStatus(( known ) => (known === "following" ? "idle" : known));

    }

    useEffect(() => () => {

        following.current?.();
        following.current = undefined;

    }, []);

    return {
        status,
        position,
        track,
        reason,
        map: mapOf(key, position, track, zoom),
        find: () => {

            setStatus("finding");
            setReason(undefined);
            void geo.locate(held(), { accuracy, timeout: 15_000 }).then(( found ) => {

                moved(found);
                setStatus(( known ) => (known === "finding" ? "idle" : known));

            }).catch(failed);

        },
        follow: () => {

            stop();
            setReason(undefined);
            setStatus("following");

            try {

                following.current = geo.follow(held(), { accuracy, minMeters: every }, moved);

            } catch ( caught ) {

                failed(caught);

            }

        },
        stop,
    };

}
