import engine
import importlib

SURFACE = {
    "engine.adapter"   : ["Adapter", "Manager", "Receipt"],
    "engine.ai"        : [
        "Ai", "Anthropic", "Call", "Gemini", "Hosted", "Message", "Mock", "Model", "Ollama", "Openai", "Reply", "Tool",
        "Turn", "ai",
    ],
    "engine.array"     : ["Array", "Page", "array"],
    "engine.auth"      : ["Actor", "Auth", "Otp", "Relay", "auth"],
    "engine.broadcast" : ["Broadcast", "broadcast"],
    "engine.broker"    : ["Broker", "Driver", "Kafka", "Memory", "Message", "Rabbit", "broker"],
    "engine.cache"     : ["Cache", "Channel", "Hit", "Memory", "Redis", "Store", "Tagged", "cache"],
    "engine.cli"       : ["Argument", "Cli", "Command"],
    "engine.config"    : ["Config", "Env", "Settings", "config", "env"],
    "engine.context"   : ["Context", "Deferral", "Opened", "Report", "Work", "context"],
    "engine.crypto"    : ["Crypto", "Key", "Pair", "Password", "Sealed", "crypto", "password"],
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
    "engine.parse"     : ["Email", "Mime", "Parse", "Url", "parse"],
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
    "engine.token"     : ["Claims", "Opaque", "Pair", "Token", "token"],
    "engine.translate" : ["Plural", "Translate", "plural", "translate"],
    "engine.validate"  : ["Member", "Resource", "Rules", "Shape", "Validator", "field", "rules", "validator"],
    "engine.video"     : [
        "Asset", "Cloudflare", "Driver", "Local", "Playback", "Preset", "Probe", "RENDITIONS", "Track",
        "Videos", "video",
    ],
    "engine.view"      : ["View", "view"],
}

def test_every_domain_exports_exactly_its_recorded_surface () -> None:

    for name, exported in SURFACE.items(): assert sorted(importlib.import_module(name).__all__) == exported

def test_the_facade_reaches_every_recorded_domain () -> None:

    assert sorted(engine.__all__) == [name.removeprefix("engine.") for name in SURFACE]

    for name in engine.__all__: assert getattr(engine, name) is not None
