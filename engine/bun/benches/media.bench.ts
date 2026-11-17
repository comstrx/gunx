import * as media from "engine/media";
import { bench, do_not_optimize, run } from "mitata";

const source: media.Pictured = { width: 4000, height: 3000, type: "image/jpeg", name: "shot.jpg" };
const accept = ["image/*", "video/mp4", "audio/*", ".pdf"];

bench("media.planned", () => do_not_optimize(media.planned(source, { side: 512, ratio: 1, format: "webp", quality: 0.8 })));
bench("media.planned.idle", () => do_not_optimize(media.planned(source, {})));
bench("media.sizable", () => do_not_optimize(media.sizable("image/png")));
bench("media.kindsOf", () => do_not_optimize(media.kindsOf(accept)));

await run();
