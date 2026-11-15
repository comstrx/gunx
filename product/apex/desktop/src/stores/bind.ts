import * as state from "engine/state";
import { useRef, useSyncExternalStore } from "react";

const renderer: state.Renderer = { ref: useRef, read: useSyncExternalStore };

export function bind<T> ( source: state.Source<T>, server?: () => T ): state.Binding<T> {

    return state.bind(source, server, renderer);

}
