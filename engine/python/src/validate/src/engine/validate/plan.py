from collections.abc import Iterator, Mapping
from dataclasses import replace
from functools import partial
from typing import Any, cast

from engine.error import Bag, Code, Fault
from engine.json import json
from .arch import Branch, Compiled, CONDITIONS, CROSS, Field, MISSING, SCALARS, Step
from .base import Base

class Plan:

    __slots__ = ("_confirm", "_exclude", "_fields", "_flat", "_groups", "_limit", "_nullable", "_tops", "_tree")

    def __init__ ( self, fields: Compiled, limit: int ) -> None:

        self._fields = fields
        self._limit = limit
        self._tree = Branch()
        self._tops = tuple(dict.fromkeys(field.path[0] for field in fields))
        self._exclude = tuple(sorted(
            (field for field in fields if any(s.kind.startswith("exclude") for s in field.steps)),
            key=lambda field: len(field.path),
        ))
        custom = any(
            isinstance(step.check, partial) and step.check.func is Base.custom
            for field in fields for step in field.steps
        )
        groups: dict[tuple[tuple[str, ...], bool, str], list[Field]] = {}

        for field in fields:

            leaf = field.path[-1] == "*"
            path = field.path if leaf else field.path[:-1]
            groups.setdefault((path, leaf, field.name if custom else ""), []).append(field)

        self._groups = tuple((path, leaf, tuple(items)) for (path, leaf, _), items in groups.items())
        self._flat = all(len(field.path) == 1 for field in fields)
        self._nullable = tuple(
            field.name for field in fields if field.nullable and len(field.path) == 1 and not field.sometimes
        )

        declared = {field.name for field in fields}
        self._confirm = tuple(
            tuple(name.split("."))
            for field in fields for name in field.confirms if "." in name and name not in declared
        )

        for field in fields:

            for path in (field.path, *(tuple(name.split(".")) for name in field.confirms)):

                branch = self._tree

                for part in path: branch = branch.children.setdefault(part, Branch())

    @property
    def fields ( self ) -> Compiled:

        return self._fields

    def check ( self, payload: Mapping[str, Any], reason: str = "validate.rules" ) -> dict[str, Any]:

        bag, removed = self._inspect_(payload)
        bag.raise_if_any(reason)
        kept = {name: payload[name] for name in self._tops if name in payload}

        for name in self._nullable:

            if name not in kept: kept[name] = None

        if removed:

            return cast("dict[str, Any]", json.edit(kept, {}, remove=sorted(removed, key=self._order_, reverse=True)))

        return cast("dict[str, Any]", json.copy(kept)) if any(type(v) not in SCALARS for v in kept.values()) else kept

    def errors ( self, payload: Mapping[str, Any] ) -> dict[str, list[str]]:

        bag, _ = self._inspect_(payload)

        return bag.dump()

    def valid ( self, payload: Mapping[str, Any] ) -> bool:

        return not self.errors(payload)

    def partial ( self ) -> Plan:

        return Plan(tuple(replace(field, sometimes=True) for field in self._fields), self._limit)

    def _inspect_ ( self, payload: Mapping[str, Any] ) -> tuple[Bag, list[str]]:

        if not isinstance(payload, Mapping): raise Fault(Code.BAD_REQUEST, reason="validate.payload")
        if len(payload) > self._limit: raise Fault(Code.BAD_REQUEST, reason="validate.limit")

        bag = Bag()
        removed = self._removed_(payload, bag) if self._exclude else []

        if self._flat: self._flat_(payload, bag, removed)
        else: self._nested_(payload, bag, removed)

        for parts in self._confirm:

            removed.extend(
                path for path, _, present, _ in self._expand_(payload, parts, (), (), bag, removed) if present
            )

        return bag, removed

    def _flat_ ( self, payload: Mapping[str, Any], bag: Bag, removed: list[str] ) -> None:

        for field in self._fields:

            if field.name in removed: continue

            value = payload.get(field.name, MISSING)
            message = self._field_(field, value, value is not MISSING, payload, ())

            if message is not None: bag.add(field.name, message)

        for name in payload.keys() - self._tree.children.keys(): bag.add(str(name), "is not allowed")

    def _nested_ ( self, payload: Mapping[str, Any], bag: Bag, removed: list[str] ) -> None:

        seen = 0

        for field, path, value, present, indices in self._entries_(payload, bag, removed):

            seen += 1

            if seen > self._limit: raise Fault(Code.BAD_REQUEST, reason="validate.limit")
            if removed and self._under_(path, removed): continue

            message = self._field_(field, value, present, payload, indices)

            if message is not None: bag.add(path, message)

        for path in self._unknown_(payload, self._tree, ()):

            if not self._under_(path, removed): bag.add(path, "is not allowed")

    def _entries_ (
        self, payload: Mapping[str, Any], bag: Bag, removed: list[str],
    ) -> Iterator[tuple[Field, str, Any, bool, tuple[str, ...]]]:

        for prefix, leaf, fields in self._groups:

            for parent, value, present, indices in self._expand_(payload, prefix, (), (), bag, removed):

                if leaf:

                    yield fields[0], parent, value, present, indices
                    continue

                if value is not MISSING and not isinstance(value, (dict, Mapping, list)):

                    bag.add(parent, "must be an object")
                    continue

                for field in fields:

                    name = field.path[-1]
                    path = f"{parent}.{name}" if parent else name
                    found = value.get(name, MISSING) if isinstance(value, dict) else json.get(value, name, MISSING)

                    yield field, path, found, found is not MISSING, indices

    @staticmethod
    def _order_ ( path: str ) -> tuple[int, tuple[tuple[bool, int | str], ...]]:

        parts = path.split(".")

        return len(parts), tuple((part.isdecimal(), int(part) if part.isdecimal() else part) for part in parts)

    @staticmethod
    def _under_ ( path: str, removed: list[str] ) -> bool:

        return bool(removed) and any(path == name or path.startswith(name + ".") for name in removed)

    def _removed_ ( self, payload: Mapping[str, Any], bag: Bag ) -> list[str]:

        removed: list[str] = []
        seen = 0

        for field in self._exclude:

            for path, _, _, indices in self._expand_(payload, field.path, (), (), bag, removed):

                seen += 1

                if seen > self._limit: raise Fault(Code.BAD_REQUEST, reason="validate.limit")

                for raw in field.steps:

                    step = self._bound_(raw, indices)

                    if step.kind == "exclude" or (step.kind.startswith("exclude_") and Base.condition(step, payload)):

                        removed.append(path)
                        break

        return removed

    def _field_ (
        self, field: Field, value: Any, present: bool, payload: Mapping[str, Any], indices: tuple[str, ...],
    ) -> str | None:

        if field.sometimes and not present: return None

        if field.required and Base.empty(value): return "is required"

        if field.presence:

            message = self._presence_(field, value, present, payload, indices)

            if message is not None: return message

        absent = value is None or value is MISSING

        if (field.nullable and absent) or (not field.implicit and (absent or value == "")): return None

        for raw in field.tests:

            step = self._bound_(raw, indices) if indices and "*" in raw.argument else raw
            message = step.check(None if value is MISSING else value, step.argument, payload)

            if message is not None: return message

        return None

    def _presence_ (
        self, field: Field, value: Any, present: bool, payload: Mapping[str, Any], indices: tuple[str, ...],
    ) -> str | None:

        for raw in field.presence:

            step = self._bound_(raw, indices) if indices and "*" in raw.argument else raw
            kind = step.kind

            if kind == "present" and not present: return "must be present"
            if kind == "missing" and present: return "must be missing"
            if kind in CONDITIONS and Base.condition(step, payload):

                if kind.startswith("required_") and Base.empty(value): return "is required"
                if kind.startswith("present_") and not present: return "must be present"
                if kind.startswith("missing_") and present: return "must be missing"

        return None

    @staticmethod
    def _bound_ ( step: Step, indices: tuple[str, ...] ) -> Step:

        if not indices or "*" not in step.argument: return step
        if step.kind not in CROSS and step.kind not in CONDITIONS and not step.kind.startswith("prohibited"):

            return step

        argument = ",".join(Base.argument(part, indices) for part in step.parts)

        return Step(step.kind, argument, step.check, tuple(argument.split(",")))

    def _expand_ (
        self, value: Any, parts: tuple[str, ...], trail: tuple[str, ...], indices: tuple[str, ...], bag: Bag,
        removed: list[str],
    ) -> Iterator[tuple[str, Any, bool, tuple[str, ...]]]:

        if removed and self._under_(".".join(trail), removed): return

        if not parts:

            yield ".".join(trail), value, value is not MISSING, indices
            return

        part, tail = parts[0], parts[1:]

        if part == "*":

            yield from self._items_(value, tail, trail, indices, bag, removed)
            return

        if isinstance(value, dict): found = value.get(part, MISSING)
        elif value is MISSING: found = MISSING
        elif isinstance(value, Mapping | list): found = json.get(value, part, MISSING)
        else:

            bag.add(".".join(trail), "must be an object")
            return

        yield from self._expand_(found, tail, (*trail, part), indices, bag, removed)

    def _items_ (
        self, value: Any, tail: tuple[str, ...], trail: tuple[str, ...], indices: tuple[str, ...], bag: Bag,
        removed: list[str],
    ) -> Iterator[tuple[str, Any, bool, tuple[str, ...]]]:

        if value is MISSING: return
        if not isinstance(value, list):

            bag.add(".".join(trail), "must be a list")
            return

        if len(value) > self._limit: raise Fault(Code.BAD_REQUEST, reason="validate.limit")

        for index, item in enumerate(value):

            name = str(index)

            yield from self._expand_(item, tail, (*trail, name), (*indices, name), bag, removed)

    def _unknown_ ( self, value: Any, branch: Branch, trail: tuple[str, ...] ) -> Iterator[str]:

        if isinstance(value, (dict, Mapping)):

            if len(value) > self._limit: raise Fault(Code.BAD_REQUEST, reason="validate.limit")

            for name, item in value.items():

                child = branch.children.get(name)
                path = (*trail, str(name))

                if child is None: yield ".".join(path)
                elif child.children: yield from self._unknown_(item, child, path)

        elif isinstance(value, list):

            if len(value) > self._limit: raise Fault(Code.BAD_REQUEST, reason="validate.limit")

            for index, item in enumerate(value):

                name = str(index)
                child = branch.children.get(name, branch.children.get("*"))

                if child is not None and child.children: yield from self._unknown_(item, child, (*trail, name))
