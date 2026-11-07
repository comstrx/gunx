//! The contract of `engine::hello`.

#[cfg(test)]
mod tests {

    use engine::hello::Hello;

    #[test]
    fn world_is_exactly_the_greeting () {

        assert_eq!(Hello::world(), "hello world");
        assert_eq!(Hello::world().len(), 11);

    }

    #[test]
    fn world_is_the_same_on_every_call () {

        let first = Hello::world();
        let second = Hello::world();

        assert_eq!(first.as_ptr(), second.as_ptr());
        assert_eq!(Hello::default(), Hello::default());

    }

}
