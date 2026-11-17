bench:core:install:command () {

    @measure 'core:install:command present' 20 200 core:install:command bash

}
bench:core:install:need () {

    @measure 'core:install:need 3 present' 20 100 core:install:need bash tar gzip

}
