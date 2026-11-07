use crate::arch::Hello;

impl Hello {

    /// The greeting.
    #[inline]
    #[must_use]
    pub const fn world () -> &'static str {

        "hello world"

    }

}
