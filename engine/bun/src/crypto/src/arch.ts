import type * as json from "engine-json";

export type Algorithm = "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1";
export type Source = { subtle: SubtleCrypto };
export type Bytes = Uint8Array<ArrayBuffer>;
export type Kept<T> = ( source: Source, name: string, make: ( subtle: SubtleCrypto ) => Promise<T> ) => Promise<T>;
export type Read = { rounds: number; salt: Bytes; digest: string };
export type Lane = { salt: Bytes; text: string; left: number };
export type Gcm = { name: "AES-GCM"; iv: Bytes; additionalData?: Bytes };
export type Claims = json.Dictionary & {
    sub?: string | undefined;
    iss?: string | undefined;
    aud?: string | string[] | undefined;
    exp?: number | undefined;
    iat?: number | undefined;
    nbf?: number | undefined;
    jti?: string | undefined;
};
export type SignOptions = {
    expiresIn?: number | undefined;
    notBefore?: number | undefined;
    issuer?: string | undefined;
    audience?: string | string[] | undefined;
    subject?: string | undefined;
    id?: string | undefined;
    now?: number | undefined;
};
export type VerifyOptions = {
    issuer?: string | undefined;
    audience?: string | string[] | undefined;
    subject?: string | undefined;
    leeway?: number | undefined;
    maxAge?: number | undefined;
    now?: number | undefined;
};
