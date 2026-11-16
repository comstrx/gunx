from pathlib import Path
from engine.parse import parse
import ast, engine, importlib, io, re, sys, tokenize

ROOT    = Path(__file__).resolve().parents[1]
SRC     = ROOT / "src"
KEPT    = frozenset({ "__pycache__", "py.typed" })
MEMBERS = sorted(p.name for p in SRC.iterdir() if p.is_dir() and p.name != "engine")
HEADER  = re.compile(r"^\s*(?:async\s+)?(?:def|class)\s+\S.*:\s*$")
LIBRARY = re.compile(r"^(?:lazy )?(?:from|import)\s+([A-Za-z_][\w]*)")
NATIVE  = frozenset(sys.stdlib_module_names) | { "engine" }
BANNED  = frozenset(f"{root}{call}" for root in ("", "builtins.", "__builtins__.") for call in ("eval", "exec", "print"))

REFINED = (
    "error", "context", "json", "rand", "log", "adapter", "exception", "metric", "thread", "func",
    "string", "date", "number", "array", "cast", "parse", "crypto", "token", "health", "validate",
)

LADDER = (
    ("error", "context", "log"),
    ("rand", "func", "thread", "adapter", "exception"),
    ("json", "parse", "number", "date", "string", "array", "cast"),
    ("crypto", "token", "validate", "config", "translate", "metric", "health", "cli"),
    ("fs", "net", "cache", "stream", "storage", "view"),
    ("database", "search"),
    ("broker", "queue", "event", "schedule", "socket", "broadcast"),
    ("http", "auth"),
    ("mail", "sms", "notify", "gateway", "geo", "domain", "ai", "rag", "video"),
    ("fake", "test"),
)

RUNG = {
    name: index for index,
    names in enumerate(LADDER) for name in names
}

SURFACE = {
    "engine.adapter"   : ["Adapter", "Manager", "Receipt"],
    "engine.ai"        : [
        "Ai", "Anthropic", "Call", "Gemini", "Hosted", "Message", "Mock", "Model", "Ollama", "Openai", "Reply", "Tool",
        "Turn", "ai",
    ],
    "engine.array"     : ["Array", "Page", "array"],
    "engine.auth"      : ["Actor", "Auth", "Otp", "Relay", "Sessions", "auth"],
    "engine.broadcast" : ["Broadcast", "broadcast"],
    "engine.broker"    : ["Broker", "Driver", "Kafka", "Memory", "Message", "Rabbit", "broker"],
    "engine.cache"     : ["Cache", "Channel", "Hit", "Memory", "Redis", "Store", "Tagged", "cache"],
    "engine.cast"      : ["Cast", "cast"],
    "engine.cli"       : ["Argument", "Cli", "Command"],
    "engine.config"    : ["Config", "Env", "Settings", "config", "env"],
    "engine.context"   : ["Context", "Deferral", "Opened", "Report", "Trace", "Work", "context"],
    "engine.crypto"    : ["Crypto", "Hasher", "Key", "Pair", "Sealed", "crypto"],
    "engine.database"  : [
        "CLICKHOUSE", "Clickhouse", "ClickhouseDriver", "Cluster", "Column", "Database", "Dialect", "Documents",
        "Driver", "Index", "Listener", "MYSQL", "Memory", "Migrator", "Model", "Mongo", "Mysql", "MysqlDriver",
        "Operation", "Outbox", "POSTGRES", "Plan", "Postgres", "PostgresDriver", "Provision", "Record",
        "Repository", "SQLITE", "Session", "Sql", "Sqlite", "SqliteDriver", "Table", "Vector", "database",
        "outbox",
    ],
    "engine.date"      : ["Date", "DateTime", "Day", "Span", "TimeDelta", "UTC", "date"],
    "engine.domain"    : ["Dns", "Domains", "Record", "Registrar", "domains"],
    "engine.error"     : ["Bag", "Code", "Errors", "Fault", "Headers"],
    "engine.event"     : ["Event", "Events", "Signal", "Subscriber", "events"],
    "engine.exception" : ["Context", "Exceptions", "Factory", "Reporter", "exception"],
    "engine.fake"      : ["Fake", "fake"],
    "engine.fs"        : [
        "Change", "Dir", "Encrypt", "File", "Image", "Info", "Pack", "Path", "Picture", "Watch", "dir",
        "encrypt", "file", "image", "pack", "path", "watch",
    ],
    "engine.func"      : ["Batch", "Breaker", "Core", "Func", "Info", "Limiter", "Memo", "func"],
    "engine.gateway"   : ["Charge", "Gateway", "Http", "Mock", "Provider", "Refund", "Webhook", "gateway"],
    "engine.geo"       : ["Geo", "Place", "Point", "geo"],
    "engine.health"    : ["Health", "Probe", "health"],
    "engine.http"      : [
        "Action", "Answer", "App", "Binder", "Channel", "Docs", "Edge", "Envelope", "Form", "Group", "Guard",
        "Handler", "Layer", "Lifecycle", "Limits", "Middleware", "Mountable", "Next", "Renderer", "Request",
        "Response", "Route", "Router", "Throttle",
    ],
    "engine.json"      : ["Json", "JsonValue", "json"],
    "engine.log"       : ["Fields", "Log", "Logger", "Render", "log"],
    "engine.mail"      : ["Http", "Log", "Mail", "Mailer", "Message", "Smtp", "mail"],
    "engine.metric"    : ["Counter", "Gauge", "Histogram", "MEDIA", "Meter", "Metrics", "metrics"],
    "engine.net"       : ["Egress", "Net", "Remote", "Reply", "net"],
    "engine.notify"    : ["Http", "Log", "Notice", "Notify", "Pusher", "notify"],
    "engine.number"    : ["Decimal", "Money", "Number", "number"],
    "engine.parse"     : ["Document", "Email", "Mime", "Parse", "Url", "parse"],
    "engine.queue"     : ["Job", "Queue", "Task", "Work", "queue"],
    "engine.rag"       : ["Answer", "Chunk", "Database", "Hit", "Memory", "Rag", "Store", "rag"],
    "engine.rand"      : ["Rand", "Uuid", "rand"],
    "engine.schedule"  : ["Cron", "Plan", "Schedule", "Spot", "schedule"],
    "engine.search"    : [
        "Database", "Document", "Elastic", "Engine", "Hit", "Meili", "Memory", "Query", "Result", "Schema",
        "Search", "Vespa", "search",
    ],
    "engine.sms"       : ["Http", "Log", "Sms", "Text", "Texter", "sms"],
    "engine.socket"    : ["Frame", "Hub", "Socket", "Sockets", "sockets"],
    "engine.storage"   : ["Disk", "Drive", "Policy", "Storage", "Stored", "storage"],
    "engine.stream"    : [
        "Dash", "Hls", "Pipe", "Range", "Representation", "Segment", "Served", "Stream", "Tee", "Upload",
        "Uploads", "Variant", "stream",
    ],
    "engine.string"    : ["Fluent", "String", "string"],
    "engine.test"      : ["Bench", "Client", "Reply", "Sample", "Stage", "stage"],
    "engine.thread"    : ["Cluster", "Gate", "Lane", "Outcome", "Pool", "Run", "Tasks", "Thread", "thread"],
    "engine.token"     : ["Claims", "Codec", "Issuer", "Jwt", "Opaque", "Pair", "Paseto", "Reference", "Settings", "Store", "Token", "token"],
    "engine.translate" : ["Plural", "Translate", "plural", "translate"],
    "engine.validate"  : ["Member", "Plan", "Resource", "Rules", "Shape", "Spec", "Validator", "field", "rules", "validator"],
    "engine.video"     : [
        "Asset", "Cloudflare", "Driver", "Local", "Playback", "Preset", "Probe", "RENDITIONS", "Track",
        "Videos", "video",
    ],
    "engine.view"      : ["View", "view"],
}

def test_workspace_law_every_member_is_declared_once () -> None:

    root    = parse.toml((ROOT / "pyproject.toml").read_text())
    sources = root["tool"]["uv"]["sources"]
    facade  = parse.toml((SRC / "engine" / "pyproject.toml").read_text())

    assert sorted(facade["project"]["dependencies"]) == [f"engine-{m}" for m in MEMBERS]
    assert all(f"engine-{m}" in sources for m in MEMBERS) and sources["engine"] == { "workspace": True }
    assert root["tool"]["mypy"]["mypy_path"].split(":") == [f"src/{m}/src" for m in ("engine", *MEMBERS)]

    for member in MEMBERS:

        manifest = parse.toml((SRC / member / "pyproject.toml").read_text())
        project  = manifest["project"]

        assert project["name"] == f"engine-{member}" and len(project["description"]) <= 80
        assert project["dynamic"] == ["version", "requires-python", "license"]
        assert sorted(project) == ["dependencies", "description", "dynamic", "name"], member
        assert manifest["tool"]["hatch"]["metadata"]["hooks"]["custom"]["path"] == "../../metadata.py"
        assert manifest["tool"]["hatch"]["build"]["targets"]["sdist"]["hooks"]["custom"]["path"] == "../../distribution.py"
        assert sorted(manifest) == ["build-system", "project", "tool"] and sorted(manifest["tool"]) == ["hatch"], member

        for dependency in project["dependencies"]:

            name, _, marker = dependency.partition(";")

            assert re.fullmatch(r"[a-zA-Z0-9_.-]+(\[[a-z,]+\])?", name.strip()), dependency
            assert not marker or marker.strip() == "sys_platform != 'win32'", dependency

    assert sorted(SRC.rglob("py.typed")) == sorted(SRC / member / "src" / "engine" / member / "py.typed" for member in MEMBERS)

def test_package_law_a_member_is_a_facade_an_arch_and_one_class_per_file () -> None:

    offenders: list[str] = []

    for member in MEMBERS:

        base  = SRC / member / "src" / "engine" / member
        files = { file.stem: ast.parse(file.read_text()) for file in base.glob("*.py") }
        extra = sorted(item.name for item in base.iterdir() if item.suffix != ".py" and item.name not in KEPT)

        if extra: offenders.append(f"{member}: {extra}")
        if not { "__init__", "arch" } <= set(files): offenders.append(f"{member}: lacks __init__ or arch")

        for stem, tree in files.items():

            classes = [node.name for node in tree.body if isinstance(node, ast.ClassDef)]
            loose   = [node.name for node in tree.body if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)]

            if stem == "__init__" and (classes or loose): offenders.append(f"{member}/__init__ defines {classes + loose}")
            if stem in ("__init__", "arch"): continue
            if loose: offenders.append(f"{member}/{stem} holds loose functions {loose}")
            if [name.lower() for name in classes] != [stem]: offenders.append(f"{member}/{stem} holds {classes}")

    assert offenders == []

def test_shape_law_domains_form_a_dag_and_declare_their_imports () -> None:

    edges: dict[str, set[str]] = {}

    for member in MEMBERS:

        manifest = parse.toml((SRC / member / "pyproject.toml").read_text())
        declared = { d.removeprefix("engine-") for d in manifest["project"]["dependencies"] if d.startswith("engine-") }
        used: set[str] = set()

        for file in (SRC / member / "src" / "engine" / member).glob("*.py"):

            for node in ast.walk(ast.parse(file.read_text())):

                if isinstance(node, ast.Import): names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and not node.level: names = [f"{node.module}.{alias.name}" for alias in node.names]
                else: continue

                used |= { name.removeprefix("engine.").split(".")[0] for name in names if name.partition(".")[0] == "engine" } - { member }

        assert used <= declared, f"{member} imports {sorted(used - declared)} without declaring them"
        assert member not in used

        edges[member] = used

    seen: dict[str, int] = {}

    def visit ( node: str, trail: tuple[str, ...] ) -> None:

        state = seen.get(node, 0)

        assert state != 1, f"cycle: {' -> '.join((*trail, node))}"

        if state == 2: return

        seen[node] = 1

        for other in sorted(edges.get(node, ())): visit(other, (*trail, node))

        seen[node] = 2

    for member in MEMBERS: visit(member, ())

    assert edges["error"] == set() and "error" in edges["log"] | edges["context"]

def test_ladder_law_a_member_leans_only_on_members_at_or_below_its_rung () -> None:

    assert sorted(RUNG) == MEMBERS, sorted(set(MEMBERS) ^ set(RUNG))

    climbs: list[str] = []

    for member in MEMBERS:

        manifest = parse.toml((SRC / member / "pyproject.toml").read_text())

        for dependency in manifest["project"]["dependencies"]:

            if not dependency.startswith("engine-"): continue

            other = dependency.removeprefix("engine-")

            if RUNG[other] > RUNG[member]: climbs.append(f"{member} ({RUNG[member]}) -> {other} ({RUNG[other]})")

    assert climbs == [], climbs

def test_door_law_every_library_has_exactly_one_owner_domain () -> None:

    owners: dict[str, set[str]] = {}

    for member in MEMBERS:

        for file in (SRC / member / "src" / "engine" / member).glob("*.py"):

            for line in file.read_text().splitlines():

                bare  = line.strip()
                found = LIBRARY.match(bare)
                names = [found.group(1)] if found else []
                names += [part.strip().split(".")[0].split(" ")[0] for part in bare.split(",")[1:]] if bare.startswith("import ") else []

                for name in names:

                    if name not in NATIVE: owners.setdefault(name, set()).add(member)

    shared = { library: sorted(found) for library, found in owners.items() if len(found) > 1 }

    assert owners and shared == {}, f"a library enters through more than one domain: {shared}"

def test_facade_law_every_package_exports_a_sorted_surface () -> None:

    for member in MEMBERS:

        text = (SRC / member / "src" / "engine" / member / "__init__.py").read_text()

        assert "__all__ = [" in text, member

        names = re.findall(r'"([A-Za-z_][A-Za-z0-9_]*)"', text.split("__all__ = [", 1)[1])

        assert names == sorted(names, key=lambda n: (0 if n.isupper() else 1 if n[0].isupper() else 2, n)), member

def test_surface_law_every_domain_exports_exactly_its_recorded_surface () -> None:

    for name, exported in SURFACE.items(): assert sorted(importlib.import_module(name).__all__) == exported, name

def test_surface_law_the_facade_reaches_every_recorded_domain () -> None:

    assert sorted(engine.__all__) == [name.removeprefix("engine.") for name in SURFACE]

    for name in engine.__all__: assert getattr(engine, name) is not None, name

def test_blank_line_law_every_header_breathes () -> None:

    offenders: list[str] = []

    for file in SRC.rglob("*.py"):

        lines = file.read_text().splitlines()

        for index, line in enumerate(lines[:-1]):

            if HEADER.match(line) and lines[index + 1].strip() and not line.rstrip().endswith("..."):

                header = line.lstrip()

                if not header.startswith(("def", "async def", "class")): continue

                offenders.append(f"{file.relative_to(ROOT)}:{index + 1}")

    assert offenders == []

def test_purity_law_no_comments_prints_or_evals_in_sources () -> None:

    offenders: list[str] = []

    for file in SRC.rglob("*.py"):

        text = file.read_text()
        name = file.relative_to(ROOT)

        offenders += [
            f"{name}:{piece.start[0]}: comment" for piece in tokenize.generate_tokens(io.StringIO(text).readline)
            if piece.type == tokenize.COMMENT
        ]

        offenders += [
            f"{name}:{node.lineno}: {ast.unparse(node.func)}" for node in ast.walk(ast.parse(text))
            if isinstance(node, ast.Call) and ast.unparse(node.func) in BANNED
        ]

    assert offenders == []

def test_refined_packages_keep_implementation_in_classes () -> None:

    offenders: list[str] = []

    for member in REFINED:

        for file in (SRC / member / "src" / "engine" / member).glob("*.py"):

            for node in ast.parse(file.read_text()).body:

                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    offenders.append(f"{member}/{file.name}: floating {node.name}")

                if not isinstance(node, ast.ClassDef) and any(isinstance(part, ast.Lambda) for part in ast.walk(node)):
                    offenders.append(f"{member}/{file.name}: floating lambda")

    assert offenders == []
    assert not [str(file) for file in SRC.rglob("*") if file.is_file() and file.name.lower().startswith("readme")]

def test_refined_arch_files_hold_declarations_only () -> None:

    offenders: list[str] = []

    for member in REFINED:

        tree = ast.parse((SRC / member / "src" / "engine" / member / "arch.py").read_text())

        for node in ast.walk(tree):

            if isinstance(node, ast.Lambda): offenders.append(f"{member}/arch.py: lambda implementation")

            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): continue

            declaration = (
                len(node.body) == 1 and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant) and node.body[0].value.value is Ellipsis
            )

            if not declaration: offenders.append(f"{member}/arch.py: executable {node.name}")

    assert offenders == []
