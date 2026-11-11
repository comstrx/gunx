from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, TypeGuard
import inspect, re

from engine.error import Code, Fault

type Handler = Callable[..., Any]
type Check   = Callable[[object], bool]
type Asked   = tuple[Sequence[Tool], Mapping[str, Any] | None, Mapping[str, Any]]

ROLES       = frozenset({ "system", "user", "assistant", "tool" })
TASKS       = ("chat", "complete", "embed", "summarize", "extract", "classify", "stream")
STOPS       = frozenset({ "stop", "length", "tools", "refused", "paused", "other" })
HALTED      = frozenset({ "length", "refused", "paused" })
ACTED       = frozenset({ "tools", "stop" })
CHOICES     = frozenset({ "auto", "any", "none" })
THOUGHT     = frozenset({ "thinking", "redacted_thinking" })
ECHOED      = frozenset({ "thinking", "redacted_thinking", "text", "tool_use" })
KEYED       = frozenset({ "$defs", "definitions", "properties" })
NESTED      = frozenset({ "allOf", "anyOf", "items" })
WORDED      = frozenset({ "$ref", "title", "description" })
LISTED      = frozenset({ "required" })
KEYWORDS    = frozenset({
    "$defs", "$ref", "additionalProperties", "allOf", "anyOf", "const", "default", "definitions", "description",
    "enum", "format", "items", "properties", "required", "title", "type",
})
FORMATS     = frozenset({ "date", "date-time", "duration", "email", "hostname", "ipv4", "ipv6", "time", "uri", "uuid" })
WORD        = re.compile(r"[A-Za-z0-9_-]{1,64}")
JSON        = "application/json"
EVENTS      = "text/event-stream"
NDJSON      = "application/x-ndjson"
SIGNED      = "thoughtSignature"
STATUS      = "net.status"
MESSAGES    = "/v1/messages"
COMPLETIONS = "/chat/completions"
EMBEDDINGS  = "/embeddings"
MODELS      = "/v1beta/models"
CHAT        = "/api/chat"
EMBED       = "/api/embed"
DONE        = "[DONE]"
ANSWER      = "answer"
LOCAL       = "local_"
VERSION     = "2026-10-21"
FENCE       = "```"
MAX_INPUT   = 32_000
MAX_OUTPUT  = 1_048_576
MAX_IMAGES  = 20 * 1024 * 1024
REPLY       = 32 * 1024 * 1024
IMAGES      = 20
IDENT       = 256
DESCRIPTION = 4_096
TOOLS       = 128
HALTS       = 4
ROUNDS      = 4
MAX_ROUNDS  = 64
WINDOW      = 20
MIN_WINDOW  = 2
HOTTEST     = 2
MAX_WINDOW  = 4_096
TTL         = 7 * 86400
TIMEOUT     = 120.0
LONGEST     = 3_600.0
BATCH       = 96
ABREAST     = 4
TEXTS       = 4_096
PACK        = 256_000
LOAD        = 64 * 1024 * 1024
WIDEST      = 65_536
DENSE       = 16_384
HEAVY       = 262_144
TOKENS      = 16_000
MOST        = 1_000_000
COUNT       = 1 << 40
DEPTH       = 64
DIGEST      = 32
MEDIA       = (
    (b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG\r\n\x1a\n", "image/png"), (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"), (b"RIFF", "image/webp"),
)

SPENT       = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")

ANTHROPIC_STOPS: Mapping[str, str] = {
    "end_turn": "stop", "stop_sequence": "stop", "max_tokens": "length", "model_context_window_exceeded": "length",
    "tool_use": "tools", "refusal": "refused", "pause_turn": "paused",
}
OPENAI_STOPS: Mapping[str, str] = {
    "stop": "stop", "length": "length", "tool_calls": "tools", "function_call": "tools", "content_filter": "refused",
}
GEMINI_STOPS: Mapping[str, str] = {
    "STOP": "stop", "MAX_TOKENS": "length", "SAFETY": "refused", "RECITATION": "refused", "BLOCKLIST": "refused",
    "PROHIBITED_CONTENT": "refused", "SPII": "refused", "IMAGE_SAFETY": "refused", "LANGUAGE": "refused",
}
OLLAMA_STOPS: Mapping[str, str] = { "stop": "stop", "length": "length" }
OPENAI_CHOICES: Mapping[str, str] = { "auto": "auto", "any": "required", "none": "none" }
GEMINI_CHOICES: Mapping[str, str] = { "auto": "AUTO", "any": "ANY", "none": "NONE" }

def media ( image: bytes ) -> str | None:

    for magic, kind in MEDIA:

        if image.startswith(magic) and (magic != b"RIFF" or image[8:12] == b"WEBP"): return kind

    return None

def named ( value: object ) -> TypeGuard[str]:

    return type(value) is str and 0 < len(value) <= IDENT and value.isprintable()

def timed ( value: object ) -> bool:

    return isinstance(value, int | float) and type(value) is not bool and 0 < value <= LONGEST

def counted ( value: object ) -> bool:

    return type(value) is int and 1 <= value <= MOST

def warm ( value: object ) -> bool:

    return isinstance(value, int | float) and type(value) is not bool and 0 <= value <= HOTTEST

def nucleus ( value: object ) -> bool:

    return isinstance(value, int | float) and type(value) is not bool and 0 < value <= 1

def halts ( value: object ) -> bool:

    if type(value) is str: return named(value)

    return isinstance(value, list | tuple) and 0 < len(value) <= HALTS and all(named(item) for item in value)

def choice ( value: object ) -> bool:

    return type(value) is str and value in CHOICES

def stops ( value: str | list[str] | tuple[str, ...] ) -> list[str]:

    return [value] if isinstance(value, str) else list(value)

CHECKS: Mapping[str, Check] = {
    "max_tokens": counted, "temperature": warm, "top_p": nucleus, "stop": halts, "tool_choice": choice,
}

def checked ( options: Mapping[str, Any] ) -> dict[str, Any]:

    made: dict[str, Any] = {}

    for name, value in options.items():

        check = CHECKS.get(name)

        if check is None or (value is not None and not check(value)):

            raise Fault(Code.INTERNAL, reason="ai.option", errors={ "option": [name[:IDENT]] })

        if value is not None: made[name] = value

    return made

@dataclass(frozen=True, slots=True)
class Native:

    owner   : str
    content : Any
    bound   : bool = False

@dataclass(frozen=True, slots=True)
class Call:

    id        : str
    name      : str
    arguments : dict[str, Any] = field(default_factory=dict)
    broken    : bool = False

    def __post_init__ ( self ) -> None:

        if not named(self.id) or not named(self.name) or not isinstance(self.arguments, dict):

            raise Fault(Code.INTERNAL, reason="ai.call")

    def dump ( self ) -> dict[str, Any]:

        made: dict[str, Any] = { "id": self.id, "name": self.name, "arguments": self.arguments }

        if self.broken: made["broken"] = True

        return made

@dataclass(frozen=True, slots=True)
class Tool:

    name        : str
    description : str
    parameters  : Mapping[str, Any] = field(default_factory=lambda: { "type": "object", "properties": {} })
    handler     : Handler | None = None
    shape       : inspect.Signature | None = field(default=None, init=False, repr=False, compare=False)

    def __post_init__ ( self ) -> None:

        given: object = self.handler

        if type(self.name) is not str or not WORD.fullmatch(self.name): raise self._wrong_("name")
        if type(self.description) is not str or len(self.description) > DESCRIPTION: raise self._wrong_("description")
        if not isinstance(self.parameters, Mapping): raise self._wrong_("parameters")
        if given is None: return
        if not callable(given): raise self._wrong_("handler")

        try: object.__setattr__(self, "shape", inspect.signature(given))
        except (TypeError, ValueError): return

    def dump ( self ) -> dict[str, Any]:

        return { "name": self.name, "description": self.description, "parameters": dict(self.parameters) }

    async def run ( self, call: Call ) -> Any:

        if self.handler is None: raise Fault(Code.INTERNAL, reason="ai.handler", errors={ "tool": [self.name] })
        if call.broken: raise self._refused_()
        if self.shape is None: return await self._settled_(self.handler(**call.arguments))

        try: bound = self.shape.bind(**call.arguments)
        except TypeError as error: raise self._refused_() from error

        return await self._settled_(self.handler(*bound.args, **bound.kwargs))

    @staticmethod
    async def _settled_ ( made: Any ) -> Any:

        return await made if inspect.isawaitable(made) else made

    def _refused_ ( self ) -> Fault:

        return Fault(Code.VALIDATION, reason="ai.arguments", errors={ "tool": [self.name] })

    def _wrong_ ( self, what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="ai.tool", errors={ "tool": [what] })
