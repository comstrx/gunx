import AsyncStorage from "@react-native-async-storage/async-storage";
import * as cache from "engine/cache";

export const storage: cache.Driver = {
    get: ( key ) => AsyncStorage.getItem(key),
    set: ( key, value ) => AsyncStorage.setItem(key, value),
    delete: ( key ) => AsyncStorage.removeItem(key),
    keys: async () => [...(await AsyncStorage.getAllKeys())],
    lock: cache.serial(),
};
