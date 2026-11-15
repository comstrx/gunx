from engine.error import Fault
from engine.string import Fluent, String, string
from engine.func import func
from collections.abc import Callable, Iterator
from rapidfuzz import fuzz, process
from typing import assert_type
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

@pytest.mark.parametrize("mode", ["native", "pure"])
def test_find_keeps_text_and_byte_offsets_at_every_boundary ( mode: str ) -> None:

    previous = func.mode()

    try:

        func.setup(mode)

        finder = String()

        for text in ("", "abc", "مَرْحَبًا 🌍 café", "a" * 4096 + "needle"):

            for needle in ("", "a", "needle", "🌍", "missing"):

                raw, pattern = text.encode(), needle.encode()

                for start in (-10 ** 30, -5, 0, 1, len(raw), len(raw) + 1, 10 ** 30):

                    assert finder.find(text, needle, start) == text.find(needle, start)
                    assert finder.find(raw, pattern, start) == raw.find(pattern, start)
                    assert finder.find(text, pattern, start) == raw.find(pattern, start)
                    assert finder.find(raw, needle, start) == raw.find(pattern, start)

    finally: func.setup(previous)

@pytest.mark.parametrize("text", ["", "  ", "a", " a  b\n c ", "\u0623\u0647\u0644\u0627\u2003\u0628\u0627\u0644\u0639\u0627\u0644\u0645 \u0627\u0644\u0622\u0646", "e\u0301 x y"])
@pytest.mark.parametrize("limit", [-3, 0, 1, 2, 10**30])
def test_shortening_matches_word_selection ( text: str, limit: int ) -> None:

    words = text.split()
    expected = text if len(words) <= limit else " ".join(words[:max(0, limit)]) + "…"

    assert string.shorten(text, limit) == expected

def test_text_reversal_and_affixes_keep_their_contract () -> None:

    assert string.reverse("abc\n123") == "321\ncba"
    assert string.reverse("e\u0301a") == "ae\u0301"
    assert not string.starts("abc", "", "") and not string.ends("abc", "", "")
    assert string.starts("abc", "", "a") and string.ends("abc", "", "c")

def test_lacks_stops_after_a_matching_needle () -> None:

    def needles () -> Iterator[str]:

        yield "found"

        raise AssertionError("an already decided search consumed more input")

    assert not string.lacks("found", needles())

def test_replace_many_is_simultaneous_and_literal () -> None:

    assert string.replace_many("abc ab a", { "a": "abc", "ab": "x", "abc": "y" }) == "y x abc"
    assert string.replace_many("لغة لغة", { "لغة": "\\1", "": "ignored" }) == "\\1 \\1"
    assert string.replace_many("a+b a.b", { "a+b": "plus", "a.b": "dot" }) == "plus dot"
    assert string.replace_many("unchanged", {}) == "unchanged"

@pytest.mark.parametrize(("text", "opening", "closing", "expected"), [
    ("prefix[value]tail", "[", "]", "value"), ("before[tail", "[", "]", "tail"),
    ("plain", "[", "]", ""), ("before]then[value]tail", "[", "]", "value"),
    ("abc", "", "b", "a"), ("abc", "a", "", ""), ("abc", "", "", ""),
    ("aaaa", "aa", "aa", ""), ("\u0645[\u0631\u062d\u0628\u0627]\u0627", "[", "]", "\u0631\u062d\u0628\u0627"),
])
def test_between_preserves_delimiter_boundaries ( text: str, opening: str, closing: str, expected: str ) -> None:

    assert string.between(text, opening, closing) == expected

@pytest.mark.parametrize(("start", "length", "picked", "replaced"), [
    (-2, 4, "ef", "abcdX"), (-2, 1, "e", "abcdXf"), (-2, 0, "", "abcdXef"),
    (-2, -1, "e", "abcdXf"), (-2, -2, "", "abcdXef"), (-2, -20, "", "abcdXef"),
    (-20, 2, "ab", "Xcdef"), (-20, None, "abcdef", "X"), (20, 3, "", "abcdefX"),
    (20, -1, "", "abcdefX"), (2, -1, "cde", "abXf"), (2, -20, "", "abXcdef"),
    (0, 0, "", "Xabcdef"), (0, None, "abcdef", "X"), (2, None, "cdef", "abX"),
    (10**30, 10**30, "", "abcdefX"), (-(10**30), 10**30, "abcdef", "X"),
])
def test_ranges_have_one_offset_and_length_contract (
    start: int, length: int | None, picked: str, replaced: str,
) -> None:

    assert string.substr("abcdef", start, length) == picked
    assert string.splice("abcdef", "X", start, length) == replaced

def test_ranges_use_codepoints_and_accept_empty_text () -> None:

    assert string.substr("أ🙂é終", -3, 2) == "🙂é"
    assert string.splice("أ🙂é終", "ع", -3, 2) == "أع終"
    assert string.substr("", -10, -2) == ""
    assert string.splice("", "X", -10, -2) == "X"
    assert string.of("abcdef").splice("X", -2, 4).get() == "abcdX"

@pytest.mark.parametrize(("text", "pattern", "expected", "first"), [
    ("b ab", "(a)?b", ["", "a"], None),
    ("ab b", "(a)?b", ["a", ""], "a"),
    ("ab b", "(a)?(b)", ["a", ""], "a"),
    ("ab", "(?P<first>a)?b", ["a"], "a"),
    ("b", "(a*)b", [""], ""),
    ("ab", "", ["", "", ""], ""),
    ("bb", "b", ["b", "b"], "b"),
    ("abc", "(z)", [], None),
])
def test_regex_results_have_stable_capture_semantics (
    text: str, pattern: str, expected: list[str], first: str | None,
) -> None:

    assert string.matches(text, pattern) == expected
    assert string.match(text, pattern) == first

@pytest.mark.parametrize(("text", "expected"), [
    ("123 مرحبا", "rtl"), ("١٢٣ Hello", "ltr"), ("123 שלום", "rtl"),
    ("--- 123", "ltr"), ("", "ltr"), ("é مرحبا", "ltr"), ("\u0301\u0645\u0631\u062d\u0628\u0627", "rtl"),
    ("\u200fHello", "rtl"), ("\u200e\u0645\u0631\u062d\u0628\u0627", "ltr"), ("مرحبا Hello", "rtl"),
])
def test_direction_uses_the_first_strong_character ( text: str, expected: str ) -> None:

    assert string.direction(text) == expected

def test_rank_matches_the_provider_and_keeps_original_values () -> None:

    choices = ["Crème", "CREME", "creme", "other", "مَرْحَبًا", "مرحبا"]
    expected = process.extract("creme", [string.fold(item) for item in choices], scorer=fuzz.WRatio, limit=6)
    ranked = [(choices[index], score / 100.0) for _, score, index in expected]

    assert string.rank("Crème", choices, 10**30) == ranked
    assert string.rank("Crème", iter(choices), 10**30) == ranked
    assert string.rank("Crème", choices, floor=1.0) == [("Crème", 1.0), ("CREME", 1.0), ("creme", 1.0)]
    assert string.rank("missing", [], 10**30) == []
    assert string.rank("", [""]) == [("", 0.0)]
    assert string.closest("Crème", choices) == "Crème"
    assert string.closest("مَرْحَبًا", iter(choices)) == "مَرْحَبًا"
    assert string.closest("absent", ["other"], floor=1.0) is None
    assert string.closest("absent", iter(())) is None

def test_closest_and_disabled_rank_do_not_consume_unneeded_choices () -> None:

    def choices () -> Iterator[str]:

        yield "Crème"

        raise AssertionError("perfect match must stop consumption")

    assert string.closest("creme", choices()) == "Crème"
    assert string.rank("creme", choices(), 0) == []

@pytest.mark.parametrize("floor", [-0.1, 1.1, float("nan"), float("inf"), -float("inf")])
def test_fuzzy_threshold_errors_are_engine_faults ( floor: float ) -> None:

    with pytest.raises(Fault) as caught: string.closest("a", ["a"], floor=floor)

    assert caught.value.reason == "string.floor"

    with pytest.raises(Fault) as caught: string.rank("a", ["a"], floor=floor)

    assert caught.value.reason == "string.floor"

def test_initials_use_a_nonnegative_bounded_word_count () -> None:

    assert string.initials("  Ada   Lovelace  Byron", 2) == "AL"
    assert string.initials("  élan \t عربي \n 🙂", 10**30) == "Éع🙂"
    assert string.initials("one two", 0) == ""
    assert string.initials("one two", -1) == ""
    assert string.initials(" \t\n", 10**30) == ""

def test_fluent_callbacks_preserve_result_types_and_isolation () -> None:

    left = string.of("abc")
    right = left.pipe(str.upper)
    count = left.pipe(len)

    assert_type(right, Fluent)
    assert_type(count, int | Fluent)
    assert right.get() == "ABC"
    assert left.get() == "abc"
    assert count == 3
    assert left.when(condition=False, step=lambda _: 99) is left
    assert left.unless(condition=True, step=lambda _: 99) is left
    assert left.when(condition=True, step=len) == 3
    assert left.unless(condition=False, step=len) == 3

    seen: list[str] = []

    assert left.tap(seen.append) is left
    assert seen == ["abc"]

    with pytest.raises(AttributeError): left._range_(1, 0, None)
    with pytest.raises(AttributeError): left.not_a_verb()

def test_single_replacement_keeps_literal_and_nonrecursive_behavior () -> None:

    assert string.replace_many("aaaa", {"aa": "aaa"}) == "aaaaaa"
    assert string.replace_many("a+b a+b", {"a+b": "\\1", "": "ignored"}) == "\\1 \\1"

def test_fuzzy_threshold_keeps_subnormal_and_boundary_values () -> None:

    assert string.rank("", [""], floor=5e-324) == []
    assert string.closest("", [""], floor=5e-324) is None

    choices = ["abc", "ac", "abcd", "other"]

    for item, score in string.rank("abc", choices, len(choices)):

        assert (item, score) in string.rank("abc", choices, len(choices), floor=score)

def test_fluent_pipe_types_allow_a_callback_with_mixed_results () -> None:

    def choose ( value: str ) -> str | int:

        return value.upper() if value else 0

    result = string.of("abc").pipe(choose)

    assert_type(result, str | int | Fluent)
    assert isinstance(result, Fluent)
    assert result.get() == "ABC"
    assert string.of("").pipe(choose) == 0

def test_fuzzy_iterables_do_not_inherit_provider_mapping_semantics () -> None:

    choices = {"Crème": "unrelated", "other": "creme"}

    assert string.closest("creme", choices) == "Crème"
    assert string.rank("creme", choices, floor=1.0) == [("Crème", 1.0)]

@pytest.mark.parametrize(("text", "expected"), [
    ("a👩🏽‍💻b", "b👩🏽‍💻a"), ("🇪🇬🇯🇵", "🇯🇵🇪🇬"),
    ("a\r\nb", "b\r\na"), ("e\u0301a", "ae\u0301"),
    ("\r\n\r", "\r\r\n"), ("\n\r\n\r", "\r\r\n\n"), ("\n\r", "\r\n"),
    ("a✈️b", "b✈️a"), ("a1️⃣b", "b1️⃣a"),
    ("a\u1100\u1161\u11a8b", "b\u1100\u1161\u11a8a"),
    ("\u0301a", "a\u0301"), ("\ud800a", "a\ud800"),
    ("", ""), ("abc\nxyz", "zyx\ncba"),
])
def test_reverse_preserves_original_grapheme_clusters ( text: str, expected: str ) -> None:

    assert string.reverse(text) == expected
    assert string.of(text).reverse().get() == expected

def test_reverse_retains_a_large_combining_cluster () -> None:

    cluster = "e" + "\u0301" * 20000

    assert string.reverse(cluster + "x") == "x" + cluster
    assert string.reverse(cluster) == cluster

@pytest.mark.parametrize(("text", "expected"), [
    ("Crème Brûlée", "creme brulee"),
    ("ـــمَرْحَبًاـــ", "مرحبا"),
    ("\uff28\uff45\uff4c\uff4c\uff4f \uff11\uff12\uff13", "hello 123"),
    ("ﬃ ①", "ffi 1"),
    ("\ufefb\ufe77\u0640", "لا"),
    ("\ud800x", "\ud800x"),
])
def test_folding_preserves_compatibility_and_arabic_semantics ( text: str, expected: str ) -> None:

    assert string.fold(text) == expected

@pytest.mark.parametrize(("separator", "limit", "expected"), [
    ("-", 0, ""), ("-", -1, ""), ("-", 1, "a"), ("-", 2, "ab"), ("-", 3, "abc"),
    ("-", 4, "abc"), ("-", 5, "abc-d"), ("-", 6, "abc-de"), ("-", 7, "abc-def"),
    ("::", 4, "abc"), ("::", 5, "abc"), ("::", 6, "abc::d"),
    ("", 4, "abcd"), ("ab", 6, "abcabd"), ("\\1", 6, "abc\\1d"),
])
def test_bounded_slug_keeps_whole_separators ( separator: str, limit: int, expected: str ) -> None:

    assert string.slug("...abc def ghi...", separator, limit) == expected
    assert string.slug("...abc def ghi..." + " ignored" * 1000, separator, limit) == expected

def test_slug_large_single_word_and_empty_inputs () -> None:

    assert string.slug("x" * 100000, limit=5) == "xxxxx"
    assert string.slug("! " * 10000) == ""
    assert string.slug("", limit=10**30) == ""
    assert string.slug("a b", separator="", limit=10**30) == "ab"

@pytest.mark.parametrize(("text", "limit", "suffix", "expected"), [
    ("a👩🏽‍💻b🇪🇬c", 4, "…", "a👩🏽‍💻b…"),
    ("e\u0301x", 1, "", "e\u0301"),
    ("a\r\nb", 2, "", "a"),
    ("a\r\nbc", 3, "", "a\r\nb"),
    ("\u0600 x", 1, "", "\u0600 "),
    ("🇪🇬🇯🇵x", 2, "👩🏽‍💻", "🇪🇬👩🏽‍💻"),
    ("abc", 1, "👩🏽‍💻🇪🇬", "👩🏽‍💻"),
    ("e\u0301", 1, "…", "e\u0301"),
    ("abc", -1, "…", ""),
    ("", 0, "…", ""),
    ("a👩🏽‍💻", 10**100, "…", "a👩🏽‍💻"),
])
def test_grapheme_truncation_preserves_original_clusters (
    text: str, limit: int, suffix: str, expected: str,
) -> None:

    assert string.truncate(text, limit, suffix, graphemes=True) == expected
    assert string.of(text).truncate(limit, suffix, graphemes=True).get() == expected

def test_graphemes_are_lazy_and_rejoin_the_original () -> None:

    text = "e\u0301👩🏽‍💻🇪🇬\r\n"
    parts = string.graphemes(text)

    assert iter(parts) is parts
    assert next(parts) == "e\u0301"
    assert list(parts) == ["👩🏽‍💻", "🇪🇬", "\r\n"]
    assert "".join(string.graphemes(text)) == text
    assert string.truncate("e\u0301x", 1, "") == "e"

@pytest.mark.parametrize(("text", "pattern", "matched"), [
    ("123", r"\d+", True), ("a123", r"\d+", False), ("123\n", r"\d+", False),
    ("", r"a*", True), ("a\nb", r"a.*b", False),
])
def test_full_matching_is_explicit ( text: str, pattern: str, matched: bool ) -> None:

    assert string.test(text, pattern, full=True) is matched

def test_multiple_character_replacement_is_simultaneous_and_literal () -> None:

    assert string.replace_many("aabé", {"a": "b", "b": "a", "é": "\\1"}) == "bba\\1"
    assert string.replace_many("aaba", {"a": "", "b": "aa", "": "ignored"}) == "aa"
    assert string.replace_many("aaaab", {"aa": "x", "a": "y", "b": ""}) == "xx"

@pytest.mark.parametrize(("text", "width", "fill"), [
    ("", 0, "ab"), ("x", 12, "abc"), ("x", 13, "abc"), ("", 15, "abc"),
    ("word", 7, "👩🏽‍💻"), ("word", 40, "xy" * 50), ("x", 65536, "12345"),
])
def test_padding_preserves_exact_pattern_boundaries ( text: str, width: int, fill: str ) -> None:

    for side in ("left", "right", "both"):

        room = max(0, width - len(text))
        left = room if side == "left" else 0 if side == "right" else room // 2 + (room & width & 1)
        repeat = (fill * (room // len(fill) + 1))[:room]
        expected = repeat[:left] + text + repeat[:room - left]

        assert string.pad(text, width, fill, side) == expected

def test_large_grapheme_truncation_keeps_the_suffix_budget () -> None:

    cluster = "👩🏽‍💻"
    text = cluster * 10000

    assert string.truncate(text, 5000, "…", graphemes=True) == cluster * 4999 + "…"
    assert string.truncate(text, 5000, "", graphemes=True) == cluster * 5000
    assert string.truncate("a\r\n" * 10000, 2, "", graphemes=True) == "a"

def test_template_is_literal_single_pass_and_supports_delimiters () -> None:

    assert string.template("Hi {user.name}", {"user": {"name": "A"}}) == "Hi A"
    assert string.template("{a}", {"a": "{b}", "b": "hidden"}) == "{b}"
    assert string.template("__name__", {"name": "A"}, delimiters=("__", "__")) == "A"
    assert string.template("**__name__**", {"name": "B"}, delimiters=("**__", "__**")) == "B"
    assert string.keys("{a} {a} {user.name}") == ["a", "user.name"]
    assert string.template("{unknown}", {}, strict=False) == "{unknown}"
    assert string.split(" a ,, b ,") == ["a", "b"]
    assert string.split(" a ,,", strip=False, empty=True) == [" a ", "", ""]

def test_template_rejects_missing_keys_and_expansion_budget () -> None:

    with pytest.raises(Fault): string.template("{missing}", {})
    with pytest.raises(Fault): string.template("x", {}, delimiters=("", "}"))
    with pytest.raises(Fault): string.template("{x}{x}", {"x": "a" * (5 * 1024 * 1024)})

def test_adjacent_custom_placeholders_end_at_the_first_literal_closer () -> None:

    assert string.template("__a____b__", {"a": "left", "b": "right"}, delimiters=("__", "__")) == "leftright"
    assert string.keys("__a____b__", ("__", "__")) == ["a", "b"]
    assert string.template("[[user_name]][[port]]", {"user_name": "worker", "port": 80}, delimiters=("[[", "]]")) == "worker80"

def test_custom_templates_scan_invalid_and_missing_closers_without_backtracking () -> None:

    text = "__" * 10000 + "!$$"
    assert string.template(text, {}, delimiters=("__", "$$")) == text
    assert string.keys(text, ("__", "$$")) == []
    assert string.keys("a" * 10000, ("a", "z")) == []

@pytest.mark.parametrize(("opening", "closing"), [("{", "}"), ("__", "__"), ("**__", "__**"), ("[[", "]]")])
def test_template_padding_and_single_pass ( opening: str, closing: str ) -> None:

    text = f"{opening} \tuser.name \t{closing}{opening} value {closing}"
    values = {"user": {"name": "A"}, "value": "{ignored}"}
    assert string.template(text, values, delimiters=(opening, closing)) == "A{ignored}"
    assert string.keys(text, (opening, closing)) == ["user.name", "value"]
    assert string.template(text, {}, strict=False, delimiters=(opening, closing)) == text

@pytest.mark.parametrize(("strip", "empty", "expected"), [
    (True, True, ["a", "", "b", ""]), (True, False, ["a", "b"]),
    (False, True, [" a ", " ", " b ", ""]), (False, False, [" a ", " ", " b "]),
])
def test_split_options_preserve_blanks ( strip: bool, empty: bool, expected: list[str] ) -> None:

    assert string.split(" a , , b ,", strip=strip, empty=empty) == expected

def test_explicit_base64_alphabets_and_canonical_bits () -> None:

    assert string.base64(b"\xfb\xff", url=True) == "-_8"
    assert string.base64(b"\xfb\xff") == "+/8="
    assert string.unbase64("-_8", url=True, canonical=True) == b"\xfb\xff"
    assert string.unbase64("+/8=", url=False, canonical=True) == b"\xfb\xff"
    assert string.unbase64("Zh", url=True) == b"f"

    for text in ("Zh", "Zg=", "Zg==", "Zg\n", "+/8", "é", "\ud800", "Z"):

        with pytest.raises(Fault): string.unbase64(text, url=True, canonical=True)

    for text in ("Zh==", "-_8=", "Zg", "Zg==\n"):

        with pytest.raises(Fault): string.unbase64(text, url=False, canonical=True)

    assert string.unbase64("Zg") == string.unbase64("Zg==") == b"f"

    with pytest.raises(Fault): string.unbase64("Zh==", canonical=True)

    assert string.unbase64("Zg", canonical=True) == b"f"
