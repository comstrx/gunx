import * as api from "engine/api";
import type * as spec from "engine/spec";
import * as validate from "engine/validate";

export const notice = validate.object({ id: validate.string(), title: validate.string(), body: validate.string(), unread: validate.boolean(), created_at: validate.nullable(validate.string()) });

export const transport = api.feature("notifications", {
    list: api.get("/api/notifications", validate.object({ limit: validate.optional(validate.number().check(validate.gte(1), validate.lte(100))) }), api.many(notice), { auth: true }),
    test: api.post("/api/notifications/test", validate.object({}), notice, { auth: true }),
    read: api.post("/api/notifications/{notice}/read", validate.object({ notice: validate.string().check(validate.minLength(1), validate.maxLength(64)) }), notice, { auth: true }),
});
export const manifest: spec.Manifest = {
    name: "notices",
    settings: validate.strictObject({ limit: validate.optional(validate.number().check(validate.gte(1), validate.lte(100))) }),
    ports: { rows: { kind: "list", required: false } },
    actions: ["refresh"],
};

export type Notice = validate.infer<typeof notice>;
