from typing import Any, ClassVar, override

from engine.broker import Broker, Memory
from engine.event import Event as Fact, events
from engine.http import Answer, App, Next, Request, Route
from engine.queue import queue
from engine.test import stage
from hello.app.repositories import Greetings
from hello.app.services import Greeter
from hello.app.utils.cycle import Controller, Event, Job, Middleware, api
from hello.database.seeders.greetings import rows

FIRST = "0190b000-0000-7000-8000-000000000001"

class Stamp(Middleware):

    @override
    async def handle ( self, request: Request, call: Next ) -> Answer:

        answer = await call(request)

        answer.headers["X-Cycle"] = "on"

        return answer

class Greeted(Event):

    name: ClassVar[str] = "hello.greeted"

    who: str

class Thank(Job):

    name: ClassVar[str] = "hello.thank"

    who: str

async def test_the_service_and_controller_bases_show_index_and_page () -> None:

    greeter = Greeter(Greetings(rows()))
    shown   = await greeter.show(FIRST)

    rows_, total = await greeter.index(2, 2, "id")

    assert shown == { "message": "hello world", "locale": "en", "tone": "plain" } and total == 6 and len(rows_) == 2

    class Pages(Controller[Greeter]):

        async def index ( self ) -> Answer:

            found, count = await self.service.index(1, 4, "-id")

            return self.page(found, count, 1, 4)

    stage.wire()

    app = App("Cycle").middleware(Stamp()).routing(api("cycle", Route.get("/pages", Pages(greeter).index, "pages")))

    async with stage.client(app) as client:

        reply = client.expect(await client.get("/pages"), 200, "ok")

        assert reply.header("X-Cycle") == "on" and reply.body["meta"]["total"] == 6 and reply.data()[0]["tone"] == "formal"
        assert app.router.names() == ("cycle.pages", "health", "ready")

async def test_the_event_and_job_bases_dispatch_through_the_engine () -> None:

    heard: list[dict[str, Any]] = []
    done: list[str] = []

    async def listener ( fact: Fact ) -> None:

        heard.append(fact.data)

    async def thank ( who: str ) -> None:

        done.append(who)

    bus = Broker()

    bus.setup(Memory())
    events.setup("hello", bus)
    events.listen("hello.greeted", listener)
    queue.setup(inline=True)
    queue.task("hello.thank")(thank)

    try:

        fact = await Greeted(who="Ann").dispatch()
        job  = await Thank(who="Ann").dispatch()

        assert heard == [{ "who": "Ann" }] and fact.name == "hello.greeted" and done == ["Ann"] and job.name == "hello.thank"

    finally:

        events.clear()
        events.setup("engine")
        queue.clear()
        queue.setup()
