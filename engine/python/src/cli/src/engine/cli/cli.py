from collections.abc import Awaitable, Callable, Iterable, Sequence
from itertools import takewhile
from typing import Any

from engine.error import Code, Fault
from engine.log import log
from engine.string import string
from .arch import Action, Argument, BYTE, COMMANDS, FAILED, HELP, INTERRUPTED, LINE, nearest, PIPE, RESERVED, USAGE
from .arch import VERSION, WORD, Writer
from .command import Command
import asyncio, contextlib, inspect, os, sys

type Routed = int | tuple[Command, dict[str, Any]]

class Cli:

    def __init__ ( self, program: str, summary: str, version: str, default: str | None = None ) -> None:

        if not self._word_(program) or " " in program: raise self._wrong_("program")
        if type(summary) is not str or len(summary) > LINE or not summary.isprintable(): raise self._wrong_("summary")
        if not self._word_(version): raise self._wrong_("version")
        if default is not None and type(default) is not str: raise self._wrong_("default")

        self.program  = program
        self.summary  = summary
        self.version  = version
        self._default = default
        self._commands: dict[str, Command] = {}
        self._out: Writer | None = None
        self._err: Writer | None = None
        self._cut = False

    def setup ( self, out: Writer | None = None, err: Writer | None = None ) -> Cli:

        if not all(writer is None or callable(writer) for writer in (out, err)): raise self._wrong_("writer")

        self._out, self._err = out, err

        return self

    def register ( self, *commands: Command ) -> Cli:

        for command in commands:

            given: object = command

            if not isinstance(given, Command) or command.name in RESERVED: raise self._wrong_("name")
            if command.name in self._commands: raise self._wrong_("duplicate", command.name)
            if len(self._commands) >= COMMANDS: raise self._wrong_("full", command.name)

            self._commands[command.name] = command

        return self

    def command ( self, name: str, summary: str = "", group: str = "general" ) -> Callable[[Action], Command]:

        def made ( action: Action ) -> Command:

            command = Command(name, action, summary, group)

            self.register(command)

            return command

        return made

    def has ( self, name: str ) -> bool:

        return type(name) is str and name in self._commands

    def get ( self, name: str ) -> Command:

        found = self._commands.get(name) if type(name) is str else None

        if found is None: raise self._unknown_(str(name))

        return found

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._commands))

    def say ( self, text: str ) -> int:

        self._told_(text)

        return 0

    def fail ( self, text: str, code: int = FAILED ) -> int:

        self._told_(text, wrong=True)

        return self._code_(code) or FAILED

    def table ( self, head: Sequence[object], rows: Iterable[Sequence[object]] ) -> int:

        grid   = [[self._cell_(value) for value in row] for row in (head, *rows)]
        widths = [max(row[at][1] for row in grid if at < len(row)) for at in range(max(map(len, grid)))]

        for row in grid:

            cells = [text + " " * (widths[at] - span) for at, (text, span) in enumerate(row)]

            self._told_("  ".join(cells).rstrip())

        return 0

    def manual ( self, name: str | None = None ) -> str:

        if name is not None: return self.get(name).manual(self.program)

        groups: dict[str, list[Command]] = {}
        lines  = [f"{self.program} {self.version}", *([self.summary] if self.summary else [])]
        width  = max(map(len, self._commands), default=0)

        for command in self._commands.values(): groups.setdefault(command.group, []).append(command)

        lines += ["", f"Usage: {self.program} <command> [arguments] [--options]"]

        for group, commands in sorted(groups.items()):

            rows = sorted(f"  {command.name:<{width}}  {command.summary}".rstrip() for command in commands)

            lines += ["", group, *rows]

        return "\n".join([*lines, "", f"Run '{self.program} help <command>' for one command."])

    def run ( self, argv: Sequence[str] | None = None ) -> int:

        command: Command | None = None

        try:

            found = self._routed_(sys.argv[1:] if argv is None else argv)

            if isinstance(found, int): return self._flushed_(found)

            command, values = found
            made = command.invoke(values)

            if inspect.isawaitable(made): made = self._driven_(made)

        except (KeyboardInterrupt, asyncio.CancelledError): return INTERRUPTED
        except (Exception, SystemExit) as error: return self._flushed_(self._settled_(command, error))

        return self._flushed_(self._code_(made))

    async def call ( self, argv: Sequence[str] ) -> int:

        command: Command | None = None

        try:

            found = self._routed_(argv)

            if isinstance(found, int): return found

            command, values = found
            made = command.invoke(values)

            if inspect.isawaitable(made): made = await made

        except (Exception, SystemExit) as error: return self._settled_(command, error)

        return self._code_(made)

    def describe ( self ) -> dict[str, Any]:

        return {
            "program"  : self.program,
            "version"  : self.version,
            "default"  : self._default,
            "commands" : [command.describe() for command in self._commands.values()],
        }

    def _routed_ ( self, argv: Sequence[str] ) -> Routed:

        command: Command | None = None

        try:

            if not isinstance(argv, list | tuple) or not all(type(token) is str for token in argv):

                raise self._wrong_("tokens")

            tokens = list(argv)
            first  = tokens[0] if tokens else None

            if first is None and self._default is None: return self.say(self.manual())
            if first in HELP or first == "help": return self._helped_(tokens[1:])
            if first in VERSION: return self.say(f"{self.program} {self.version}")

            command = self._chosen_(first)
            rest    = tokens[1:] if first == command.name else tokens

            if any(word in HELP for word in takewhile(lambda word: word != "--", rest)):

                return self.say(command.manual(self.program))

            return command, command.parse(rest)

        except Fault as fault: return self._refuse_(fault, command)

    def _chosen_ ( self, first: str | None ) -> Command:

        named = self._commands.get(first) if first is not None else None

        if named is not None: return named
        if self._default is None or not (first is None or first.startswith("-")): raise self._unknown_(first or "")

        found = self._commands.get(self._default)

        if found is None: raise self._wrong_("default", self._default)

        return found

    def _helped_ ( self, rest: Sequence[str] ) -> int:

        extra = { "extra": [Argument.shown(word) for word in rest[1:]] }

        if len(rest) > 1: raise Fault(Code.BAD_REQUEST, "Unexpected argument", "cli.argument", extra)

        return self.say(self.manual(rest[0] if rest and rest[0] not in RESERVED else None))

    def _driven_ ( self, made: Awaitable[Any] ) -> Any:

        try: asyncio.get_running_loop()
        except RuntimeError: return asyncio.run(self._awaited_(made))

        if inspect.iscoroutine(made): made.close()

        raise self._wrong_("loop")

    async def _awaited_ ( self, made: Awaitable[Any] ) -> Any:

        return await made

    def _settled_ ( self, command: Command | None, error: BaseException ) -> int:

        name = command.name if command is not None else None

        if isinstance(error, SystemExit): return self._left_(error)

        if isinstance(error, Fault):

            self._told_(self._worded_(error), wrong=True)

            log.at("error" if error.server() else "debug", "cli.failed", command=name, reason=error.reason)

            return FAILED

        log.exception("cli.crashed", command=name)

        self._told_(f"error: {type(error).__name__} (cli.crashed)", wrong=True)

        return FAILED

    def _left_ ( self, stop: SystemExit ) -> int:

        code = stop.code

        if code is None or isinstance(code, int): return self._code_(int(code or 0))

        self._told_(Argument.shown(code, LINE), wrong=True)

        return FAILED

    def _refuse_ ( self, fault: Fault, command: Command | None = None ) -> int:

        hint = f"usage: {self.program} {command.usage()}" if command else f"Run '{self.program} help' for the manual."

        self._told_(self._worded_(fault), wrong=True)
        self._told_(hint, wrong=True)

        log.at("error" if fault.server() else "debug", "cli.refused", reason=fault.reason)

        return USAGE if fault.client() else FAILED

    def _worded_ ( self, fault: Fault ) -> str:

        shown = Argument.shown
        lines = [f"error: {shown(fault.message, LINE)} ({shown(fault.reason or fault.code.value)})"]

        for field, messages in (fault.errors or {}).items():

            lines.append(f"  {shown(field)}: {', '.join(shown(message, LINE) for message in messages)}")

        return "\n".join(lines)

    def _told_ ( self, text: str, wrong: bool = False ) -> None:

        writer = self._err if wrong else self._out
        stream = sys.stderr if wrong else sys.stdout

        try:

            if writer is not None: writer(text)
            elif stream is not None: stream.write(text + "\n")

        except BrokenPipeError: self._cut = self._cut or not (wrong or writer is not None)
        except (OSError, ValueError): return

    def _flushed_ ( self, code: int ) -> int:

        if self._out is not None or sys.stdout is None: return code

        try: sys.stdout.flush()
        except BrokenPipeError: self._cut = True
        except (OSError, ValueError): return code

        if not self._cut: return code

        self._cut = False

        with contextlib.suppress(OSError, ValueError):

            target = sys.stdout.fileno()
            sink   = os.open(os.devnull, os.O_WRONLY)

            try: os.dup2(sink, target)
            finally: os.close(sink)

        return PIPE

    def _code_ ( self, made: object ) -> int:

        if isinstance(made, bool): return 0 if made else FAILED
        if isinstance(made, int): return int(made) if 0 <= made <= BYTE else FAILED

        return 0

    def _cell_ ( self, value: object ) -> tuple[str, int]:

        text = Argument.shown(value, LINE)

        return text, self._span_(text)

    def _span_ ( self, text: str ) -> int:

        return string.width(text)

    def _unknown_ ( self, name: str ) -> Fault:

        near   = nearest(name, self._commands)
        errors = { "command": [Argument.shown(name)], **({ "nearest": near } if near else {}) }

        return Fault(Code.NOT_FOUND, "Unknown command", "cli.command", errors)

    def _wrong_ ( self, what: str, name: str | None = None ) -> Fault:

        errors = { "command": [Argument.shown(name)] } if name else None

        return Fault(Code.INTERNAL, reason=f"cli.{what}", errors=errors)

    @staticmethod
    def _word_ ( text: object ) -> bool:

        return type(text) is str and 0 < len(text) <= WORD and text.isprintable()
