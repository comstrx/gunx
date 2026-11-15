test:module:notify:writes-the-event () {

    local text=""

    text="$(module:notify:event failed 'gate infra' $'two\nlines' https://ci.example.com/run/1 75)"

    @contains "${text}" '❌ gate infra failed in 1m15s'
    @contains "${text}" $'\n\ntwo\nlines\n\nhttps://ci.example.com/run/1'
    @eq "$(module:notify:duration 3725)" 1h2m5s
    @eq "$(module:notify:duration 9)" 9s
    @eq "$(module:notify:clip abcdef 4)" 'abc…'
    @eq "$(module:notify:clip abc 4)" abc
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
