from engine.error import Code, Fault
from engine.mail import Mail, Message
from engine.mail.arch import ADDRESS, ATTACHMENTS, HEADER, HEADERS, RECIPIENTS, SUBJECT
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any

EXAMPLES  = 1000
ADDRESSES = st.one_of(st.sampled_from(["a@x.io", "b@x.io", "Me <me@x.io>", "nope", "a b@x.io", "a@x.io\r\nBcc: c@x.io", "", "x" * (ADDRESS + 1)]), st.text(max_size=12))
LISTS     = st.one_of(st.lists(ADDRESSES, max_size=4), st.text(max_size=8), st.none(), st.just([f"u{at}@x.io" for at in range(RECIPIENTS + 1)]))
TEXTS     = st.one_of(st.text(max_size=24), st.just("x" * (SUBJECT + 1)), st.just("a\r\nBcc: c@x.io"), st.just(""), st.none(), st.integers())
HEADED    = st.one_of(st.none(), st.dictionaries(st.sampled_from(["X-Tag", "Bcc", "X Tag", "", "From", "List-Unsubscribe"]), st.one_of(st.text(max_size=8), st.just("a\r\nb"), st.just("x" * (HEADER + 1)), st.integers()), max_size=3), st.just({ f"X-{at}": "v" for at in range(HEADERS + 1) }))
FILES     = st.one_of(st.none(), st.lists(st.tuples(st.sampled_from(["a.txt", "../a.txt", "a\n.txt", "", "report.pdf"]), st.one_of(st.binary(max_size=8), st.text(max_size=2)), st.sampled_from(["text/plain", "application/pdf", "text", "text/plain; charset=utf-8", ""])), max_size=2))
box       = Mail()

box.setup("hello@engine.test", "Engine")

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(LISTS, TEXTS, TEXTS, TEXTS, LISTS, LISTS, HEADED, FILES)
def messaged ( to: Any, subject: Any, text: Any, sender: Any, cc: Any, bcc: Any, headers: Any, files: Any ) -> None:

    held = tuple(to) if isinstance(to, list) else to
    made = tried(lambda: Message(
        held, subject, text if text is not None else "", "", sender, None, tuple(cc) if isinstance(cc, list) else cc, tuple(bcc) if isinstance(bcc, list) else bcc,
        headers if headers is not None else {}, tuple(files) if isinstance(files, list) else (),
    ))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason == "mail.message"
        assert made.errors is not None

        return

    assert made.to
    assert len(made.recipients()) <= RECIPIENTS
    assert 0 < len(made.subject) <= SUBJECT
    assert all("\r" not in item and "\n" not in item for item in (*made.recipients(), made.subject, *made.headers, *made.headers.values()))
    assert all(name.lower() not in ("bcc", "from", "to", "subject") for name in made.headers)
    assert sum(len(data) for _, data, _ in made.attachments) <= ATTACHMENTS
    assert made.dump()["to"] == list(made.to)

    composed = tried(lambda: box.compose(to, subject, text or "", cc=cc or (), bcc=bcc or (), headers=headers or {}, attachments=files or ()))

    assert not isinstance(composed, Fault) or composed.reason in ("mail.message", "mail.to")

messaged()

print(f"fuzz mail  examples={EXAMPLES}  ok")
