export function idle (): undefined {

    return undefined;

}
export function finite ( given: number | null | undefined ): given is number {

    return typeof given === "number" && Number.isFinite(given);

}
