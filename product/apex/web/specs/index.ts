import * as spec from "engine/spec";
import { admin } from "./admin/index.ts";
import { client } from "./client/index.ts";

export const specs = spec.define({ acme: { admin, client } });
