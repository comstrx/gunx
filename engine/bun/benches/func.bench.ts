import * as error from "engine/error";
import * as func from "engine/func";
import { bench, do_not_optimize, run } from "mitata";

const square = func.memo(( value: number ) => value * value);
const named = func.memo(( name: string ) => name.length);
const shaped = func.memo(( query: { page: number; tags: readonly string[] } ) => query.page);
const keyed = func.memo(( id: number ) => id, { key: ( id ) => String(id) });
const aged = func.memo(( value: number ) => value + 1, { ttl: 60_000 });
const small = func.memo(( value: number ) => value, { size: 64 });
const first = func.once(() => 42);
const flight = func.single(async ( key: string ) => key);
const query = { page: 3, tags: ["a", "b", "c"] };
const bounced = func.debounce(( _value: number ) => undefined, 1000);
const limited = func.throttle(( _value: number ) => undefined, 1000);
const lane = func.lane(4);
const guard = func.breaker();
const tripped = func.breaker({ failures: 1, cooldown: 3_600_000 });
const jobs = Array.from({ length: 64 }, ( _, at ) => at);
let miss = 0;

await tripped.run(async () => Promise.reject(error.fault("unavailable", "bench"))).catch(func.noop);

bench("func.memo.hit", () => do_not_optimize(square(7)));
bench("func.memo.hit.string", () => do_not_optimize(named("a longer argument than seven")));
bench("func.memo.hit.object", () => do_not_optimize(shaped(query)));
bench("func.memo.hit.key", () => do_not_optimize(keyed(7)));
bench("func.memo.hit.ttl", () => do_not_optimize(aged(7)));
bench("func.memo.miss.evict", () => {

    miss += 1;
    do_not_optimize(small(miss));

});
bench("func.once", () => do_not_optimize(first()));
bench("func.single", async () => do_not_optimize(await flight("a")));
bench("func.single.joined", async () => do_not_optimize(await Promise.all([flight("a"), flight("a"), flight("a"), flight("a")])));
bench("func.pipe", () => do_not_optimize(func.pipe(1, ( value ) => value + 1, ( value ) => value * 2)));
bench("func.pipe.five", () => do_not_optimize(func.pipe(1, ( value ) => value + 1, ( value ) => value * 2, ( value ) => value - 3, ( value ) => value * value, ( value ) => `${value}`)));
bench("func.tap", () => do_not_optimize(func.tap(query, func.noop)));
bench("func.deferred", async () => {

    const gate = func.deferred<number>();

    gate.resolve(1);
    do_not_optimize(await gate.promise);

});
bench("func.debounce.call", () => {

    bounced(1);
    bounced.cancel();

});
bench("func.throttle.call", () => {

    limited(1);
    limited.cancel();

});
bench("func.retry.ok", async () => do_not_optimize(await func.retry(async () => 1, { times: 3 })));
bench("func.timeout.ok", async () => do_not_optimize(await func.timeout(async () => 1, 1000)));
bench("func.lane.run", async () => do_not_optimize(await lane.run(async () => 1)));
bench("func.lane.queued.64", async () => do_not_optimize(await Promise.all(jobs.map(( job ) => lane.run(async () => job)))));
bench("func.breaker.run", async () => do_not_optimize(await guard.run(async () => 1)));
bench("func.breaker.refused", async () => do_not_optimize(await tripped.run(async () => 1).catch(func.noop)));

await run();
