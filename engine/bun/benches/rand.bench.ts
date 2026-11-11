import * as rand from "engine/rand";
import { bench, do_not_optimize, run } from "mitata";

const seeded = rand.seeded("bench");
const hundred = Array.from({ length: 100 }, ( _, index ) => index);
const thousand = Array.from({ length: 1000 }, ( _, index ) => index);
const weights = [{ item: "a", weight: 1 }, { item: "b", weight: 2 }, { item: "c", weight: 3 }, { item: "d", weight: 4 }];
const seven = rand.uuid7();
const sorted = rand.ulid();

bench("rand.uuid", () => do_not_optimize(rand.uuid()));
bench("rand.uuid7", () => do_not_optimize(rand.uuid7()));
bench("rand.ulid", () => do_not_optimize(rand.ulid()));
bench("rand.token", () => do_not_optimize(rand.token()));
bench("rand.int", () => do_not_optimize(rand.int(1, 100)));
bench("rand.seeded.int", () => do_not_optimize(seeded.int(1, 100)));
bench("rand.shuffle.100", () => do_not_optimize(seeded.shuffle(hundred)));
bench("rand.pickMany.3of1000", () => do_not_optimize(seeded.pickMany(thousand, 3)));
bench("rand.string.16", () => do_not_optimize(rand.string(16)));
bench("rand.letters.16", () => do_not_optimize(rand.letters(16, "abcdef0123456789")));
bench("rand.password", () => do_not_optimize(rand.password()));
bench("rand.otp", () => do_not_optimize(rand.otp()));
bench("rand.nanoid", () => do_not_optimize(rand.nanoid()));
bench("rand.bytes.32", () => do_not_optimize(rand.bytes(32)));
bench("rand.float", () => do_not_optimize(rand.float()));
bench("rand.weighted.4", () => do_not_optimize(seeded.weighted(weights)));
bench("rand.uuidTime", () => do_not_optimize(rand.uuidTime(seven)));
bench("rand.ulidTime", () => do_not_optimize(rand.ulidTime(sorted)));

await run();
