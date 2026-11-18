import type * as rand from "engine/rand";
import * as ExpoCrypto from "expo-crypto";

export const source: rand.Source = {
    getRandomValues: ( data ) => ExpoCrypto.getRandomValues(data),
    randomUUID: () => ExpoCrypto.randomUUID(),
};
