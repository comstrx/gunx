import * as error from "engine-error";
import * as net from "engine-net";

export type Stage = { release?: boolean | undefined; insecure?: boolean | undefined };

function refused ( value: unknown ): error.Fault {

    return error.fault("internal", "api.address", { message: `${typeof value === "string" ? value.slice(0, 200) : typeof value}: an api address is a bare http or https url` });

}
function owned ( text: string ): boolean {

    const start = text.indexOf("://");
    const from = start === -1 ? 0 : start + 3;
    let end = text.length;

    for ( const mark of ["/", "?", "#"] ) {

        const at = text.indexOf(mark, from);

        if ( at !== -1 && at < end ) end = at;

    }

    return text.slice(from, end).includes("@");

}

export function address ( value: string, stage: Stage = {} ): string {

    if ( typeof value !== "string" ) throw refused(value);

    const text = value.trim();
    const parts = net.parseUrl(text);

    if ( !parts || owned(text) || Object.keys(parts.query).length !== 0 || parts.hash !== "" || text.includes("?") || text.includes("#") ) throw refused(value);
    if ( parts.protocol !== "http" && parts.protocol !== "https" ) throw refused(value);

    if ( stage.release && !stage.insecure && (parts.protocol !== "https" || net.isPrivateAddress(parts.hostname)) ) {

        throw error.fault("internal", "api.cleartext", { message: `${parts.origin}: a release calls a public https address` });

    }

    let end = parts.path.length;

    while ( end > 0 && parts.path.charCodeAt(end - 1) === 47 ) end -= 1;

    return `${parts.origin}${parts.path.slice(0, end)}`;

}
