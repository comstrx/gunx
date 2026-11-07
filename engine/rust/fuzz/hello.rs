//! The greeting never panics.

#![no_main]
#![expect(clippy::disallowed_methods, reason = "the libFuzzer entry macro expands to `expect`")]

use engine::hello::Hello;
use libfuzzer_sys::fuzz_target;
use core::hint::black_box;

fuzz_target!(|data: &[u8]| {

    black_box(data);

    assert_eq!(Hello::world(), "hello world");

});
