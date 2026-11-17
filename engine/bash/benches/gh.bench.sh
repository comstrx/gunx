bench:core:gh:hosted () {

    @measure 'core:gh:hosted host/owner/name' 20 200 core:gh:hosted github.com/owner/name

}
bench:core:gh:base () {

    @measure 'core:gh:base github.com' 20 400 core:gh:base github.com

}
