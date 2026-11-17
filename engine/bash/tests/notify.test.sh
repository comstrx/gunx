test:module:notify:writes-the-event () {

    local text=""

    text="$(module:notify:event failed 'gate infra' $'two\nlines' https://ci.example.com/run/1 75)"

    @contains "${text}" '❌ gate infra failed in 1m15s'
    @contains "${text}" $'\n\ntwo\nlines\n\nhttps://ci.example.com/run/1'
    @eq "$(module:notify:duration 3725)" 1h2m5s
    @eq "$(module:notify:duration 9)" 9s
    @eq "$(module:notify:clip abcdef 4)" 'abc…'
    @eq "$(module:notify:clip abc 4)" abc
    @contains "$(module:notify:event cancelled demo)" '🚫 demo cancelled'
    @eq "$(module:notify:status startup_failure)" failed
    @eq "$(module:notify:status cancelled)" cancelled
    @errors 'Unknown status: green' module:notify:event green
    @errors 'A link is an https URL' module:notify:event info x '' http://x
    @errors 'Seconds must be a number' module:notify:event info x '' '' 1.5

}
test:module:notify:stays-quiet-without-channels () {

    fixture:core:net:curl

    @contains "$(module:notify:send info demo hello 2>&1)" 'No notify channel is configured'
    [[ ! -s "${FAKE_CURL_LOG}" ]]

}
test:module:notify:fans-out-to-every-channel () {

    local report="" log=""

    fixture:core:net:curl
    export FAKE_CURL_MODE=ok

    CONFIG[NOTIFY_TELEGRAM_TOKEN]=123:SECRETBOT
    CONFIG[NOTIFY_TELEGRAM_CHAT]=-100200
    CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]=https://discord.example.com/api/webhooks/1/HOOKSECRET
    CONFIG[NOTIFY_WEBHOOK_URL]=https://hooks.example.com/in
    CONFIG[NOTIFY_WEBHOOK_TOKEN]=BEARERSECRET

    report="$(module:notify:send passed 'gate infra' '<done> & dusted' '' 12)"
    log="$(cat "${FAKE_CURL_LOG}")"

    @contains "${report}" 'telegram'
    @contains "${report}" 'sent'
    @contains "${report}" 'off'
    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 3
    @absent "${log}" SECRETBOT
    @absent "${log}" HOOKSECRET
    @absent "${log}" BEARERSECRET
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'header = "Authorization: Bearer BEARERSECRET"'

}
test:module:notify:refuses-half-a-channel () {

    fixture:core:net:curl

    CONFIG[NOTIFY_TELEGRAM_TOKEN]=123:SECRETBOT

    @errors 'NOTIFY_TELEGRAM_CHAT must be a chat id' module:notify:send info demo hello
    [[ ! -s "${FAKE_CURL_LOG}" ]] || @err 'a refused setting still sent a message'

    CONFIG[NOTIFY_TELEGRAM_TOKEN]=''
    CONFIG[NOTIFY_SLACK_WEBHOOK_URL]=http://plain.example.com/x
    @errors 'NOTIFY_SLACK_WEBHOOK_URL must be an https URL' module:notify:send info demo hello

    CONFIG[NOTIFY_SLACK_WEBHOOK_URL]=''
    CONFIG[NOTIFY_EMAIL_TO]=ops@example.com
    @errors 'NOTIFY_EMAIL_SMTP_URL must be' module:notify:send info demo hello

}
test:module:notify:reports-a-failed-channel () {

    local report=""

    fixture:core:net:curl
    export FAKE_CURL_MODE=server

    CONFIG[NOTIFY_SLACK_WEBHOOK_URL]=https://hooks.example.com/services/T/B/SLACKSECRET

    report="$(module:notify:send failed demo hello 2>/dev/null)" || true

    @contains "${report}" 'failed'
    @errors 'A notify channel failed' module:notify:send failed demo hello
    @absent "$(module:notify:send failed demo hello 2>&1 || true)" SLACKSECRET

}
test:module:notify:shapes-every-payload () {

    local -A event=( [message]='<a> & <b>' )

    fixture:core:net:curl
    export FAKE_CURL_MODE=ok

    CONFIG[NOTIFY_SLACK_WEBHOOK_URL]=https://hooks.example.com/services/T/B/X
    CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]=https://discord.example.com/api/webhooks/1/X

    module:notify:slack:send event
    @eq "$(cat "${FAKE_CURL_LOG}.body")" '{"text":"&lt;a&gt; &amp; &lt;b&gt;"}'

    module:notify:discord:send event
    @eq "$(cat "${FAKE_CURL_LOG}.body")" '{"content":"<a> & <b>","allowed_mentions":{"parse":[]},"flags":4}'

    CONFIG[NOTIFY_TELEGRAM_TOKEN]=123:X
    CONFIG[NOTIFY_TELEGRAM_CHAT]=-100200
    module:notify:telegram:send event
    @eq "$(cat "${FAKE_CURL_LOG}.body")" '{"chat_id":"-100200","text":"<a> & <b>","link_preview_options":{"is_disabled":true}}'
    @eq "$(module:notify:clip "$(printf '%*s' 2500 '')" 2000 | wc -m | tr -d ' ')" 2001

}
test:module:notify:mails-through-smtp () {

    local -A event=( [message]=$'✅ gate infra passed\n\nall green' )

    fixture:core:net:curl
    export FAKE_CURL_MODE=ok

    CONFIG[NOTIFY_EMAIL_SMTP_URL]=smtps://smtp.example.com:465
    CONFIG[NOTIFY_EMAIL_USER]=bot
    CONFIG[NOTIFY_EMAIL_PASSWORD]=MAILSECRET
    CONFIG[NOTIFY_EMAIL_FROM]=bot@example.com
    CONFIG[NOTIFY_EMAIL_TO]='ops@example.com, dev@example.com'

    module:notify:email:check
    module:notify:email:send event

    @absent "$(cat "${FAKE_CURL_LOG}")" MAILSECRET
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'mail-rcpt = "dev@example.com"'
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'user = "bot:MAILSECRET"'
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'ssl-reqd'
    @contains "$(cat "${FAKE_CURL_LOG}.mail")" 'To: ops@example.com, dev@example.com'
    @contains "$(cat "${FAKE_CURL_LOG}.mail")" 'Subject: =?UTF-8?B?'
    @contains "$(cat "${FAKE_CURL_LOG}.mail")" $'\n\n✅ gate infra passed\n\nall green'
    @eq "$(module:notify:email:subject 'plain subject')" 'plain subject'

    CONFIG[NOTIFY_EMAIL_TO]='ops@example.com, not-a-mail'
    @errors 'NOTIFY_EMAIL_TO holds a bad address' module:notify:email:check

}
test:module:notify:picks-the-channels () {

    local report=""

    fixture:core:net:curl
    export FAKE_CURL_MODE=ok

    CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]=https://discord.example.com/api/webhooks/1/X
    CONFIG[NOTIFY_WEBHOOK_URL]=https://hooks.example.com/in
    CONFIG[NOTIFY_TELEGRAM_TOKEN]=123:X

    report="$(module:notify:send passed demo hi '' '' ' discord, discord')"

    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 1
    @contains "${report}" sent
    @contains "${report}" off
    @contains "$(cat "${FAKE_CURL_LOG}.config")" "max-time = ${CONFIG[RUN_TIMEOUT]}"

    module:notify:send passed demo hi '' '' webhook 2 9 >/dev/null
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'max-time = 9'

    @errors 'Unknown channel: sms' module:notify:send passed demo hi '' '' sms
    @errors 'slack is asked for but its NOTIFY_ settings are empty' module:notify:send passed demo hi '' '' slack
    @errors '--channel names no channel' module:notify:send passed demo hi '' '' ' , '
    @errors 'NOTIFY_TELEGRAM_CHAT must be a chat id' module:notify:send passed demo hi
    @errors '--retry is 1 to 10' module:notify:send passed demo hi '' '' discord 0
    @errors '--timeout is whole seconds' module:notify:send passed demo hi '' '' discord 3 1x

}
test:module:notify:retries-what-never-left () {

    fixture:core:net:curl
    export FAKE_CURL_MODE=refused

    CONFIG[RUN_BACKOFF]=0
    CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]=https://discord.example.com/api/webhooks/1/X

    module:notify:send failed demo hi '' '' discord 2 >/dev/null 2>&1 || true

    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 2

}
test:module:notify:fills-the-blanks-from-the-run () {

    local body=""

    fixture:core:net:curl
    export FAKE_CURL_MODE=ok GITHUB_ACTIONS=true GITHUB_REPOSITORY=acme/shop GITHUB_WORKFLOW=ci GITHUB_RUN_NUMBER=42 GITHUB_RUN_ID=7
    export GITHUB_EVENT_NAME=push GITHUB_REF_NAME=main GITHUB_SHA=0123456789abcdef GITHUB_ACTOR=octo GITHUB_SERVER_URL=https://github.com

    CONFIG[PROJECT]=''
    CONFIG[RELEASE]=''
    CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]=https://discord.example.com/api/webhooks/1/X

    module:notify:send success >/dev/null
    body="$(cat "${FAKE_CURL_LOG}.body")"

    @contains "${body}" '✅ shop ci passed'
    @contains "${body}" '#42 · push on main · 0123456789ab by octo'
    @contains "${body}" 'https://github.com/acme/shop/actions/runs/7'

    module:notify:send skipped >/dev/null
    @contains "$(cat "${FAKE_CURL_LOG}.body")" 'shop ci skipped'

    module:notify:send timed_out >/dev/null
    @contains "$(cat "${FAKE_CURL_LOG}.body")" 'shop ci timed-out'

}
test:module:notify:takes-its-text-as-a-flag () {

    @errors 'the text goes in --message' bash "${TOOL_BIN}" notify hello
    @errors '--sec is --seconds' bash "${TOOL_BIN}" notify --sec 1 --seconds 2
    @errors '--retry is 1 to 10' bash "${TOOL_BIN}" notify --retry 11 --message hi
    @contains "$(bash "${TOOL_BIN}" help notify)" '--channel C'

}
test:module:notify:duration-reads-only-a-count () {

    @eq "$(module:notify:duration 3725)" 1h2m5s
    @eq "$(module:notify:duration 59)" 59s
    @eq "$(module:notify:duration 'not a number')" 0s
    @eq "$(module:notify:duration '1+1')" 0s
    @eq "$(module:notify:duration 99999999999999999999)" 0s

}
