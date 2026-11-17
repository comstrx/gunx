import * as cache from "engine/cache";
import * as device from "engine/device";
import * as history from "engine/history";
import * as media from "engine/media";
import * as rand from "engine/rand";
import { BackHandler, Platform } from "react-native";
import { adapter } from "./device.ts";
import { adapter as picker } from "./picker.ts";
import { source } from "./random.ts";
import { secure } from "./secure.ts";
import { storage } from "./storage.ts";

export function boot (): void {

    rand.engine.use(source);
    cache.use("local", storage);
    cache.use("session", cache.memory());
    cache.use("secure", Platform.OS === "web" ? storage : secure);
    cache.use("local");
    device.port.use(adapter);
    media.port.use(picker);
    const memory = history.memoryAdapter("/");

    history.port.use(memory);
    BackHandler.addEventListener("hardwareBackPress", () => {

        if ( memory.snapshot().index <= 0 ) return false;

        memory.go(-1);

        return true;

    });

}
