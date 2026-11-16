test:config:packages:maps-the-runtime () {

    @eq "$(config:packages:name apt xz)" xz-utils
    @eq "$(config:packages:name apt curl)" curl
    @contains "$(config:packages:runtime | tr '\n' ' ')" 'curl tar xz gzip git'

}
