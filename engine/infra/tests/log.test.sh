test:core:log:redacts-secrets () {

    core:cfg:set DB_PASSWORD 'sw0rdfish' file
    @eq "$(core:log:redact 'pass sw0rdfish here')" 'pass [redacted] here'
    @eq "$(core:cfg:show DB_PASSWORD)" '[redacted]'
    @eq "$(core:error:fail 'token sw0rdfish' 2>&1)" '[-] token [redacted]'

}
test:core:log:names-the-secrets () {

    core:log:secret API_TOKEN
    core:log:secret SLACK_WEBHOOK_URL
    core:log:secret SIGNING_KEY
    @fails core:log:secret LOG_LEVEL

}
test:core:log:honors-the-level () {

    @eq "$(LOG_LEVEL=warn @info hidden 2>&1)" ''
    @eq "$(LOG_LEVEL=warn @warn shown 2>&1)" '[!] shown'
    @eq "$(LOG_LEVEL=debug @debug shown 2>&1)" '[.] shown'
    @eq "$(@succ finished 2>&1)" '[+] finished'
    @eq "$(core:log:print a b)" $'a\nb'

}
