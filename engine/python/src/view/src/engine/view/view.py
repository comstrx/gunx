from collections.abc import Mapping
from pathlib import Path
from typing import Any
import inspect

from jinja2 import DictLoader, FileSystemLoader, select_autoescape, StrictUndefined, Template, Undefined
from jinja2.exceptions import SecurityError, TemplateNotFound, TemplateSyntaxError
from engine.error import Code, Fault
from engine.thread import thread
from .arch import CACHE, Filter, Folder, LEFT, MOST, NAME, OUTPUT, PLAIN, RESERVED, SMALL, SOURCE, Spent, STEPS
from .arch import Templates, TEXTS, WORD
from .sandbox import Sandbox

class View:

    def __init__ ( self ) -> None:

        self._sandbox: Sandbox | None = None
        self._memory: dict[str, str] | None = None
        self._loaded: dict[str, Template] = {}
        self._texts: dict[str, Template] = {}
        self._reload   = False
        self._steps    = STEPS
        self._output   = OUTPUT
        self._epoch    = 0
        self._rendered = 0

    def setup (
        self, folder: Folder | None = None, templates: Templates | None = None, *, reload: bool = False,
        strict: bool = False, steps: int = STEPS, output: int = OUTPUT, **shared: Any,
    ) -> None:

        memory = None if folder is not None else self._held_(templates)

        if folder is not None and templates is not None: raise self._wrong_("templates")
        if folder is not None and not self._rooted_(folder): raise self._wrong_("folder")
        if not all(type(option) is bool for option in (reload, strict)): raise self._wrong_("option")
        if type(steps) is not int or not 0 < steps <= MOST: raise self._wrong_("steps")
        if type(output) is not int or not 0 < output <= MOST: raise self._wrong_("output")

        self._named_(shared)

        loader = DictLoader(memory) if memory is not None else FileSystemLoader(str(folder))
        escape = select_autoescape(disabled_extensions=PLAIN, default=True, default_for_string=True)
        sandbox = Sandbox(
            loader=loader, autoescape=escape, trim_blocks=True, lstrip_blocks=True, auto_reload=reload,
            cache_size=CACHE, undefined=StrictUndefined if strict else Undefined,
        )

        sandbox.guard()
        sandbox.globals.update(shared)

        sandbox.output = output
        self._sandbox  = sandbox
        self._memory   = memory
        self._reload   = reload
        self._steps    = steps
        self._output   = output
        self._loaded   = {}
        self._texts    = {}
        self._epoch   += 1
        self._rendered = 0

    def ready ( self ) -> bool:

        return self._sandbox is not None

    def register ( self, name: str, job: Filter ) -> None:

        sandbox = self._box_()
        given: object = job

        if type(name) is not str or not WORD.fullmatch(name) or name in sandbox.filters: raise self._wrong_("filter")
        if not callable(given) or inspect.iscoroutinefunction(given): raise self._wrong_("filter")

        sandbox.filters[name] = sandbox.weighed(name, job)

    def share ( self, **shared: Any ) -> None:

        sandbox = self._box_()

        self._named_(shared)

        sandbox.globals.update(shared)

    def put ( self, template: str, source: str ) -> None:

        sandbox = self._box_()

        if self._memory is None: raise self._wrong_("folder")
        if type(template) is not str or not self._path_(template): raise self._wrong_("name")
        if type(source) is not str or len(source) > SOURCE: raise self._wrong_("source")

        self._memory[template] = source
        self._epoch += 1

        self._loaded.pop(template, None)

        if sandbox.cache is not None: sandbox.cache.clear()

    async def render ( self, template: str, /, **data: Any ) -> str:

        return self._fill_(await self._get_(template), template, data)

    async def render_text ( self, source: str, /, **data: Any ) -> str:

        if type(source) is not str or len(source) > SOURCE: raise self._wrong_("source")

        found = self._texts.get(source)

        if found is None: found = await self._made_(source)

        return self._fill_(found, "text", data)

    async def has ( self, template: str ) -> bool:

        self._box_()

        if type(template) is not str: return False

        try: await self._get_(template)
        except Fault as fault:

            if fault.reason not in ("view.missing", "view.syntax"): raise

            return fault.reason == "view.syntax"

        return True

    async def names ( self ) -> list[str]:

        sandbox = self._box_()

        if self._memory is not None: return sorted(self._memory)

        return sorted(await thread.offload(sandbox.list_templates))

    def stats ( self ) -> dict[str, int]:

        return { "loaded": len(self._loaded), "texts": len(self._texts), "rendered": self._rendered }

    async def _get_ ( self, template: str ) -> Template:

        sandbox, epoch = self._box_(), self._epoch

        if type(template) is not str: raise self._wrong_("name")

        held = self._loaded.get(template)

        if held is not None: return held
        if not self._path_(template): raise self._missing_(template)

        try: found = await thread.offload(sandbox.get_template, template)
        except TemplateNotFound as error: raise self._missing_(self._told_(error.name, template)) from error
        except TemplateSyntaxError as error: raise self._syntax_(error.name or template, error.lineno) from error
        except Exception as error: raise self._failed_("load", template) from error

        if epoch != self._epoch:

            if sandbox.cache is not None: sandbox.cache.clear()

            return found

        if not self._reload and len(self._loaded) < CACHE: self._loaded[template] = found

        return found

    async def _made_ ( self, source: str ) -> Template:

        sandbox, epoch = self._box_(), self._epoch

        try: found = await thread.offload(sandbox.from_string, source)
        except TemplateSyntaxError as error: raise self._syntax_(error.name or "text", error.lineno) from error
        except Exception as error: raise self._failed_("load", "text") from error

        if len(source) > SMALL or epoch != self._epoch: return found
        if len(self._texts) >= TEXTS: self._texts.pop(next(iter(self._texts)), None)

        self._texts[source] = found

        return found

    def _fill_ ( self, found: Template, name: str, data: dict[str, Any] ) -> str:

        token = LEFT.set([self._steps])

        try: made = self._poured_(found, data)
        except Spent as spent: raise self._limit_(name, spent.what) from spent
        except RecursionError as error: raise self._limit_(name, "depth") from error
        except SecurityError as error: raise self._unsafe_(name) from error
        except TemplateNotFound as error: raise self._missing_(self._told_(error.name, name)) from error
        except TemplateSyntaxError as error: raise self._syntax_(error.name or name, error.lineno) from error
        except Fault: raise
        except (Exception, SystemExit) as error: raise self._failed_("render", name) from error
        finally: LEFT.reset(token)

        self._rendered += 1

        return made

    def _poured_ ( self, found: Template, data: dict[str, Any] ) -> str:

        size, limit = 0, self._output
        parts: list[str] = []

        for part in found.generate(data):

            size += len(part)

            if size > limit: raise Spent("output")

            parts.append(part)

        return "".join(parts)

    def _held_ ( self, templates: Templates | None ) -> dict[str, str]:

        if templates is None: return {}
        if not isinstance(templates, Mapping): raise self._wrong_("templates")

        for name, source in templates.items():

            if type(name) is not str or not self._path_(name): raise self._wrong_("name")
            if type(source) is not str or len(source) > SOURCE: raise self._wrong_("source")

        return dict(templates)

    def _named_ ( self, shared: dict[str, Any] ) -> None:

        if not all(name.isidentifier() and name not in RESERVED for name in shared): raise self._wrong_("shared")

    def _box_ ( self ) -> Sandbox:

        if self._sandbox is None: raise self._wrong_("setup")

        return self._sandbox

    def _unsafe_ ( self, name: str ) -> Fault:

        return Fault(Code.FORBIDDEN, reason="view.unsafe", errors={ "view": [self._shown_(name)] })

    def _missing_ ( self, name: str ) -> Fault:

        return Fault(Code.NOT_FOUND, reason="view.missing", errors={ "view": [self._shown_(name)] })

    def _syntax_ ( self, name: str, line: int ) -> Fault:

        return Fault(Code.INTERNAL, reason="view.syntax", errors={ "view": [f"{self._shown_(name)}:{line}"] })

    def _limit_ ( self, name: str, what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="view.limit", errors={ "view": [self._shown_(name)], "limit": [what] })

    def _failed_ ( self, what: str, name: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"view.{what}", errors={ "view": [self._shown_(name)] })

    def _wrong_ ( self, what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"view.{what}")

    @staticmethod
    def _rooted_ ( folder: object ) -> bool:

        return isinstance(folder, str | Path) and Path(folder).is_dir()

    @staticmethod
    def _told_ ( name: object, fallback: str ) -> str:

        return name if isinstance(name, str) and name else fallback

    @staticmethod
    def _path_ ( name: str ) -> bool:

        if not 0 < len(name) <= NAME or not name.isprintable() or "\\" in name: return False

        return all(part not in ("", ".", "..") for part in name.split("/"))

    @staticmethod
    def _shown_ ( name: str ) -> str:

        text = name[:NAME]

        return text if text.isprintable() else "".join(letter if letter.isprintable() else "?" for letter in text)
