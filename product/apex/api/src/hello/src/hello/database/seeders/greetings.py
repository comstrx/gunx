from ...app.enums import Tone
from ...app.models import Greeting

def rows () -> list[Greeting]:

    return [
        Greeting(id="0190b000-0000-7000-8000-000000000001", locale="en", text="hello world", tone=Tone.PLAIN),
        Greeting(id="0190b000-0000-7000-8000-000000000002", locale="en", text="hello there, world", tone=Tone.WARM),
        Greeting(id="0190b000-0000-7000-8000-000000000003", locale="en", text="Greetings, world", tone=Tone.FORMAL),
        Greeting(id="0190b000-0000-7000-8000-000000000004", locale="ar", text="أهلاً بالعالم", tone=Tone.PLAIN),
        Greeting(id="0190b000-0000-7000-8000-000000000005", locale="ar", text="أهلاً وسهلاً بالعالم", tone=Tone.WARM),
        Greeting(id="0190b000-0000-7000-8000-000000000006", locale="ar", text="تحياتنا للعالم", tone=Tone.FORMAL),
    ]
