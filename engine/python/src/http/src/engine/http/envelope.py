from typing import Any

from engine.context import context
from engine.error import Code, Fault
from engine.translate import translate
from .arch import KEPT, Meta, WORDS

class Envelope:

    @staticmethod
    def success (
        data: object = None, message: str | None = None, code: Code = Code.OK, meta: Meta | None = None,
    ) -> dict[str, Any]:

        facts = context.facts()
        found = facts.get("request_id")
        about: dict[str, Any] = { "request_id": str(found) if found else None }

        if meta: about.update(meta)
        if message is None: message = WORDS.get((str(facts.get("locale") or "en"), translate.generation(), code.value))

        return {
            "data"    : data,
            "message" : message or Envelope.word(code),
            "errors"  : None,
            "code"    : code.value,
            "reason"  : None,
            "meta"    : about,
        }

    @staticmethod
    def failure ( fault: Fault, meta: Meta | None = None ) -> dict[str, Any]:

        hidden = fault.server()

        return {
            "data"    : None,
            "message" : Envelope.word(fault.code) if hidden else Envelope.explain(fault),
            "errors"  : None if hidden else fault.errors,
            "code"    : fault.code.value,
            "reason"  : None if hidden else fault.reason,
            "meta"    : { "request_id": context.request_id(), **(meta or {}) },
        }

    @staticmethod
    def word ( code: Code ) -> str:

        key   = (context.locale(), translate.generation(), code.value)
        found = WORDS.get(key)

        if found is None:

            found = translate.find(code.value, section="codes") or code.message()

            if len(WORDS) < KEPT: WORDS[key] = found

        return found

    @staticmethod
    def explain ( fault: Fault ) -> str:

        worded = translate.reason(fault.reason) if fault.reason else None

        if worded: return worded
        if fault.message != fault.code.message(): return fault.message

        return Envelope.word(fault.code)
