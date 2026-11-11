from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from engine.context import context
from engine.error import Code, Fault
from engine.json import json
from engine.parse import parse
from .arch import (
    ANY, Catalog, Chain, DEPTH, FORMS, Forms, HEADER, KEPT, Layer, OFFERS, OTHER, PLAIN, ROOT, Sources, TAG, Texts,
    UNTAGGED, WANTED,
)
from .plural import Plural

class Translate:

    def __init__ ( self, plural: Plural | None = None ) -> None:

        self._plural                   = plural or Plural()
        self._texts: dict[str, Texts]  = {}
        self._fallback                 = "en"
        self._locales: tuple[str, ...] = ("en",)
        self._kin: dict[str, str]      = {}
        self._chains: dict[str, Chain] = { "en": (("en", {}, {}),) }
        self._seen: dict[str, Chain]   = {}
        self._chosen: dict[str, str]   = {}
        self._generation               = 0

    def setup ( self, catalogs: Mapping[str, Catalog], fallback: str = "en" ) -> None:

        self._seat_(self._gather_({}, ((str(name), name, catalog) for name, catalog in catalogs.items())), fallback)

    def load ( self, *folders: Path, fallback: str = "en" ) -> tuple[str, ...]:

        found = [(file.name, file.stem, self._read_(file)) for folder in folders for file in self._files_(folder)]

        self._seat_(self._gather_(self._texts, found), fallback)

        return self._locales

    def extend ( self, locale: str, catalog: Catalog ) -> None:

        self._seat_(self._gather_(self._texts or { self._fallback: {} }, [(locale, locale, catalog)]), self._fallback)

    def locales ( self ) -> tuple[str, ...]:

        return self._locales

    def fallback ( self ) -> str:

        return self._fallback

    def generation ( self ) -> int:

        return self._generation

    def current ( self ) -> str:

        return self._chain_(None)[0][0]

    def resolve ( self, wanted: str | None = None ) -> str:

        return self._chain_(wanted)[0][0]

    def negotiate ( self, header: str | None ) -> str:

        if not header: return self._fallback

        found = self._chosen.get(header)

        return self._keep_(self._chosen, header, self._offer_(header)) if found is None else found

    def tag ( self, text: str ) -> str:

        found = self._tag_(text)

        if found is None: raise Fault(Code.VALIDATION, reason="translate.locale", errors={ "locale": [UNTAGGED] })

        return found

    def has ( self, key: str, locale: str | None = None, section: str | None = None ) -> bool:

        name = f"{section}.{key}" if section else key

        return any(name in texts or name in plurals for _, texts, plurals in self._chain_(locale))

    def find ( self, key: str, locale: str | None = None, section: str | None = None, **params: Any ) -> str | None:

        name = f"{section}.{key}" if section else key

        for tag, texts, plurals in self._chain_(locale):

            found = texts.get(name)

            if found is None:

                forms = plurals.get(name)

                if forms is None: continue

                found = self._pick_(forms, tag, params.get("count"))

            return parse.template(found, params, strict=False) if params else found

        return None

    def text ( self, key: str, locale: str | None = None, **params: Any ) -> str:

        found = self.find(key, locale, **params)

        return key if found is None else found

    def choice ( self, key: str, count: object, locale: str | None = None, **params: Any ) -> str:

        return self.text(key, locale, count=count, **params)

    def reason ( self, reason: str, locale: str | None = None, **params: Any ) -> str | None:

        return self.find(reason, locale, "reasons", **params)

    def catalog ( self, locale: str ) -> Catalog:

        return dict(self._texts.get(self._tag_(locale) or "", {}))

    def missing ( self, locale: str, forms: bool = False ) -> list[str]:

        tag    = self._tag_(locale) or ""
        layers = self._own_(tag)
        held   = self._keys_(layers)
        absent = [key for key in self._keys_(self._own_(self._fallback)) if key not in held]

        if forms: absent += self._gaps_(tag, layers)

        return sorted(absent)

    def describe ( self ) -> dict[str, Any]:

        keys = len(self._keys_(self._own_(self._fallback)))

        return { "locales": list(self._locales), "fallback": self._fallback, "keys": keys }

    def _chain_ ( self, locale: str | None ) -> Chain:

        wanted = locale or context.locale(self._fallback)
        found  = self._chains.get(wanted) or self._seen.get(wanted)

        if found is not None: return found

        return self._keep_(self._seen, wanted, self._chains[self._match_(wanted) or self._fallback])

    def _keep_ [T] ( self, held: dict[str, T], key: str, found: T ) -> T:

        if len(key) <= WANTED:

            if len(held) >= KEPT: held.clear()

            held[key] = found

        return found

    def _match_ ( self, wanted: str ) -> str | None:

        tag = self._tag_(wanted)

        if tag is None: return None

        for step in self._ladder_(tag):

            if step in self._texts: return step

        return self._kin.get(tag.partition("-")[0])

    def _offer_ ( self, header: str ) -> str:

        for name in parse.accept(header[:HEADER])[:OFFERS]:

            if name == ANY: return self._fallback

            found = self._match_(name)

            if found is not None: return found

        return self._fallback

    def _tag_ ( self, text: str ) -> str | None:

        found = TAG.fullmatch(text)

        if found is None: return None

        language, script, region, rest = found.group("language", "script", "region", "rest")
        tag = language.lower()

        if script: tag = f"{tag}-{script.title()}"
        if region: tag = f"{tag}-{region.upper()}"

        return f"{tag}{rest.lower().replace('_', '-')}" if rest else tag

    def _ladder_ ( self, tag: str ) -> list[str]:

        steps = [tag]

        while "-" in tag:

            tag = tag.rpartition("-")[0]

            steps.append(tag)

        return steps

    def _pick_ ( self, forms: Forms, tag: str, count: object ) -> str:

        found = forms.get(self._plural.form(tag, count))

        if found is None: found = forms.get(OTHER)

        return next(iter(forms.values())) if found is None else found

    def _own_ ( self, tag: str ) -> list[Layer]:

        return [self._chains[step][0] for step in self._ladder_(tag) if step in self._texts]

    def _keys_ ( self, layers: Iterable[Layer] ) -> set[str]:

        keys: set[str] = set()

        for _, texts, plurals in layers:

            keys.update(plurals)
            keys.update(key for key in texts if not self._member_(key, plurals))

        return keys

    def _member_ ( self, key: str, plurals: Mapping[str, Forms] ) -> bool:

        head, dot, last = key.rpartition(".")

        return bool(dot) and last in FORMS and head in plurals

    def _gaps_ ( self, tag: str, layers: list[Layer] ) -> list[str]:

        needed = self._plural.forms(tag)
        seen: dict[str, Forms] = {}

        for _, _, plurals in layers:

            for head, forms in plurals.items(): seen.setdefault(head, forms)

        return [f"{head}.{form}" for head, forms in seen.items() for form in needed if form not in forms]

    def _files_ ( self, folder: Path ) -> list[Path]:

        if folder.is_dir(): return sorted(folder.glob("*.json"))

        raise Fault(Code.INTERNAL, reason="translate.folder", errors={ "folder": [folder.name[:WANTED]] })

    def _read_ ( self, file: Path ) -> object:

        try: return json.decode(file.read_bytes())
        except OSError as error: raise self._refuse_(file.name, "is not readable") from error
        except Fault as error: raise self._refuse_(file.name, "is not valid JSON") from error

    def _refuse_ ( self, label: str, why: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="translate.catalog", errors={ label[:WANTED]: [why] })

    def _gather_ ( self, base: Mapping[str, Texts], sources: Sources ) -> dict[str, Texts]:

        texts = { tag: dict(held) for tag, held in base.items() }

        for label, name, catalog in sources:

            tag = self._tag_(name) if isinstance(name, str) else None

            if tag is None: raise Fault(Code.INTERNAL, reason="translate.locale", errors={ label[:WANTED]: [UNTAGGED] })
            if not isinstance(catalog, Mapping): raise self._refuse_(label, "is not an object")

            heads: set[str] = set()
            fresh = self._flat_(catalog, heads, label, "", DEPTH)
            held  = texts.setdefault(tag, {})

            for head in heads: held.pop(head, None)

            held.update(fresh)

        return texts

    def _flat_ ( self, catalog: Mapping[Any, Any], heads: set[str], label: str, prefix: str, depth: int ) -> Texts:

        flat: Texts = {}

        for key, value in catalog.items():

            bad  = not isinstance(key, str) or not key
            name = f"{prefix}.{key}" if prefix else key

            if bad: raise self._refuse_(label, f"{prefix[:WANTED] or ROOT} has a bad key")
            if value is None: continue
            if isinstance(value, Mapping):

                if depth <= 1: raise self._refuse_(label, f"{name[:WANTED]} is nested too deep")

                heads.add(name)
                flat.update(self._flat_(value, heads, label, name, depth - 1))

                continue

            text = self._text_(value)

            if text is None: raise self._refuse_(label, f"{name[:WANTED]} is not a text")

            flat[name] = text

        return flat

    def _text_ ( self, value: object ) -> str | None:

        if isinstance(value, str): return value
        if isinstance(value, bool) or not isinstance(value, PLAIN): return None

        try: return str(value)
        except ValueError: return None

    def _seat_ ( self, texts: dict[str, Texts], fallback: str ) -> None:

        home = self._tag_(fallback)

        if home is None or home not in texts:

            raise Fault(Code.INTERNAL, reason="translate.fallback", errors={ "locale": [fallback[:WANTED]] })

        layers: dict[str, Layer] = {}
        kin: dict[str, str]      = {}

        for tag in sorted(texts):

            plurals = self._leaves_(texts[tag])

            for step in self._ladder_(tag)[1:]:

                for head, forms in layers[step][2].items() if step in layers else ():

                    if head in plurals: plurals[head] = self._whole_(plurals[head], forms)

            layers[tag] = (tag, texts[tag], plurals)

            kin.setdefault(tag.partition("-")[0], tag)

        tail = self._ladder_(home)

        self._chains     = { tag: self._line_(layers, (*self._ladder_(tag), *tail)) for tag in layers }
        self._texts      = texts
        self._fallback   = home
        self._locales    = tuple(sorted(layers))
        self._kin        = kin
        self._seen       = {}
        self._chosen     = {}
        self._generation += 1

    def _line_ ( self, layers: Mapping[str, Layer], steps: Iterable[str] ) -> Chain:

        return tuple(layers[step] for step in dict.fromkeys(steps) if step in layers)

    def _whole_ ( self, own: Forms, parent: Forms ) -> Forms:

        return { form: own[form] if form in own else parent[form] for form in FORMS if form in own or form in parent }

    def _leaves_ ( self, texts: Texts ) -> dict[str, Forms]:

        groups: dict[str, Forms] = {}
        below: dict[str, int]    = {}

        for key, text in texts.items():

            head, dot, last = key.rpartition(".")

            if dot and last in FORMS: groups.setdefault(head, {})[last] = text

            while dot:

                below[head]  = below.get(head, 0) + 1
                head, dot, _ = head.rpartition(".")

        return {
            head: { form: forms[form] for form in FORMS if form in forms }
            for head, forms in groups.items() if below[head] == len(forms) and head not in texts
        }
