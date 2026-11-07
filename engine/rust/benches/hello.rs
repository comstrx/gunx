//! What the greeting costs.

use criterion::{Criterion, criterion_group, criterion_main};
use core::hint::black_box;
use engine::hello::Hello;

fn bench_hello ( harness: &mut Criterion ) {

    let mut group = harness.benchmark_group("hello");

    group.bench_function("world", |bencher| bencher.iter(|| black_box(Hello::world())));
    group.bench_function("world.len", |bencher| bencher.iter(|| black_box(Hello::world().len())));

    group.finish();

}

criterion_group!(benches, bench_hello);
criterion_main!(benches);
