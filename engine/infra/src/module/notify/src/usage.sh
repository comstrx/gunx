@usage notify module:notify:run 'notify TEXT [--status S] [--title T] [--link URL] [--seconds N]' 'Report to every configured channel: telegram, slack, discord, webhook, email' || return
@flag notify '--status S' 'passed, failed, timed-out, warn or info; info by default' || return
@flag notify '--title T' 'The subject of the message, the project or the tool by default' || return
@flag notify '--link URL' 'An https link to the run, the commit or the release' || return
@flag notify '--seconds N' 'How long the reported run took' || return
