import type * as api from "engine/api";
import { createClient } from "@/api/index.ts";
import { compiled } from "@/specs/runtime.ts";
import { instance } from "@/stores/preferences.ts";

export const client: api.Client = createClient({ baseUrl: compiled.address, locale: () => instance.getState().locale });
