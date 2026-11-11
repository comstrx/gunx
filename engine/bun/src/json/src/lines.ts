import * as string from "engine-string";
import { parse, stringify } from "./object.ts";

export function toLines ( rows: readonly unknown[] ): string {

    return rows.map(( row ) => stringify(row)).join("\n");

}
export function fromLines ( text: string ): unknown[] {

    return string.lines(text).map(( line ) => (line.trim() === "" ? undefined : parse(line))).filter(( row ) => row !== undefined);

}
