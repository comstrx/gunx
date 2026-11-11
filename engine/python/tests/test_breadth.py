from engine.string import string
from engine.validate import rules
from typing import Any
import importlib

LARAVEL_STR = {
    "after": "string.after", "afterLast": "string.after_last", "apa": "string.apa", "ascii": "string.ascii",
    "before": "string.before", "beforeLast": "string.before_last", "between": "string.between",
    "betweenFirst": "string.between_first", "camel": "string.camel", "charAt": "string.char_at",
    "chopStart": "string.chop_start", "chopEnd": "string.chop_end", "contains": "string.has_any",
    "containsAll": "string.has_all", "doesntContain": "string.lacks", "doesntEndWith": "string.ends",
    "doesntStartWith": "string.starts", "deduplicate": "string.dedupe", "endsWith": "string.ends",
    "excerpt": "string.excerpt", "finish": "string.finish", "fromBase64": "string.unbase64", "headline": "string.title",
    "initials": "string.initials", "inlineMarkdown": "SKIP:markdown rendering belongs to view",
    "is": "string.like", "isAscii": "builtins:str.isascii", "isJson": "json.json.valid", "isUlid": "parse.parse.ulid",
    "isUrl": "parse.parse.url", "isUuid": "parse.parse.uuid", "kebab": "string.kebab", "lcfirst": "string.lcfirst",
    "length": "string.char_count", "limit": "string.truncate", "lower": "builtins:str.lower",
    "markdown": "SKIP:markdown rendering belongs to view", "mask": "string.mask", "match": "string.match",
    "matchAll": "string.matches", "isMatch": "string.test", "orderedUuid": "rand.rand.uuid7", "padBoth": "string.pad",
    "padLeft": "string.pad", "padRight": "string.pad", "password": "rand.rand.string", "plural": "string.plural",
    "pluralStudly": "string.plural", "position": "string.position", "random": "rand.rand.string",
    "remove": "string.remove", "repeat": "builtins:str.__mul__", "replace": "string.replace_many",
    "replaceArray": "string.replace_array", "replaceFirst": "string.replace_first", "replaceLast": "string.replace_last",
    "replaceMatches": "string.replace_matches", "replaceStart": "string.replace_start", "replaceEnd": "string.replace_end",
    "reverse": "string.reverse", "singular": "string.singular", "slug": "string.slug", "snake": "string.snake",
    "squish": "string.squish", "start": "string.start", "startsWith": "string.starts", "studly": "string.pascal",
    "substr": "string.substr", "substrCount": "string.count", "substrReplace": "string.splice", "swap": "string.replace_many",
    "take": "string.take", "title": "string.title", "toBase64": "string.base64", "transliterate": "string.transliterate",
    "trim": "string.trim", "ltrim": "string.trim", "rtrim": "string.trim", "ucfirst": "string.ucfirst",
    "ucsplit": "string.ucsplit", "ucwords": "string.title", "upper": "builtins:str.upper", "ulid": "rand.rand.ulid",
    "uuid": "rand.rand.uuid", "uuid7": "rand.rand.uuid7", "wordCount": "string.word_count", "wordWrap": "string.word_wrap",
    "words": "string.shorten", "wrap": "string.wrap",
}
LARAVEL_STRINGABLE = {
    "append": "builtins:str.__add__", "prepend": "builtins:str.__add__", "basename": "pathlib:PurePosixPath.name",
    "dirname": "pathlib:PurePosixPath.parent", "classBasename": "SKIP:php class names", "decrypt": "crypto.crypto.open",
    "encrypt": "crypto.crypto.seal", "exactly": "builtins:str.__eq__", "explode": "builtins:str.split",
    "hash": "crypto.crypto.hash", "isEmpty": "string.blank", "isNotEmpty": "string.blank", "newLine": "builtins:str.__add__",
    "pipe": "string.Fluent.pipe", "scan": "SKIP:sscanf", "split": "builtins:str.split", "stripTags": "string.plain",
    "tap": "string.Fluent.tap", "test": "string.test", "toHtmlString": "SKIP:belongs to view", "toUri": "parse.parse.url",
    "when": "string.Fluent.when", "unless": "string.Fluent.unless", "whenContains": "string.Fluent.when",
    "whenContainsAll": "string.Fluent.when", "whenEmpty": "string.Fluent.when", "whenNotEmpty": "string.Fluent.when",
    "whenStartsWith": "string.Fluent.when", "whenEndsWith": "string.Fluent.when", "whenExactly": "string.Fluent.when",
    "whenNotExactly": "string.Fluent.when", "whenIs": "string.Fluent.when", "whenIsAscii": "string.Fluent.when",
    "whenIsUlid": "string.Fluent.when", "whenIsUuid": "string.Fluent.when", "whenTest": "string.Fluent.when",
    "whenDoesntEndWith": "string.Fluent.when", "whenDoesntStartWith": "string.Fluent.when",
}
LARAVEL_ARR = {
    "accessible": "json.kind", "add": "json.add", "array": "json.get", "boolean": "json.get", "collapse": "array.flatten",
    "crossJoin": "array.cross", "divide": "array.divide", "dot": "json.flatten", "every": "array.every",
    "except": "array.omit", "exceptValues": "array.reject", "exists": "json.has", "first": "array.first",
    "flatten": "array.flatten", "float": "json.get", "forget": "json.forget", "from": "array.wrap", "get": "json.get",
    "has": "json.has", "hasAll": "json.has_all", "hasAny": "json.has_any", "integer": "json.get", "isAssoc": "json.kind",
    "isList": "json.kind", "join": "array.join", "keyBy": "array.index", "last": "array.last", "map": "builtins:map",
    "mapSpread": "itertools:starmap", "mapWithKeys": "array.index", "only": "array.only", "onlyValues": "array.keep",
    "partition": "array.partition", "pluck": "array.pluck", "prepend": "array.prepend", "prependKeysWith": "json.prefix",
    "pull": "json.pull", "push": "json.push", "query": "parse.parse.join", "random": "rand.rand.sample",
    "reject": "array.reject", "select": "array.pluck", "set": "json.put", "shuffle": "rand.rand.shuffle",
    "sole": "array.sole", "some": "array.some", "sort": "array.sort", "sortDesc": "array.sort",
    "sortRecursive": "json.json.canonical", "string": "json.get", "take": "array.take",
    "toCssClasses": "SKIP:belongs to view", "toCssStyles": "SKIP:belongs to view", "undot": "json.unflatten",
    "where": "array.where", "whereNotNull": "array.compact", "wrap": "array.wrap", "data_fill": "json.add",
    "data_get": "json.get", "data_set": "json.put", "data_forget": "json.forget", "head": "array.first",
}
LARAVEL_COLLECTION = {
    "after": "array.after", "all": "builtins:list", "average": "array.avg", "avg": "array.avg", "before": "array.before",
    "chunk": "array.chunk", "chunkWhile": "array.chunk_by", "collapse": "array.flatten", "collapseWithKeys": "json.merge",
    "collect": "array.wrap", "combine": "array.combine", "concat": "array.union", "contains": "array.some",
    "containsStrict": "builtins:list.__contains__", "count": "builtins:len", "countBy": "array.count_by",
    "crossJoin": "array.cross", "dd": "log.log.debug", "diff": "array.difference", "diffAssoc": "json.diff",
    "diffAssocUsing": "json.diff", "diffKeys": "json.diff", "doesntContain": "array.some",
    "doesntContainStrict": "builtins:list.__contains__", "dot": "json.flatten", "dump": "log.log.debug",
    "duplicates": "array.duplicates", "duplicatesStrict": "array.duplicates", "each": "builtins:iter",
    "eachSpread": "itertools:starmap", "ensure": "validate.validator.shape", "every": "array.every", "except": "array.omit",
    "filter": "array.keep", "first": "array.first", "firstOrFail": "array.sole", "firstWhere": "array.first_where",
    "flatMap": "array.flat_map", "flatten": "array.flatten", "flip": "json.flip", "forget": "json.forget",
    "forPage": "array.page", "fromJson": "json.json.decode", "get": "array.get", "groupBy": "array.group",
    "has": "json.has", "hasAny": "json.has_any", "hasMany": "array.count_by", "hasSole": "array.sole",
    "implode": "array.join", "intersect": "array.intersect", "intersectUsing": "array.intersect",
    "intersectAssoc": "json.diff", "intersectAssocUsing": "json.diff", "intersectByKeys": "json.pick",
    "isEmpty": "builtins:len", "isNotEmpty": "builtins:len", "join": "array.join", "keyBy": "array.index",
    "keys": "builtins:dict.keys", "last": "array.last", "lazy": "builtins:iter", "macro": "SKIP:php macros",
    "make": "array.wrap", "map": "builtins:map", "mapInto": "builtins:map", "mapSpread": "itertools:starmap",
    "mapToGroups": "array.group", "mapWithKeys": "array.index", "max": "array.max", "median": "array.median",
    "merge": "json.merge", "mergeRecursive": "json.merge", "min": "array.min", "mode": "array.mode",
    "multiply": "builtins:list.__mul__", "nth": "array.nth", "only": "array.only", "pad": "array.pad",
    "partition": "array.partition", "percentage": "array.percentage", "pipe": "func.func.pipe",
    "pipeInto": "func.func.pipe", "pipeThrough": "func.func.compose", "pluck": "array.pluck", "pop": "builtins:list.pop",
    "prepend": "array.prepend", "pull": "json.pull", "push": "builtins:list.append", "put": "json.put",
    "random": "rand.rand.sample", "range": "builtins:range", "reduce": "functools:reduce", "reduceSpread": "functools:reduce",
    "reject": "array.reject", "replace": "json.merge", "replaceRecursive": "json.merge", "reverse": "builtins:reversed",
    "search": "array.search", "select": "array.pluck", "shift": "builtins:list.pop", "shuffle": "rand.rand.shuffle",
    "skip": "array.skip", "skipUntil": "array.skip_until", "skipWhile": "array.skip_while", "slice": "array.take",
    "sliding": "array.window", "sole": "array.sole", "some": "array.some", "sort": "array.sort", "sortBy": "array.sort",
    "sortByDesc": "array.sort", "sortDesc": "array.sort", "sortKeys": "json.json.canonical",
    "sortKeysDesc": "json.json.canonical", "sortKeysUsing": "builtins:sorted", "splice": "array.splice",
    "split": "array.split", "splitIn": "array.split", "sum": "array.sum", "take": "array.take",
    "takeUntil": "array.take_until", "takeWhile": "array.take_while", "tap": "func.func.tap", "times": "array.times",
    "toArray": "builtins:list", "toJson": "json.json.encode", "toPrettyJson": "json.json.pretty", "transform": "builtins:map",
    "undot": "json.unflatten", "union": "array.union", "unique": "array.unique", "uniqueStrict": "array.unique",
    "unless": "func.func.when", "unlessEmpty": "func.func.when", "unlessNotEmpty": "func.func.when",
    "unwrap": "array.unwrap", "value": "json.get", "values": "builtins:dict.values", "when": "func.func.when",
    "whenEmpty": "func.func.when", "whenNotEmpty": "func.func.when", "where": "array.where", "whereStrict": "array.where",
    "whereBetween": "array.where", "whereIn": "array.where_in", "whereInStrict": "array.where_in",
    "whereInstanceOf": "array.keep", "whereNotBetween": "array.reject", "whereNotIn": "array.where_not_in",
    "whereNotInStrict": "array.where_not_in", "whereNotNull": "array.compact", "whereNull": "array.reject",
    "wrap": "array.wrap", "zip": "builtins:zip",
}
LARAVEL_NUMBER = {
    "abbreviate": "number.compact", "clamp": "number.clamp", "currency": "number.currency",
    "defaultCurrency": "number.currency", "defaultLocale": "number.format", "fileSize": "number.bytes",
    "forHumans": "number.compact", "format": "number.format", "ordinal": "number.ordinal", "pairs": "number.pairs",
    "parseInt": "parse.parse.integer", "parseFloat": "parse.parse.number", "percentage": "number.percent",
    "spell": "number.spell", "spellOrdinal": "number.spell_ordinal", "trim": "number.trim", "useLocale": "number.format",
    "withLocale": "number.format", "useCurrency": "number.currency", "withCurrency": "number.currency",
}
LARAVEL_RULES = {
    name: f"rules:{name}" for name in (
    "accepted", "accepted_if", "boolean", "declined", "declined_if", "alpha", "alpha_dash", "alpha_num", "ascii",
    "confirmed", "different", "doesnt_start_with", "doesnt_end_with", "email", "ends_with", "hex_color", "in", "ip",
    "json", "lowercase", "max", "min", "not_in", "regex", "not_regex", "same", "size", "starts_with", "string",
    "uppercase", "url", "ulid", "uuid", "between", "decimal", "digits", "digits_between", "gt", "gte", "integer",
    "lt", "lte", "max_digits", "min_digits", "multiple_of", "numeric", "array", "contains", "doesnt_contain",
    "distinct", "in_array", "in_array_keys", "list", "after", "after_or_equal", "before", "before_or_equal", "date",
    "date_equals", "date_format", "timezone", "filled", "missing", "missing_if", "missing_unless", "missing_with",
    "missing_with_all", "present", "present_if", "present_unless", "present_with", "present_with_all", "prohibited",
    "prohibited_if", "prohibited_if_accepted", "prohibited_if_declined", "prohibited_unless", "prohibits",
    "required", "required_if", "required_if_accepted", "required_if_declined", "required_unless", "required_with",
    "required_with_all", "required_without", "required_without_all", "required_array_keys", "enum", "exclude",
    "exclude_if", "exclude_unless", "exclude_with", "exclude_without",
    )
} | {
    "mac_address": "rules:mac", "nullable": "flag:nullable", "sometimes": "flag:sometimes", "bail": "flag:bail",
    "active_url": "SKIP:dns is net work, validation stays pure", "current_password": "SKIP:belongs to auth",
    "dimensions": "SKIP:uploads are judged by fs.image", "encoding": "SKIP:bodies are utf-8 by the http edge",
    "extensions": "SKIP:uploads are judged by file.media", "file": "SKIP:uploads are judged by storage.policy",
    "image": "SKIP:uploads are judged by file.media", "mimetypes": "SKIP:uploads are judged by file.media",
    "mimes": "SKIP:uploads are judged by file.media", "exists": "SKIP:belongs to database", "unique": "SKIP:belongs to database",
    "anyOf": "SKIP:composite rule",
}
LARAVEL_HTTP = {
    "get": "net.net.get", "post": "net.net.post", "put": "net.net.put", "patch": "net.net.patch", "delete": "net.net.delete",
    "head": "net.net.head", "withHeaders": "net.Remote.header", "withToken": "net.Remote.bearer",
    "withBasicAuth": "net.Remote.basic", "withDigestAuth": "SKIP:digest auth", "timeout": "net.net.request",
    "connectTimeout": "net.net.setup", "retry": "func.func.retry", "withQueryParameters": "net.net.request",
    "asForm": "net.net.form", "asJson": "net.net.json", "attach": "net.net.upload", "withBody": "net.net.request",
    "accept": "net.Remote.header", "acceptJson": "net.Remote.header", "withOptions": "net.net.setup",
    "withUserAgent": "net.Remote.header", "withCookies": "net.net.request", "withoutRedirecting": "net.net.request",
    "withoutVerifying": "net.net.setup", "pool": "thread.thread.gather", "batch": "thread.thread.run", "fake": "test.stage",
    "throw": "net.net.fault", "sink": "net.net.save", "stream": "net.net.stream",
}
LARAVEL_STORAGE = {
    "disk": "storage.storage.disk", "build": "storage.storage.local", "get": "storage.Disk.get", "json": "storage.Disk.json",
    "exists": "storage.Disk.exists", "missing": "storage.Disk.missing", "download": "http.Response.download",
    "url": "storage.Disk.url", "temporaryUrl": "storage.Disk.sign", "temporaryUploadUrl": "SKIP:presigned uploads",
    "path": "storage.storage.key", "size": "storage.Disk.size", "lastModified": "storage.Disk.info",
    "mimeType": "fs.file.media", "put": "storage.Disk.put", "putFile": "storage.storage.upload", "putFileAs": "storage.Disk.put",
    "prepend": "storage.Disk.prepend", "append": "storage.Disk.append", "copy": "storage.Disk.copy",
    "move": "storage.Disk.move", "delete": "storage.Disk.delete", "files": "storage.Disk.list", "allFiles": "storage.Disk.list",
    "directories": "SKIP:object stores have prefixes, not folders", "allDirectories": "SKIP:object stores",
    "makeDirectory": "SKIP:object stores", "deleteDirectory": "SKIP:object stores", "readStream": "storage.Disk.stream",
    "writeStream": "storage.Disk.put", "getVisibility": "SKIP:visibility is per disk", "setVisibility": "SKIP:per disk",
    "fake": "storage.storage.local",
}
LARAVEL_CACHE = {
    "get": "cache.cache.get", "has": "cache.cache.has", "missing": "cache.cache.has", "increment": "cache.cache.increment",
    "decrement": "cache.cache.decrement", "remember": "cache.cache.remember", "rememberForever": "cache.cache.remember",
    "flexible": "cache.cache.stale", "pull": "cache.cache.take", "put": "cache.cache.set", "add": "cache.cache.add",
    "forever": "cache.cache.forever", "forget": "cache.cache.forget", "flush": "cache.cache.flush", "lock": "cache.cache.lock",
    "block": "cache.cache.lock", "release": "cache.cache.unlock", "restoreLock": "cache.cache.unlock",
    "forceRelease": "cache.cache.unlock", "withoutOverlapping": "cache.cache.locked", "funnel": "cache.cache.bucket",
    "tags": "cache.cache.tags", "many": "cache.cache.many", "putMany": "cache.cache.set_many", "memo": "cache.cache.local",
    "store": "cache.cache.use",
}
LARAVEL_SCHEDULE = {
    "cron": "schedule.Plan.cron", "everySecond": "schedule.Plan.every", "everyTwoSeconds": "schedule.Plan.every",
    "everyFiveSeconds": "schedule.Plan.every", "everyTenSeconds": "schedule.Plan.every",
    "everyFifteenSeconds": "schedule.Plan.every", "everyTwentySeconds": "schedule.Plan.every",
    "everyThirtySeconds": "schedule.Plan.every", "everyMinute": "schedule.Plan.every_minute",
    "everyTwoMinutes": "schedule.Plan.every_minutes", "everyThreeMinutes": "schedule.Plan.every_minutes",
    "everyFourMinutes": "schedule.Plan.every_minutes", "everyFiveMinutes": "schedule.Plan.every_minutes",
    "everyTenMinutes": "schedule.Plan.every_minutes", "everyFifteenMinutes": "schedule.Plan.every_minutes",
    "everyThirtyMinutes": "schedule.Plan.every_minutes", "hourly": "schedule.Plan.hourly", "hourlyAt": "schedule.Plan.hourly",
    "everyOddHour": "schedule.Plan.cron", "everyTwoHours": "schedule.Plan.cron", "everyThreeHours": "schedule.Plan.cron",
    "everyFourHours": "schedule.Plan.cron", "everySixHours": "schedule.Plan.cron", "daily": "schedule.Plan.daily",
    "dailyAt": "schedule.Plan.daily", "twiceDaily": "schedule.Plan.cron", "twiceDailyAt": "schedule.Plan.cron",
    "daysOfMonth": "schedule.Plan.cron", "weekly": "schedule.Plan.weekly", "weeklyOn": "schedule.Plan.weekly",
    "monthly": "schedule.Plan.monthly", "monthlyOn": "schedule.Plan.monthly", "twiceMonthly": "schedule.Plan.cron",
    "lastDayOfMonth": "schedule.Plan.last_day_of_month", "quarterly": "schedule.Plan.quarterly",
    "quarterlyOn": "schedule.Plan.quarterly", "yearly": "schedule.Plan.yearly", "yearlyOn": "schedule.Plan.yearly",
    "timezone": "schedule.Plan.timezone", "weekdays": "schedule.Plan.weekdays", "weekends": "schedule.Plan.weekends",
    "sundays": "schedule.Plan.days", "mondays": "schedule.Plan.days", "tuesdays": "schedule.Plan.days",
    "wednesdays": "schedule.Plan.days", "thursdays": "schedule.Plan.days", "fridays": "schedule.Plan.days",
    "saturdays": "schedule.Plan.days", "days": "schedule.Plan.days", "between": "schedule.Plan.between",
    "unlessBetween": "schedule.Plan.unless_between", "when": "schedule.Plan.when", "skip": "schedule.Plan.skip",
    "environments": "config.config.get", "withoutOverlapping": "schedule.Plan.without_overlap",
    "onOneServer": "schedule.schedule.run", "runInBackground": "thread.thread.spawn",
    "evenInMaintenanceMode": "SKIP:maintenance is the edge's down()", "before": "schedule.Plan.before",
    "after": "schedule.Plan.after", "onSuccess": "schedule.Plan.on_success", "onFailure": "schedule.Plan.on_failure",
    "pingBefore": "schedule.Plan.before", "thenPing": "schedule.Plan.after", "pingOnSuccess": "schedule.Plan.on_success",
    "pingOnFailure": "schedule.Plan.on_failure", "sendOutputTo": "SKIP:shell output", "appendOutputTo": "SKIP:shell output",
    "emailOutputTo": "SKIP:shell output", "emailOutputOnFailure": "SKIP:shell output", "name": "schedule.schedule.job",
    "group": "SKIP:groups", "call": "schedule.schedule.job", "job": "queue.queue.push", "exec": "thread.thread.spawn",
}
LARAVEL_QUEUE_EVENTS = {
    "dispatch": "queue.queue.push", "dispatchSync": "queue.queue.perform", "later": "queue.queue.later",
    "chain": "queue.queue.chain", "batch": "queue.queue.bulk", "onQueue": "queue.queue.push", "retry": "queue.queue.retry_dead",
    "failed": "queue.queue.dead_letters", "middleware": "queue.queue.through", "rateLimited": "queue.queue.task",
    "unique": "queue.queue.task", "listen": "event.events.listen", "event": "event.events.dispatch",
    "subscribe": "event.events.subscribe", "until": "event.events.wait", "forgetListener": "event.events.forget",
    "once": "event.events.once", "queuedListener": "event.events.queue",
}
TURBOX_STRING = {
    "unique": "rand.rand.uuid", "snake": "string.snake", "studly": "string.pascal", "camel": "string.camel",
    "kebab": "string.kebab", "title": "string.title", "slug": "string.slug", "match_case": "string.match_case",
    "plural": "string.plural", "singular": "string.singular", "join": "builtins:str.join", "random": "rand.rand.string",
    "public": "string.slug", "trim": "string.trim", "remove": "string.remove", "match": "string.match",
    "fullmatch": "string.like", "search": "string.find", "find": "string.find", "sub": "string.replace_matches",
    "split": "builtins:str.split", "has": "string.has_any", "collapse": "string.squish", "count": "string.count",
    "escape": "string.escape", "truncate": "string.truncate", "limit_words": "string.shorten", "replace": "string.replace_many",
    "replace_case_insensitive": "string.replace_matches", "replace_all_insensitive": "string.replace_matches",
    "random_slug": "rand.rand.string", "extract_numbers": "string.numbers", "is_email": "parse.parse.email",
    "is_url": "parse.parse.url", "is_phone": "parse.parse.phone", "mask": "string.mask", "strip_html": "string.plain",
    "normalize_space": "string.squish", "word_count": "string.word_count", "char_count": "string.char_count",
    "contains_any": "string.has_any", "contains_all": "string.has_all", "pad_left": "string.pad", "pad_right": "string.pad",
    "to_base64": "string.base64", "from_base64": "string.unbase64", "hash": "crypto.crypto.hash", "to_ascii": "string.ascii",
    "sanitize_sql": "SKIP:parameters are bound by database, never escaped text", "equals_ignore_case": "string.same",
    "strip_ansi": "string.strip_ansi", "reverse": "string.reverse", "to_bytes": "builtins:str.encode",
    "from_bytes": "builtins:bytes.decode", "between": "string.between", "strip_symbols": "string.strip_symbols",
    "humanize_number": "number.compact", "is_json": "json.json.valid", "title_case_safe": "string.title",
}
TURBOX_ITERS = {
    "generate": "builtins:range", "parse": "parse.parse.list", "cast": "parse.parse.auto", "resolve_key": "array.getter",
    "sort": "array.sort", "flatten": "array.flatten", "flatten_dict": "json.flatten", "merge": "json.merge",
    "unique": "array.unique", "chunk": "array.chunk", "map": "builtins:map", "filter": "array.keep",
    "reduce": "functools:reduce", "group": "array.group", "diff": "array.difference", "intersect": "array.intersect",
    "zip": "builtins:zip", "combine": "array.combine", "pluck": "array.pluck", "sum": "array.sum", "avg": "array.avg",
    "min": "array.min", "max": "array.max", "first": "array.first", "last": "array.last", "get": "json.get", "set": "json.put",
    "has": "json.has", "to_list": "array.wrap", "to_tuple": "builtins:tuple", "to_set": "builtins:set", "to_dict": "builtins:dict",
    "ensure": "array.wrap", "paginate": "array.paginate", "windowed": "array.window", "compare": "array.compare",
    "clone": "copy:deepcopy",
}
TURBOX_CAST = {
    "string": "builtins:str", "boolean": "parse.parse.boolean", "integer": "parse.parse.integer", "float": "parse.parse.number",
    "positive": "builtins:abs", "abs": "builtins:abs", "floor": "math:floor", "ceil": "math:ceil", "round": "number.round_to",
    "to_datetime": "date.date.parse", "to_list": "array.wrap", "to_dict": "builtins:dict", "to_json": "json.json.encode",
    "from_json": "json.json.decode", "to_bytes": "builtins:str.encode", "from_bytes": "builtins:bytes.decode",
    "auto": "parse.parse.auto", "unify": "parse.parse.auto", "is_int": "parse.parse.integer", "is_float": "parse.parse.number",
    "is_bool": "parse.parse.boolean", "is_json": "json.json.valid", "is_empty": "string.blank", "is_numeric": "string.numeric",
    "is_positive": "number.sign", "is_negative": "number.sign", "is_date": "date.date.parse", "clamp": "number.clamp",
    "safe_divide": "number.divide", "percent": "number.percent", "sign": "number.sign", "range_check": "number.between",
    "compare_type": "json.kind",
}
TURBOX_DATE = {
    "configure": "date.date.freeze", "now": "date.date.now", "now_ms": "date.date.millis", "now_dt": "date.date.now",
    "now_iso": "date.date.iso", "now_str": "date.date.format", "utc_str": "date.date.utc", "utc_offset": "date.date.offset",
    "extract": "date.date.parse", "ensure_datetime": "date.date.of", "format_like": "date.date.format", "diff": "date.date.diff",
    "since": "date.date.humanize", "sleep": "thread.thread.sleep", "add_seconds": "date.date.add", "add_minutes": "date.date.add",
    "add_hours": "date.date.add", "add_days": "date.date.add", "add_months": "date.date.add", "add_years": "date.date.add",
    "start_of_day": "date.date.start_of", "end_of_day": "date.date.end_of", "start_of_week": "date.date.start_of",
    "end_of_week": "date.date.end_of", "start_of_month": "date.date.start_of", "end_of_month": "date.date.end_of",
    "start_of_year": "date.date.start_of", "end_of_year": "date.date.end_of", "last_day_of_month": "date.date.days_in_month",
    "from_str": "date.date.parse", "to_timezone": "date.date.local", "timestamp_to_hours": "date.date.from_millis",
    "timestamp_to_datetime": "date.date.from_millis", "hours_to_timestamp": "date.date.to_millis",
    "datetime_to_timestamp": "date.date.to_millis", "between": "date.date.between", "human": "date.date.humanize",
    "Parser.parse": "date.date.parse",
}
TURBOX_FUNC = {
    "name": "func.func.name", "signature": "func.func.signature", "execute": "thread.thread.offload",
    "aexecute": "thread.thread.run", "thread": "thread.thread.offload", "athread": "thread.thread.run", "run": "thread.thread.run",
    "arun": "thread.thread.run", "retry": "func.func.retry", "aretry": "func.func.retry", "timeit": "func.func.measure",
    "atimeit": "func.func.measure", "compose": "func.func.compose", "acompose": "func.func.compose", "map": "thread.thread.map",
    "amap": "thread.thread.map", "gather": "thread.thread.gather", "agather": "thread.thread.gather",
    "run_on_exit": "atexit:register", "call": "func.func.call", "acall": "func.func.call", "handle": "func.func.attempt",
    "measure": "func.func.measure", "timeout": "func.func.timeout", "throttle": "func.func.throttle", "cache": "func.func.cached",
    "cache_calls": "func.func.memo", "once": "func.func.once", "debounce": "func.func.debounce", "on_exit": "atexit:register",
    "is_async": "func.func.is_async",
}
TURBOX_FS = {
    "File.exists": "fs.file.has", "File.extension": "fs.path.ext", "File.rename": "fs.file.rename", "File.delete": "fs.file.remove",
    "File.copy": "fs.file.copy", "File.move": "fs.file.move", "File.size": "fs.file.size", "File.size_str": "number.bytes",
    "File.mtime": "fs.file.modified", "File.checksum": "fs.file.hash", "File.info": "fs.file.get", "File.chmod": "fs.file.set",
    "File.lock": "fs.file.lock", "File.readable": "fs.file.can", "File.writable": "fs.file.can", "File.executable": "fs.file.can",
    "File.find": "fs.file.find", "File.replace": "fs.file.replace", "File.lines": "fs.file.read_lines", "File.head": "fs.file.head",
    "File.tail": "fs.file.tail", "File.backup": "fs.file.backup", "File.cleanup": "fs.dir.clean", "File.sync": "fs.dir.sync",
    "File.watch": "fs.watch.changes", "File.encrypt": "fs.encrypt.seal", "File.decrypt": "fs.encrypt.open", "File.compress": "fs.pack.compress",
    "File.extract": "fs.pack.decompress", "File.upload": "storage.storage.upload", "File.download": "storage.Disk.get",
    "Folder.new": "fs.dir.make", "Folder.clear": "fs.dir.clear", "Folder.depth": "fs.dir.levels", "Folder.dirs": "fs.dir.dirs",
    "Folder.files": "fs.dir.files", "Folder.images": "fs.dir.walk", "Folder.disk_usage": "fs.dir.disk", "Folder.walk": "fs.dir.walk",
    "Folder.search": "fs.dir.find", "Folder.last_modified_file": "fs.dir.newest", "Folder.largest_file": "fs.dir.largest",
    "Folder.categorize": "fs.file.media", "Folder.tree": "fs.dir.tree", "Folder.backup": "fs.pack.archive", "Folder.sync": "fs.dir.sync",
    "Editor.read": "fs.file.read_text", "Editor.write": "fs.file.write", "Editor.append": "fs.file.append", "Editor.safe_write": "fs.file.write",
    "Editor.diff": "fs.file.diff", "Editor.replace": "fs.file.replace", "Editor.edit": "fs.file.edit", "Editor.env_get": "config.config.get",
    "Editor.load_env": "config.config.reload", "Checker.mime_type": "fs.file.media", "Checker.type": "fs.path.kind",
    "Checker.empty": "fs.file.empty", "Compressor.zip": "fs.pack.archive", "Compressor.unzip": "fs.pack.extract", "Compressor.tar": "fs.pack.archive",
    "Compressor.untar": "fs.pack.extract", "Compressor.compress": "fs.pack.compress", "Compressor.extract": "fs.pack.decompress",
    "Compressor.unrar": "SKIP:no native rar library with an open license", "Compressor.un7z": "SKIP:7z is not a web upload shape",
    "Encryptor.encrypt_file": "fs.encrypt.seal", "Encryptor.decrypt_file": "fs.encrypt.open", "Encryptor.generate_key": "crypto.crypto.key",
    "Watcher.start": "fs.watch.changes", "Watcher.stop": "fs.watch.changes", "Manager.FTP": "SKIP:ftp is not a storage target here",
    "Manager.GDrive": "storage.storage.drive", "Manager.Dropbox": "SKIP:dropbox adaptor not written", "Manager.S3": "storage.storage.s3",
    "Thread.run": "thread.thread.run", "Process.run": "thread.thread.run", "Ray.run": "thread.thread.run",
    "Thread.cancel": "thread.thread.stop", "Streamer.dispatch": "thread.thread.map",
}
TURBOX_API = {
    "get": "net.net.get", "post": "net.net.post", "put": "net.net.put", "patch": "net.net.patch", "delete": "net.net.delete",
    "head": "net.net.head", "graph": "net.net.graphql", "download": "net.net.download", "upload": "net.net.upload",
    "stream": "net.net.stream", "paginate": "net.net.paginate", "gather": "thread.thread.gather", "set_bearer_token": "net.Remote.bearer",
    "set_basic_token": "net.Remote.basic", "set_headers": "net.Remote.header", "set_retry": "func.func.retry",
    "set_limit": "func.func.limiter", "set_breaker": "net.Remote.breaker", "set_timeout": "net.net.request",
    "set_hmac_signature": "crypto.crypto.sign", "oauth2": "SKIP:oauth flows belong to auth", "cache": "cache.cache.remember",
    "fallback": "func.func.fallback", "metrics": "net.net.stats", "Response.json": "net.Reply.json", "Response.text": "net.Reply.text",
    "Response.ok": "net.Reply.ok", "Response.headers": "net.Reply.headers", "Response.save": "net.net.save",
    "Response.soup": "SKIP:html scraping is not an engine job", "Config.get": "config.config.get", "Config.exists": "config.config.has",
    "Config.reload": "config.config.reload", "Env.get": "config.config.get",
}
FAMILIES = {
    "Str": LARAVEL_STR, "Stringable": LARAVEL_STRINGABLE, "Arr": LARAVEL_ARR, "Collection": LARAVEL_COLLECTION,
    "Number": LARAVEL_NUMBER, "Validation": LARAVEL_RULES, "Http": LARAVEL_HTTP, "Storage": LARAVEL_STORAGE,
    "Cache": LARAVEL_CACHE, "Schedule": LARAVEL_SCHEDULE, "Queue+Events": LARAVEL_QUEUE_EVENTS,
    "Turbox String": TURBOX_STRING, "Turbox Iters": TURBOX_ITERS, "Turbox Cast": TURBOX_CAST, "Turbox Date": TURBOX_DATE,
    "Turbox Func": TURBOX_FUNC, "Turbox fs+parallel": TURBOX_FS, "Turbox api+config": TURBOX_API,
}
FLAGS = frozenset({ "nullable", "sometimes", "bail" })

def resolve ( target: str ) -> bool:

    if target.startswith("SKIP:"): return True
    if target.startswith("rules:"): return target[6:] in rules.names()
    if target.startswith("flag:"): return target[5:] in FLAGS

    found: Any

    if ":" in target:

        name, _, path = target.partition(":")
        found = importlib.import_module(name)

    else:

        member, _, path = target.partition(".")
        module = importlib.import_module(f"engine.{member}")
        found  = module if hasattr(module, path.split(".")[0]) else getattr(module, member, module)

    for part in path.split("."):

        if not hasattr(found, part): return False

        found = getattr(found, part)

    return True

def test_every_laravel_and_turbox_verb_has_an_engine_home () -> None:

    unresolved = [(family, name, target) for family, table in FAMILIES.items() for name, target in table.items() if not resolve(target)]

    assert unresolved == []

def test_the_skips_are_few_and_reasoned () -> None:

    skipped = [(family, name) for family, table in FAMILIES.items() for name, target in table.items() if target.startswith("SKIP:")]
    total   = sum(len(table) for table in FAMILIES.values())

    assert total >= 900 and len(skipped) <= 45 and all(len(target) > len("SKIP:") + 5 for table in FAMILIES.values() for target in table.values() if target.startswith("SKIP:"))

def test_the_engine_carries_verbs_laravel_lacks () -> None:

    targeted = { target.split(".")[-1] for table in FAMILIES.values() for target in table.values() if target.startswith("string.") }
    extra    = [name for name in dir(string) if not name.startswith("_") and callable(getattr(string, name)) and name not in targeted]

    assert { "arabic", "eastern", "sentences", "read_time", "highlight", "ratio", "distance", "closest", "rank", "direction", "simplify" } <= set(extra)

    assert len(rules.names()) > 100
