import * as exception from "engine/exception";
import * as media from "engine/media";
import { useEffect, useMemo, useState } from "react";
import { transport as hello } from "@/api/hello.ts";
import { type Person, photoKinds, transport } from "@/api/session.ts";
import { useStage } from "@/hooks/use-stage.ts";
import { host } from "@/specs/app.ts";
import { bind } from "@/stores/bind.ts";
import { client } from "@/stores/client.ts";
import { request, session, start } from "@/stores/session.ts";

export type Account = {
    user: Person | null;
    step: "email" | "code";
    email: string;
    code: string;
    pending: boolean;
    reason: string | undefined;
    greeting: string | undefined;
    setEmail: ( email: string ) => void;
    setCode: ( code: string ) => void;
    send: () => void;
    enter: () => void;
    greet: () => void;
    leave: () => void;
    photo: string | undefined;
    picks: boolean;
    choose: () => void;
    unphoto: () => void;
};

export function useAccount ( id = "account" ): Account {

    const { live, screen } = useStage();
    const settings = live.settings(screen, id);
    const held = session();
    const user = useMemo(() => bind(held.state), [held]).useSelect(( state ) => state.user);
    const [step, setStep] = useState<Account["step"]>("email");
    const [email, setEmail] = useState(typeof settings.email === "string" ? settings.email : "");
    const [code, setCode] = useState("");
    const [pending, setPending] = useState(false);
    const [reason, setReason] = useState<string>();
    const [greeting, setGreeting] = useState<string>();
    const [photo, setPhoto] = useState<string>();
    const base = host.app.address ?? "";

    function run ( work: () => Promise<void>, verb: string ): void {

        setPending(true);
        setReason(undefined);
        void work().catch(( caught: unknown ) => {

            setReason(exception.of(caught).reason || exception.of(caught).code);
            host.app.report(caught, `${id}.${verb}`);

        }).finally(() => setPending(false));

    }

    useEffect(() => {

        if ( user === null ) {

            setPhoto(undefined);

            return undefined;

        }

        let live = true;

        void client().call(transport.me, {}, { fresh: true }).then(( reply ) => {

            if ( live ) setPhoto(reply.data.avatar ? `${base}${reply.data.avatar}` : undefined);

        }).catch(( caught: unknown ) => host.app.report(caught, `${id}.me`));

        return () => {

            live = false;

        };

    }, [user, base, id]);

    return {
        photo,
        picks: media.can("pick"),
        choose: () => {

            void media.pick({ source: "library", accept: photoKinds, image: { side: 512, ratio: 1, format: "jpeg", quality: 0.85 } }).then(([picked]) => {

                const file = picked?.blob;

                if ( file !== undefined ) run(async () => setPhoto(`${base}${(await client().call(transport.photo, { file })).data.url}`), "photo");

            }).catch(( caught: unknown ) => host.app.report(caught, `${id}.pick`));

        },
        unphoto: () => run(async () => {

            await client().call(transport.unphoto, {});
            setPhoto(undefined);

        }, "unphoto"),
        user,
        step,
        email,
        code,
        pending,
        reason,
        greeting,
        setEmail,
        setCode,
        send: () => run(async () => {

            await request(email.trim());
            setStep("code");

        }, "code"),
        enter: () => run(async () => {

            await start(email.trim(), code.trim());
            setCode("");
            setStep("email");
            live.set("signals.signed", true);
            host.app.bus.publish("session.started", { email: email.trim() });

        }, "start"),
        greet: () => run(async () => setGreeting((await client().call(hello.me, {}, { fresh: true })).data.message), "greet"),
        leave: () => run(async () => {

            await client().call(transport.end, {}).catch(( caught: unknown ) => host.app.report(caught, `${id}.end`));
            held.end();
            setGreeting(undefined);
            live.set("signals.signed", false);
            host.app.bus.publish("session.ended", {});

        }, "end"),
    };

}
