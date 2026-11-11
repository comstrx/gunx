from engine.error import Fault
from engine.string import Fluent, string
from collections.abc import Callable
import pytest

def test_text_helpers () -> None:

    assert string.blank("  ") and not string.blank("x")
    assert string.squish("  a   b \n c ") == "a b c"
    assert string.truncate("abcdefgh", 5) == "abcd…" and string.truncate("ab", 5) == "ab"
    assert string.find(b"hello world", b"world") == 6 and string.find("abc", "z") == -1 and string.contains("abc", "b")
    assert string.count("a-b-c", "-") == 2 and string.count("x", "") == 0
    assert string.before("key=value", "=") == "key" and string.after("key=value", "=") == "value"
    assert string.between("<b>x</b>", "<b>", "</b>") == "x" and string.after("x", "-") == ""
    assert string.before_last("a.b.c", ".") == "a.b" and string.after_last("a.b.c", ".") == "c" and string.after_last("x", ".") == ""
    assert string.trim("  x  ") == "x" and string.trim("xxaxx", "x", "left") == "axx" and string.trim("xxaxx", "x", "right") == "xxa"
    assert string.shorten("one two three four", 2) == "one two…" and string.shorten("one", 2) == "one"
    assert string.excerpt("the quick brown fox jumps", "brown", 4) == "…ick brown fox…" and string.excerpt("abc", "z") is None
    assert string.position("Hello", "l") == 2 and string.position("Hello", "L", insensitive=True) == 2
    assert string.take("abcdef", 2) == "ab" and string.take("abcdef", -2) == "ef" and string.substr("abcdef", 1, 3) == "bcd"
    assert string.chunk("abcde", 2) == ["ab", "cd", "e"] and string.lines("a\n\nb\n") == ["a", "b"]
    assert string.lines("a\n\nb", keep_blank=True) == ["a", "", "b"]

    assert string.glob("orders.paid", "orders.*") and string.glob("a.b", "a.?") and not string.glob("Orders.paid", "orders.*") and string.glob("x", "x")
    assert string.width("abc") == 3 and string.width("日本") == 4 and string.width("é") == 1 and string.width("e\u0301") == 1
    assert string.digits("٠١٢") == "012" and string.digits("१२३") == "123" and string.digits("a1") == "a1"

    with pytest.raises(Fault): string.chunk("x", 0)

def test_matching_and_replacing () -> None:

    assert string.has_any("Hello World", "zzz", "World") and not string.has_any("x", "y")
    assert string.has_all("Hello World", "hello", "world", insensitive=True) and not string.has_all("x")
    assert string.starts("engine.string", "engine.", "x") and not string.starts("a", "") and string.ends("a.py", ".py")
    assert string.like("orders.placed", "orders.*") and string.like("x", "x") and not string.like("x", "y*")
    assert string.same("Crème", "creme") and not string.same("a", "b")
    assert string.replace_first("a-a-a", "a", "b") == "b-a-a" and string.replace_last("a-a-a", "a", "b") == "a-a-b"
    assert string.replace_many("hello world", { "hello": "hi", "world": "there" }) == "hi there"
    assert string.replace_start("prefix-x", "prefix-", "") == "x" and string.replace_end("x.txt", ".txt", ".md") == "x.md"
    assert string.remove("a1b2c3", "1", "2", "3") == "abc" and string.remove("ABab", "a", insensitive=True) == "Bb"
    assert string.start("path", "/") == "/path" and string.start("/path", "/") == "/path"
    assert string.finish("path", "/") == "path/" and string.wrap("x", '"') == '"x"' and string.wrap("x", "<", ">") == "<x>"
    assert string.unwrap('"x"', '"') == "x" and string.unwrap("<x>", "<", ">") == "x"
    assert string.chop_start("app.core", "app.", "lib.") == "core" and string.chop_end("file.py", ".txt", ".py") == "file"
    assert string.pad("x", 3) == " x " and string.pad("x", 3, "0", "left") == "00x" and string.pad("x", 3, "-", "right") == "x--"
    assert string.fill("a b c d", 3) == "a b\nc d" and string.indent("a\nb", "> ") == "> a\n> b" and string.dedent("  a\n  b") == "a\nb"
    assert string.ucfirst("hello") == "Hello" and string.lcfirst("Hello") == "hello"
    assert string.highlight("Hello hello", "hello") == "<mark>Hello</mark> <mark>hello</mark>" and string.highlight("x", "") == "x"

def test_folding_slugs_and_scripts () -> None:

    assert string.fold("Crème Brûlée") == "creme brulee" and string.fold("ASCII") == "ascii"
    assert string.fold("مَرْحَبًا") == "مرحبا"
    assert string.slug("Hello, World! 2024") == "hello-world-2024" and string.slug("أهلاً بالعالم") == "اهلا-بالعالم"
    assert string.slug("x" * 200, limit=10) == "xxxxxxxxxx"
    assert string.slug("أهلاً، بالعالم؟ ٪ نعم؛ لا") == "اهلا-بالعالم-نعم-لا" and string.snake("مرحبا، يا") == "مرحبا_يا"
    assert string.words("مَرْحَبًا، يا عالم؟ ٢٠٢٤") == ["مَرْحَبًا", "يا", "عالم", "٢٠٢٤"]
    assert string.digits("٠١٢٣") == "0123" and string.eastern("2024") == "٢٠٢٤"
    assert string.arabic("سلام") and not string.arabic("salam")
    assert string.direction("مرحبا") == "rtl" and string.direction("hello") == "ltr"
    assert string.words("helloWorld foo_bar 42") == ["helloWorld", "foo", "bar", "42"]
    assert string.ascii("Crème Brûlée ß") == "Creme Brulee ss" and string.ascii("plain") == "plain"
    assert string.transliterate("محمد") == "mhmd" and string.transliterate("سلام ٢٠٢٤") == "slam 2024"
    assert string.simplify("أهلاً وسهلاً ـــ إلى القاهرة") == "اهلا وسهلا  الي القاهره"
    assert string.sentences("One. Two! Three? أربعة؟ Five") == ["One.", "Two!", "Three?", "أربعة؟", "Five"]
    assert string.word_count("hello, big world") == 3 and string.char_count("a b") == 2 and string.char_count("a b", spaces=True) == 3
    assert string.read_time(" ".join(["w"] * 400)) == 2.0 and string.numbers("x 12.5 and ٣٤ or -7") == ["12.5", "34", "-7"]
    assert string.numeric("+20 (10) 99-18") == "20109918"

def test_cases_inflection_masks_and_escapes () -> None:

    assert string.snake("helloWorldX") == "hello_world_x" and string.kebab("HelloWorld") == "hello-world"
    assert string.camel("hello_world") == "helloWorld" and string.pascal("hello world") == "HelloWorld"
    assert string.title("hello_big world") == "Hello Big World"
    assert string.plural("box") == "boxes" and string.plural("city") == "cities" and string.plural("knife") == "knives"
    assert string.plural("person") == "people" and string.plural("Child") == "Children" and string.plural("sheep") == "sheep"
    assert string.plural("item", 1) == "item" and string.plural("status") == "statuses" and string.plural("quiz") == "quizzes"
    assert string.plural("analysis") == "analyses" and string.plural("matrix") == "matrices" and string.plural("hero") == "heroes"
    assert string.singular("boxes") == "box" and string.singular("cities") == "city" and string.singular("knives") == "knife"
    assert string.singular("people") == "person" and string.singular("Children") == "Child" and string.singular("data") == "data"
    assert string.singular("statuses") == "status" and string.singular("analyses") == "analysis" and string.singular("buses") == "bus"
    assert string.mask("4111111111111111") == "41************11" and string.mask("abc") == "***"
    assert string.escape('<a href="x">&</a>') == "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"
    assert string.unescape("&lt;b&gt;") == "<b>" and string.plain("<p>Hello&nbsp;<b>world</b></p>") == "Hello world"
    assert string.initials("Abdul Rahman Yasser") == "AR"
    assert string.base64("hi") == "aGk=" and string.base64(b"\xfb\xff", url=True) == "-_8" and string.unbase64("aGk=") == b"hi"
    assert string.unbase64("-_8") == b"\xfb\xff"

    with pytest.raises(Fault) as bad: string.unbase64("###")

    assert bad.value.reason == "string.base64"

def test_similarity () -> None:

    assert string.ratio("hello", "hello") == 1.0 and string.ratio("abc", "xyz") < 0.3 and string.distance("kitten", "sitting") == 3
    assert string.closest("aplpe", ["apple", "grape", "melon"]) == "apple"
    assert string.closest("zzzz", ["apple"]) is None and string.closest("x", []) is None
    assert string.rank("apple", ["apple pie", "banana", "apples"], limit=2)[0][0] in ("apple pie", "apples")

def test_fluent_chains_every_verb () -> None:

    made = string.of("  Hello, Big World!  ")

    assert isinstance(made.squish(), Fluent) and made.squish().slug().get() == "hello-big-world"
    assert made.squish().snake().upper().get() == "HELLO_BIG_WORLD" and str(made.squish().title()) == "Hello Big World"
    assert made.squish().word_count() == 3 and made.squish().plural().get() == "Hello, Big World!s"
    assert string.of("apple").closest(["apples", "pear"]) == "apples" and string.of("a").ratio("a") == 1.0
    yes, no = True, False

    assert string.of("x").pipe(len) == 1 and string.of("x").pipe(str.upper) == "X" and string.of("x").when(yes, lambda f: f.upper()) == "X"
    assert string.of("x").when(no, lambda f: f.upper()) == "x" and string.of("x").unless(no, lambda f: f.upper()) == "X"
    assert string.of("x").tap(len).get() == "x" and len(string.of("abc")) == 3 and bool(string.of("")) is False and "b" in string.of("abc")
    assert string.of("a") == "a" and string.of("a") == string.of("a") and { string.of("a") } == { "a" } and repr(string.of("a")) == "Fluent('a')"

    with pytest.raises(AttributeError): string.of("x").nothing()

def test_the_laravel_lap_of_string_verbs () -> None:

    assert string.apa("the quick brown fox jumps over a lazy dog") == "The Quick Brown Fox Jumps Over a Lazy Dog"
    assert string.between_first("[a] [b]", "[", "]") == "a" and string.between_first("abc", "x", "y") == "abc"
    assert string.char_at("héllo", 1) == "é" and string.char_at("hi", 9) is None
    assert string.lacks("engine", ["x", "y"]) and not string.lacks("engine", "gin") and string.lacks("engine", "")
    assert string.dedupe("a   b    c") == "a b c" and string.dedupe("a--b", "-") == "a-b"
    assert string.match("order-42-done", r"order-(\d+)") == "42" and string.match("abc", r"\d") is None
    assert string.matches("a1 b22 c333", r"\d+") == ["1", "22", "333"] and string.test("abc", r"^a") and not string.test("abc", r"^b")
    assert string.replace_array("? and ? and ?", "?", ["x", "y"]) == "x and y and ?"
    assert string.replace_matches("a1b2", r"\d", "#") == "a#b#" and string.replace_matches("a1b2", r"\d", lambda m: m.group(0) * 2) == "a11b22"
    assert string.reverse("abc") == "cba" and string.reverse("é" + "e\u0301") == "e\u0301" + "é"
    assert string.splice("Hello World", "Engine", 6) == "Hello Engine" and string.splice("1300", "2", 1, 1) == "1200"
    assert string.ucsplit("engineHttpApp") == ["engine", "Http", "App"]
    assert string.word_wrap("one two three four", 9) == "one two\nthree\nfour"
    assert string.match_case("engine", "UPPER") == "ENGINE" and string.match_case("ENGINE", "Title Case") == "Engine"
    assert string.strip_ansi("\x1b[31mred\x1b[0m") == "red" and string.strip_symbols("a-b.c!") == "abc"

def test_hostile_text_is_bounded_or_refused () -> None:

    assert string.mask("secret", 0) == "******" and string.mask("secret", -1) == "******" and string.mask("ab", 1) == "**"
    assert string.plain("<" * 200_000 + "b>x") == "x" and string.plain("a<b") == "a<b" and string.plain("<scr<b>ipt>x") == "ipt>x"
    assert not string.like("a" * 5000, "*a" * 40 + "*b") and string.like("a" * 5000, "*a" * 40 + "*")
    assert string.like("abcabc", "a*c") and string.like("abc", "*") and string.like("abc", "a**c") and not string.like("ab", "ab*b")
    assert string.like("a\nb", "a*b") and not string.like("aXb", "a*B") and string.like("a.b", "a.*") and not string.like("axb", "a.*")
    assert string.slug("a b", "\\1") == "a\\1b" and string.slug("a b c", "--", 4) == "a--b" and string.slug("ab cd", limit=3) == "ab"
    assert string.slug("ab cd", limit=-1) == "" and string.slug("ab cd", "", 3) == "abc" and string.slug("--a--") == "a"
    assert string.dedupe("ababab--", "ab") == "ab--" and string.dedupe("aab", "") == "aab" and string.dedupe("a\\\\b", "\\") == "a\\b"
    assert string.pad("x", 5, "ab") == "abxab" and string.pad("x", 4, "ab", "left") == "abax" and string.pad("x", 4, "ab", "right") == "xaba"
    assert string.pad("x", 5, "") == "x" and string.pad("abc", 2) == "abc" and string.pad("x", -4) == "x" and string.pad("ab", 5) == "  ab "
    assert string.excerpt("ßßßß needle here", "NEEDLE", 2) == "…ß needle h…" and string.excerpt("the needle here", "needle", -5) == "…needle…"
    assert string.position("ßßßß needle", "NEEDLE", insensitive=True) == 5 and string.position("abcabc", "C", -2, insensitive=True) == 5
    assert string.position("abc", "", 9, insensitive=True) == -1 and string.position("abc", "", 3, insensitive=True) == 3
    assert string.replace_many("ab", { "a": "b", "b": "c" }) == "bc" and string.replace_many("ab", { "": "x" }) == "ab"
    assert string.replace_many("abc", { "ab": "1", "abc": "2" }) == "2" and string.replace_many("a.b", { ".": "\\1" }) == "a\\1b"
    assert string.replace_array("ab", "", ["x"]) == "ab" and string.replace_array("? ?", "?", ["?x", "y"]) == "?x y"
    assert string.replace_array("a?b", "?", []) == "a?b" and string.replace_matches("a1b2", r"\d", "#", -3) == "a#b#"
    assert string.numeric("x²३ ٣4") == "334" and string.truncate("abcdef", 0) == "" and string.truncate("abcdef", -3) == ""
    assert string.truncate("abcdef", 2, "...") == ".." and string.shorten("a b c", -1) == "…" and string.rank("a", ["a"], -1) == []
    assert string.find("héllo wörld", "wörld") == 6 and string.find("\ud800x", "x") == 1 and string.find("héllo", b"llo") == 3
    assert string.contains("\ud800x", "x") and string.escape("<&>\"'") == "&lt;&amp;&gt;&quot;&#39;" and string.escape("&amp;") == "&amp;amp;"

    for text in ("a-b!c", "a+b-", "aGk=é", "a", "aG=k", "aGk\n"):

        with pytest.raises(Fault) as bad: string.unbase64(text)

        assert bad.value.reason == "string.base64" and bad.value.errors == { "text": ["is not readable"] }

    work: Callable[[], object]

    for work in (
        lambda: string.match("x", "("), lambda: string.matches("x", "["), lambda: string.test("x", "*"),
        lambda: string.replace_matches("x", "(", "y"), lambda: string.replace_matches("x", "x", "\\9"),
        lambda: string.replace_matches("x", "x", "\\g<name>"),
    ):

        with pytest.raises(Fault) as bad: work()

        assert bad.value.reason == "string.pattern"

    for work in (lambda: string.fill("a b", 0), lambda: string.word_wrap("a b", -1), lambda: string.pad("x", 10 ** 12)):

        with pytest.raises(Fault) as bad: work()

        assert bad.value.reason == "string.width"

    for work in (lambda: string.base64("\ud800"), lambda: string.find("\ud800", b"x"), lambda: string.find(b"x", "\ud800")):

        with pytest.raises(Fault) as bad: work()

        assert bad.value.reason == "string.encoding"

def test_laravel_str_examples_behave_the_same () -> None:

    assert string.after("This is my name", "This is") == " my name"
    assert string.after_last("App\\Http\\Controllers\\Controller", "\\") == "Controller"
    assert string.apa("Creating A Project") == "Creating a Project"
    assert string.ascii("û") == "u" and string.ascii("ⓣⓔⓢⓣ@ⓛⓐⓡⓐⓥⓔⓛ.ⓒⓞⓜ") == "test@laravel.com"
    assert string.before("This is my name", "my name") == "This is " and string.before_last("This is my name", "is") == "This "
    assert string.between("This is my name", "This", "name") == " is my " and string.between_first("[a] bc [d]", "[", "]") == "a"
    assert string.camel("foo_bar") == "fooBar" and string.char_at("This is my name.", 6) == "s"
    assert string.chop_start("https://laravel.com", "https://") == "laravel.com"
    assert string.chop_end("app/Models/Photograph.php", ".php") == "app/Models/Photograph"
    assert string.has_any("This is my name", "my") and string.has_all("This is my name", "my", "name")
    assert string.lacks("This is my name", "foo") and not string.lacks("This is my name", "my")
    assert string.dedupe("The   Laravel   Framework") == "The Laravel Framework" and string.dedupe("a-b-", "-") == "a-b-"
    assert string.ends("This is my name", "name") and string.starts("This is my name", "This")
    assert string.excerpt("This is my name", "my", 3, "...") == "...is my na..."
    assert string.finish("this/string", "/") == "this/string/" and string.finish("this/string/", "/") == "this/string/"
    assert string.title("steve_jobs") == "Steve Jobs" and string.title("EmailNotificationSent") == "Email Notification Sent"
    assert string.initials("Taylor Otwell") == "TO" and string.like("foobar", "foo*") and not string.like("foobar", "baz*")
    assert string.kebab("fooBar") == "foo-bar" and string.lcfirst("Foo Bar") == "foo Bar" and string.char_count("Laravel") == 7
    assert string.truncate("The quick brown fox jumps over the lazy dog", 23, "...") == "The quick brown fox..."
    assert string.mask("taylor@example.com", 3) == "tay************com"
    assert string.match("foo bar", r"/bar") is None and string.match("foo bar", r"foo (.*)") == "bar"
    assert string.matches("bar foo bar", r"bar") == ["bar", "bar"] and string.test("foo bar", r"^foo")
    assert string.pad("James", 10, "_") == "__James___" and string.pad("James", 10, "-", "left") == "-----James"
    assert string.pad("James", 10, "-", "right") == "James-----"
    assert string.plural("car") == "cars" and string.plural("child") == "children" and string.plural("child", 1) == "child"
    assert string.singular("cars") == "car" and string.singular("children") == "child"
    assert string.position("Hello, World!", "Hello") == 0 and string.position("Hello, World!", "W") == 7
    assert string.remove("Peter Piper picked a peck of pickled peppers.", "e") == "Ptr Pipr pickd a pck of pickld ppprs."
    assert string.replace_array("The event will take place between ? and ?", "?", ["8:30", "9:00"]) == (
        "The event will take place between 8:30 and 9:00"
    )
    assert string.replace_first("the quick brown fox jumps over the lazy dog", "the", "a") == "a quick brown fox jumps over the lazy dog"
    assert string.replace_last("the quick brown fox jumps over the lazy dog", "the", "a") == "the quick brown fox jumps over a lazy dog"
    assert string.replace_matches("(+1) 501-555-1000", r"[^A-Za-z0-9]+", "") == "15015551000"
    assert string.replace_start("Hello World", "Hello", "Laravel") == "Laravel World"
    assert string.replace_end("Hello World", "World", "Laravel") == "Hello Laravel"
    assert string.reverse("Hello World") == "dlroW olleH"
    assert string.slug("Laravel 5 Framework", "-") == "laravel-5-framework" and string.snake("fooBar") == "foo_bar"
    assert string.squish("    laravel    framework    ") == "laravel framework"
    assert string.start("this/string", "/") == "/this/string" and string.start("/this/string", "/") == "/this/string"
    assert string.pascal("foo_bar") == "FooBar" and string.substr("The Laravel Framework", 4, 7) == "Laravel"
    assert string.count("If you like ice cream, you will like snow cones.", "like") == 2
    assert string.splice("1300", ":", 2) == "13:" and string.splice("1300", ":", 2, 0) == "13:00"
    assert string.replace_many("Tacos are great!", { "Tacos": "Burritos", "great": "fantastic" }) == "Burritos are fantastic!"
    assert string.take("Build something amazing!", 5) == "Build"
    assert string.title("a nice title uses the correct case") == "A Nice Title Uses The Correct Case"
    assert string.base64("Laravel") == "TGFyYXZlbA==" and string.unbase64("TGFyYXZlbA==") == b"Laravel"
    assert string.trim("  Laravel  ") == "Laravel" and string.trim("/Laravel/", "/") == "Laravel"
    assert string.ucfirst("foo bar") == "Foo bar" and string.ucsplit("FooBar") == ["Foo", "Bar"]
    assert string.word_count("Hello, world!") == 2
    assert string.word_wrap("The quick brown fox sat over the lazy dog", 25, "<br />\n") == "The quick brown fox sat<br />\nover the lazy dog"
    assert string.shorten("Perfectly balanced, as all things should be.", 3, " >>>") == "Perfectly balanced, as >>>"
    assert string.wrap("Laravel", '"') == '"Laravel"' and string.wrap("is", "This ", " Laravel!") == "This is Laravel!"
    assert string.of("  hello world  ").trim().title().get() == "Hello World"
