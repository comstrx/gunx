import * as device from "engine-device";
import * as exception from "engine-exception";
import type { Deck, Phase, Picked, Recording, Take } from "./arch.ts";
import { port, resize } from "./media.ts";

export function record ( take: Take = {} ): Recording {

    const filmed = take.video !== undefined && take.video !== false;
    const listeners = new Set<() => void>();
    let deck: Deck | undefined;
    let phase: Phase = "idle";
    let opening: Promise<void> | undefined;
    let began = 0;
    let banked = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle: ( clip: Picked | undefined ) => void = () => undefined;
    const done = new Promise<Picked | undefined>(( resolve ) => {

        settle = resolve;

    });
    const move = ( next: Phase ): void => {

        phase = next;

        for ( const listener of [...listeners] ) exception.probe(listener);

    };
    const elapsed = (): number => (banked + (phase === "live" ? Date.now() - began : 0)) / 1000;
    const armed = (): void => {

        clearTimeout(timer);

        if ( typeof take.seconds === "number" && take.seconds > 0 ) timer = setTimeout(() => void finish(true), Math.max(0, take.seconds - elapsed()) * 1000);

    };
    const finish = ( keep: boolean ): Promise<Picked | undefined> => {

        if ( phase === "done" ) return done;

        const held = deck;
        const span = elapsed();
        const rolled = phase === "live" || phase === "paused";

        clearTimeout(timer);
        banked = span * 1000;
        deck = undefined;
        move("done");

        if ( !held || !keep || !rolled ) {

            held?.drop();
            settle(undefined);

            return done;

        }

        void exception.probeAsync(() => held.stop()).then(( clip ) => settle(clip ? { ...clip, duration: span } : undefined));

        return done;

    };
    const opened = async (): Promise<void> => {

        const unit = device.create();
        const make = filmed ? port.get().camera : port.get().voice;

        if ( !make ) throw exception.fault("unavailable", "media.record", { message: "media: this platform cannot record that" });
        if ( filmed ) await unit.require("camera");
        if ( take.audio !== false ) await unit.require("microphone");

        const made = await make(take, unit);

        if ( !made ) throw exception.fault("unavailable", "media.record", { message: "media: the recorder did not open" });

        if ( phase !== "idle" ) {

            made.drop();

            return;

        }

        deck = made;
        move("ready");

    };
    const open = (): Promise<void> => {

        if ( phase !== "idle" ) return Promise.resolve();

        opening ??= exception.mend(opened(), ( caught ) => {

            opening = undefined;

            throw caught;

        });

        return opening;

    };

    return {
        done,
        open,
        start: async () => {

            await open();

            const held = deck;

            if ( phase !== "ready" || !held ) return;

            await held.start();

            if ( phase !== "ready" ) return;

            began = Date.now();
            move("live");
            armed();

        },
        pause: () => {

            if ( phase !== "live" || !deck?.pause ) return false;

            banked += Date.now() - began;
            clearTimeout(timer);
            deck.pause();
            move("paused");

            return true;

        },
        resume: () => {

            if ( phase !== "paused" || !deck?.resume ) return false;

            began = Date.now();
            deck.resume();
            move("live");
            armed();

            return true;

        },
        stop: () => finish(true),
        drop: () => void finish(false),
        snap: async ( sizing ) => {

            const held = deck;
            const shot = held?.snap ? await exception.probeAsync(() => held.snap?.()) : undefined;

            return shot && sizing ? resize(shot, sizing) : shot;

        },
        flip: async () => {

            const held = deck;

            if ( phase !== "ready" || !held?.flip ) return false;

            await exception.probeAsync(() => held.flip?.());
            move(phase);

            return true;

        },
        phase: () => phase,
        elapsed,
        stream: () => deck?.stream,
        watch: ( listener ) => {

            listeners.add(listener);

            return () => {

                listeners.delete(listener);

            };

        },
    };

}
