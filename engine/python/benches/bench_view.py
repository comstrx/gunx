from engine.error import Fault
from engine.log import log
from engine.test import Bench
from engine.view import View
from pathlib import Path
import contextlib

bench = Bench()
view  = View()
rows  = [{ "name": f"order-{index}", "state": "ready" if index % 2 else "طلبات", "total": index * 37 } for index in range(100)]
mail  = "<p>Hello {{ name }}, your code is <b>{{ code }}</b>. It expires in {{ minutes }} minutes.</p>{% include 'foot.html' %}"
table = "<table>{% for row in rows %}<tr><td>{{ row.name }}</td><td>{{ row.state | upper }}</td><td>{{ '%05d' % row.total }}</td></tr>{% endfor %}</table>"
page  = "{% extends 'base.html' %}{% block body %}{% for row in rows if row.total %}{{ row.name ~ ':' ~ row.state }} {% endfor %}{% endblock %}"
bomb  = "{% for a in range(99999) %}{% for b in range(99999) %}x{% endfor %}{% endfor %}"
text  = "Dear {{ name | title }}, {{ items | join(', ') }} ship on {{ day }}."

log.setup("info", "json", Path("/dev/null"))
view.setup(templates={
    "mail.html": mail, "foot.html": "<hr>{{ brand }}", "table.html": table, "base.html": "<main>{% block body %}{% endblock %}</main>",
    "page.html": page, "note.txt": text,
}, brand="Engine")

async def small () -> None: await view.render("mail.html", name="<Sara>", code="482913", minutes=5)

async def plain () -> None: await view.render("note.txt", name="sara ali", items=("a", "b", "c"), day="Sunday")

async def grid () -> None: await view.render("table.html", rows=rows)

async def child () -> None: await view.render("page.html", rows=rows)

async def inline () -> None: await view.render_text(text, name="sara ali", items=("a", "b", "c"), day="Sunday")

async def lost () -> None:

    with contextlib.suppress(Fault): await view.render("nope.html")

async def spent () -> None:

    with contextlib.suppress(Fault): await view.render_text(bomb)

async def fresh () -> None:

    view.put("fresh.html", table)

    await view.render("fresh.html", rows=rows[:1])

Bench.run(bench.measure_async("view.render.mail", small))
Bench.run(bench.measure_async("view.render.text", plain))
Bench.run(bench.measure_async("view.render.rows100", grid, rounds=3000))
Bench.run(bench.measure_async("view.render.extends100", child, rounds=3000))
Bench.run(bench.measure_async("view.render_text.cached", inline))
Bench.run(bench.measure_async("view.render.missing", lost, rounds=5000))
Bench.run(bench.measure_async("view.render.bomb", spent, rounds=50))
Bench.run(bench.measure_async("view.put.compile", fresh, rounds=300))

log.close()
