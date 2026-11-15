test:core:json:escapes-strings () {

    @eq "$(core:json:string 'plain')" '"plain"'
    @eq "$(core:json:string $'a"b\\c\nd\te\r')" '"a\"b\\c\nd\te\r"'
    @eq "$(core:json:string $'bell\a!')" '"bell\u0007!"'
    @eq "$(core:json:string '')" '""'
    @eq "$(LC_ALL=C.UTF-8 core:json:string 'é ✓')" '"é ✓"'

}
test:core:json:builds-objects-and-arrays () {

    local text=""

    text="$(core:json:object chat_id "$(core:json:string '-100')" text "$(core:json:string $'two\nlines')" quiet true flags 4)"
    @eq "${text}" '{"chat_id":"-100","text":"two\nlines","quiet":true,"flags":4}'

    text="$(core:json:object allowed_mentions "$(core:json:object parse "$(core:json:array)")")"
    @eq "${text}" '{"allowed_mentions":{"parse":[]}}'

    @eq "$(core:json:array 1 '"a"' true)" '[1,"a",true]'
    @eq "$(core:json:object)" '{}'
    @errors 'key and value pairs' core:json:object lonely
    @errors 'needs a key and a value' core:json:object a ''

}
