from types import NoneType, UnionType
from typing import Annotated, Any, ClassVar, get_args, get_origin, Self

from engine.error import Bag, Code, Fault
from engine.json import json
from engine.log import Render
from engine.parse import parse
from engine.validate import Member, Shape
from .arch import ADDRESS, BAKED, BROKEN, HIDDEN, LISTS, LONE, MARKED, MISSING, PAIR, Pairs, RELEASE, STAGE
import os

class Settings(Shape, kw_only=True):

    prefix: ClassVar[str] = ""

    @classmethod
    def head ( cls ) -> str:

        return f"{cls.prefix.rstrip('_')}_" if cls.prefix else ""

    @classmethod
    def keys ( cls ) -> dict[str, str]:

        head = cls.head()

        return { member.name: f"{head}{member.name.upper()}" for member in cls.members() }

    @classmethod
    def load ( cls, source: Pairs | None = None ) -> Self:

        values  = os.environ if source is None else source
        release = values.get(STAGE, "") == RELEASE
        head    = cls.head()
        raw: dict[str, Any] = {}
        bag     = Bag()

        for member in cls.members():

            key   = f"{head}{member.name.upper()}"
            found = values.get(key)

            if found is None or found == "":

                if release and cls._baked_(member): bag.add(key, BAKED)

                continue

            if not found.isascii() and LONE.search(found):

                bag.add(key, BROKEN)

                continue

            try: raw[member.name] = cls._coerce_(member.kind, found)
            except Fault as fault: bag.add(key, fault.message)

        if bag.has(): raise bag.fault(Code.INTERNAL, "config.env")

        try: return cls.from_mapping(raw)
        except Fault as error: refused = error

        raise cls._shape_(refused)

    @classmethod
    def stray ( cls, source: Pairs | None = None ) -> list[str]:

        head   = cls.head()
        known  = set(cls.keys().values())
        values = os.environ if source is None else source

        known.add(STAGE)

        return sorted(key for key in values if key.startswith(head) and key not in known) if head else []

    @staticmethod
    def marked ( name: str ) -> bool:

        return MARKED.search(name.lower()) is not None

    def describe ( self ) -> dict[str, Any]:

        return { name: self._shown_(name, value) for name, value in self.dump().items() }

    @classmethod
    def _baked_ ( cls, member: Member ) -> bool:

        return isinstance(member.default, str) and bool(member.default) and cls.marked(member.name)

    @classmethod
    def _coerce_ ( cls, kind: Any, text: str ) -> Any:

        target = cls._plain_(kind)
        origin = get_origin(target) or target

        if target is bool: return parse.boolean(text)
        if target is int: return parse.integer(text)
        if target is float: return parse.number(text)
        if origin in LISTS: return json.decode(text) if text.startswith("[") else parse.list(text)
        if origin is dict or (isinstance(target, type) and issubclass(target, Shape)): return json.decode(text)

        return text

    @classmethod
    def _plain_ ( cls, kind: Any ) -> Any:

        args = get_args(kind)

        if get_origin(kind) is Annotated: return cls._plain_(args[0])
        if isinstance(kind, UnionType) and len(args) == PAIR and NoneType in args:

            return cls._plain_(next(arg for arg in args if arg is not NoneType))

        return kind

    @classmethod
    def _shape_ ( cls, error: Fault ) -> Fault:

        keys  = cls.keys()
        group = cls.prefix or cls.__name__
        bag   = Bag()

        for name, texts in (error.errors or {}).items():

            absent = MISSING.search(" ".join(texts))
            field  = absent.group(1) if absent else name.split("[")[0].split(".")[0]
            shown  = [HIDDEN] if cls._grade_(field) else texts

            bag.extend({ keys.get(field, group): ["is required"] if absent else shown })

        if not bag.has(): bag.add(group, error.message)

        return bag.fault(Code.INTERNAL, "config.shape")

    @classmethod
    def _grade_ ( cls, name: str ) -> int:

        return Render.grade(name) or int(cls.marked(name))

    def _shown_ ( self, name: str, value: Any ) -> Any:

        if not value or isinstance(value, bool): return value

        grade = Render.grade(name)

        if grade or not self.marked(name): return Render.hide(value, grade) if grade else Render.clean(value)
        if ADDRESS.search(name.lower()) is None: return Render.hide(value)
        if isinstance(value, str): return Render.origin(value)

        return [Render.origin(item) for item in value] if isinstance(value, list | tuple) else Render.hide(value)
