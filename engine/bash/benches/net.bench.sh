bench:core:net:host () {

    @measure 'core:net:host https url' 20 400 core:net:host 'https://api.example.com:8443/v1/items?x=1'

}
