import * as api from "engine/api";
import * as validate from "engine/validate";

const person = validate.object({ id: validate.string(), email: validate.string(), name: validate.string(), status: validate.string() });
const membership = validate.object({ tenant_id: validate.string(), roles: validate.array(validate.string()) });
const held = { tenant: validate.nullable(validate.string()), memberships: validate.array(membership) };

export const signed = validate.object({ user: person, ...held, access: validate.string(), refresh: validate.string(), expires: validate.number(), type: validate.string() });
export const renewed = validate.object({ access: validate.string(), refresh: validate.string(), expires: validate.number() });
export const photoKinds = ["image/png", "image/jpeg", "image/webp"] as const;
export const stored = validate.object({ url: validate.string(), size: validate.number(), type: validate.string() });
export const transport = api.feature("sessions", {
    code: api.post("/api/sessions/code", validate.object({ email: validate.email() }), validate.unknown(), { auth: false }),
    start: api.post("/api/sessions", validate.object({ email: validate.email(), code: validate.string().check(validate.regex(/^\d{6}$/)) }), signed, { auth: false }),
    renew: api.post("/api/sessions/refresh", validate.object({ refresh: validate.string().check(validate.minLength(1)) }), renewed, { auth: false }),
    end: api.del("/api/sessions", validate.object({}), validate.unknown(), { auth: true }),
    me: api.get("/api/me", validate.object({}), validate.object({ id: validate.string(), avatar: validate.nullable(validate.string()) }), { auth: true }),
    photo: api.put("/api/me/avatar", validate.object({ file: api.file({ accept: photoKinds }) }), stored, { auth: true }),
    unphoto: api.del("/api/me/avatar", validate.object({}), validate.unknown(), { auth: true }),
});

export type Signed = validate.infer<typeof signed>;
export type Person = { id: string; email: string; name: string; roles: string[]; tenant: string | null };
