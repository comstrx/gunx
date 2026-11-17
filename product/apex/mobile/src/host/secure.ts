import * as cache from "engine/cache";
import * as SecureStore from "expo-secure-store";

const index = "engine.secure.keys";

async function listed (): Promise<string[]> {

    const held = await SecureStore.getItemAsync(index);
    const found: unknown = held === null ? [] : JSON.parse(held);

    return Array.isArray(found) ? found.filter(( key ): key is string => typeof key === "string") : [];

}
function named ( key: string ): string {

    return key.replace(/[^A-Za-z0-9._-]/g, "_");

}

export const secure: cache.Driver = {
    get: ( key ) => SecureStore.getItemAsync(named(key)),
    set: async ( key, value ) => {

        const keys = await listed();

        await SecureStore.setItemAsync(named(key), value);

        if ( !keys.includes(key) ) await SecureStore.setItemAsync(index, JSON.stringify([...keys, key]));

    },
    delete: async ( key ) => {

        const keys = await listed();

        await SecureStore.deleteItemAsync(named(key));

        if ( keys.includes(key) ) await SecureStore.setItemAsync(index, JSON.stringify(keys.filter(( one ) => one !== key)));

    },
    keys: listed,
    lock: cache.serial(),
};
