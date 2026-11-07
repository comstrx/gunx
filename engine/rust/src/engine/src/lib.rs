//! The one door into the engine: one module and one feature per domain.

#![forbid(unsafe_code)]

/// The first domain.
#[cfg(feature = "hello")]
pub mod hello {

    pub use hello::Hello;

}
