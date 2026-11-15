from .arch import SPAN_ZERO, TRACE_ZERO, TRACEPARENT

class Trace:

    @staticmethod
    def clean ( value: object ) -> str | None:

        if type(value) is not str: return None

        found = TRACEPARENT.fullmatch(value)

        if found is None or found[1] == TRACE_ZERO or found[2] == SPAN_ZERO: return None

        return value
