import * as history from "engine/history";
import { useMemo, useSyncExternalStore } from "react";
import { host } from "@/specs/index.ts";

type Query = history.Entry["query"];

const none: Query = {};

let made: history.History | undefined;
let entered: string | undefined;

export function navigator (): history.History {

    made ??= history.create();

    return made;

}
export function addressed (): boolean {

    return host.app.config.settings.localization === true && !history.port.bound();

}
function subscribe ( listener: () => void ): () => void {

    return navigator().listen(listener);

}
function current (): string {

    const raw = navigator().current().path;

    return addressed() ? host.app.locate(raw).path : raw;

}
function spoken (): string | undefined {

    return addressed() ? host.app.locate(navigator().current().path).locale : undefined;

}
function surfaced ( state: unknown ): string | undefined {

    const found = state as { surface?: unknown } | null | undefined;

    return typeof found?.surface === "string" ? found.surface : undefined;

}
function placed ( path: string ): string {

    const name = host.active.getState();
    const fresh = entered !== name;
    const given = host.carried().locale;

    entered = name;

    if ( !addressed() ) return path;

    return host.app.href(path, fresh && typeof given === "string" ? given : host.app.locate(navigator().current().path).locale);

}
function marked (): void {

    const at = navigator().current();

    if ( surfaced(at.state) === undefined ) navigator().replace(at.href, { surface: entered ?? host.active.getState() });

}
function followed (): void {

    const asked = surfaced(navigator().current().state);

    settle();

    if ( asked === undefined || asked === host.active.getState() ) return;

    entered = asked;
    void host.resume(asked);

}
function href (): string {

    return navigator().current().href;

}
export function usePath ( initial = "/" ): string {

    return useSyncExternalStore(subscribe, current, () => initial);

}
export function useSpoken ( initial?: string ): string | undefined {

    return useSyncExternalStore(subscribe, spoken, () => initial);

}
export function useQuery (): Query {

    const at = useSyncExternalStore(subscribe, href, () => "");

    return useMemo(() => {

        const found = at ? navigator().current().query : none;

        return Object.keys(found).length ? found : none;

    }, [at]);

}
function plain ( path: string ): string {

    return addressed() ? host.app.locate(path).path : path;

}
export function hrefOf ( path: string, locale: string ): string {

    return addressed() ? host.app.href(path, locale) : path;

}
export function navigate ( path: string ): void {

    marked();
    navigator().push(placed(plain(path)), { surface: host.active.getState() });

}
export function redirect ( path: string ): void {

    navigator().replace(placed(plain(path)), { surface: host.active.getState() });

}
export function arrived (): void {

    entered = host.active.getState();
    marked();

}
export function speak ( locale: string ): void {

    if ( !addressed() ) return;

    const at = navigator().current();
    const found = host.app.locate(at.path);

    if ( found.locale !== locale || found.moved ) navigator().replace(`${host.app.href(found.path, locale)}${at.href.slice(at.path.length)}`);

}
export function settle (): void {

    if ( !addressed() ) return;

    const at = navigator().current();
    const found = host.app.locate(at.path);

    if ( found.moved ) navigator().replace(`${host.app.href(found.path, found.locale)}${at.href.slice(at.path.length)}`);

}
export function watched (): () => void {

    settle();

    return navigator().listen(followed);

}
