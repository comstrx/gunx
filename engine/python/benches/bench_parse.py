from engine.parse import parse
from engine.test import Bench

bench = Bench()
query = "page=2&limit=20&sort=-created_at&filter[status]=paid&filter[tenant]=7&q=red+shoes"
sheet = "\n".join(f"{index},item {index},{index * 3}.50" for index in range(40))

def integer () -> None: parse.integer("12345", 0, 10**9)

def boolean () -> None: parse.boolean("yes")

def duration () -> None: parse.duration("1h30m")

def size () -> None: parse.size("12MB")

def query_ () -> None: parse.query(query)

def url () -> None: parse.url("https://shop.example.com:8443/orders/7?page=2#top")

def email () -> None: parse.email("Core.Master+tag@Example.com")

def semver () -> None: parse.semver("1.24.3-rc.1+build.9")

def template () -> None: parse.template("Hello {name}, order {id} is {state}", { "name": "A", "id": 7, "state": "paid" })

def csv () -> None: parse.csv(sheet)

def accept () -> None: parse.accept("text/html,application/json;q=0.9,*/*;q=0.8")

bench.measure("parse.integer", integer)
bench.measure("parse.boolean", boolean)
bench.measure("parse.duration", duration)
bench.measure("parse.size", size)
bench.measure("parse.query", query_)
bench.measure("parse.url", url)
bench.measure("parse.email", email)
bench.measure("parse.semver", semver)
bench.measure("parse.template", template)
bench.measure("parse.csv", csv)
bench.measure("parse.accept", accept)
