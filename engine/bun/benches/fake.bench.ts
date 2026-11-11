import * as fake from "engine/fake";
import * as validate from "engine/validate";
import { bench, do_not_optimize, run } from "mitata";

const faker = fake.create("bench", { now: Date.UTC(2026, 0, 1) });
const arabic = fake.create("bench", { locale: "ar", now: Date.UTC(2026, 0, 1) });
const signup = validate.object({ email: validate.email(), name: validate.string().check(validate.minLength(2)), age: validate.int().check(validate.gte(18), validate.lte(60)) });
const wide = validate.object({
    id: validate.uuid(),
    handle: validate.string().check(validate.regex(/^@[a-z]{3,8}$/)),
    tags: validate.array(validate.string()).check(validate.maxLength(3)),
    pair: validate.tuple([validate.string(), validate.int()]),
    kind: validate.union([validate.literal("a"), validate.literal("b")]),
    price: validate.number().check(validate.gte(1), validate.lte(9), validate.multipleOf(0.5)),
    created_at: validate.string(),
    nested: validate.object({ items: validate.array(validate.object({ sku: validate.string(), qty: validate.int() })).check(validate.maxLength(3)) }),
});
let turn = 0;

bench("fake.create", () => do_not_optimize(fake.create("x")));
bench("fake.fork", () => do_not_optimize(faker.fork("y")));
bench("fake.fullName", () => do_not_optimize(faker.fullName()));
bench("fake.person", () => do_not_optimize(faker.person()));
bench("fake.email", () => do_not_optimize(faker.email()));
bench("fake.email named", () => do_not_optimize(faker.email("Omar Hassan")));
bench("fake.phone", () => do_not_optimize(faker.phone("SA")));
bench("fake.address ar", () => do_not_optimize(arabic.address()));
bench("fake.sentence", () => do_not_optimize(faker.sentence()));
bench("fake.paragraph", () => do_not_optimize(faker.paragraph()));
bench("fake.text 40..80", () => do_not_optimize(faker.text(40, 80)));
bench("fake.uuid", () => do_not_optimize(faker.uuid()));
bench("fake.money", () => do_not_optimize(faker.money()));
bench("fake.iso", () => do_not_optimize(faker.iso()));
bench("fake.birthdate", () => do_not_optimize(faker.birthdate()));
bench("fake.coordinates", () => do_not_optimize(faker.coordinates()));
bench("fake.barcode", () => do_not_optimize(faker.barcode()));
bench("fake.file", () => do_not_optimize(faker.file()));
bench("fake.matching phone", () => do_not_optimize(faker.matching("^\\+20(10|11|12|15)\\d{8}$")));
bench("fake.matching fresh pattern", () => {

    turn += 1;
    do_not_optimize(faker.matching(`^[a-z]{${(turn % 5) + 1}}$`));

});
bench("fake.unique 50", () => do_not_optimize(faker.unique(50, () => faker.integer(0, 1000))));
bench("fake.pickMany 5 of 20", () => do_not_optimize(faker.pickMany([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 5)));
bench("fake.from signup", () => do_not_optimize(faker.from(signup)));
bench("fake.from wide", () => do_not_optimize(faker.from(wide)));
bench("fake.payload wide", () => do_not_optimize(faker.payload(wide)));
bench("fake.from with overrides", () => do_not_optimize(faker.from(wide, { "nested.items.*.sku": "FIXED", kind: "a" })));
bench("fake.records 25 x from", () => do_not_optimize(faker.records(25, ( _, maker ) => maker.from(signup))));

await run();
