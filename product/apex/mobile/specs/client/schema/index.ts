import * as spec from "engine/spec";
import { account } from "./account.ts";
import { home } from "./home.ts";
import { login } from "./login.ts";
import { offers } from "./offers.ts";

export const schema = {
    screens: [home, offers, login, account],
    signals: ["from"],
    on: { enter: spec.set("signals.from", spec.fromEvent("from")) },
};
