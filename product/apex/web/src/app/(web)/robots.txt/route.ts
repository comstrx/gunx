import { host } from "@/specs/index.ts";

export const dynamic = "force-static";

export function GET (): Response {

    return new Response(host.app.crawl(), { headers: { "content-type": "text/plain; charset=utf-8" } });

}
