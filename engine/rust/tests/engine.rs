//! The contract of the facade.

#[cfg(test)]
mod tests {

    use engine::hello::Hello;

    #[test]
    fn the_facade_names_every_domain () {

        let greeting: &str = Hello::world();

        assert_ne!(greeting, "");

    }

}
