from decimal import Decimal

from engine.error import Code, Fault
from .arch import (
    DIGITS, Facts, FORMS, Homes, KEPT, OTHER, PLURALS, Rule, SLOTS, SPAN, Span, TAG, Term, TERM, Test, WANTED, WHOLE,
)

class Plural:

    def __init__ ( self ) -> None:

        self._homes: Homes           = { tag: rules for tags, rules in PLURALS.items() for tag in tags.split() }
        self._rules: dict[int, Rule] = {}
        self._found: dict[str, Rule] = {}

    def form ( self, locale: str, count: object ) -> str:

        rule = self._found.get(locale) or self._rule_(locale)

        if type(count) is int:

            whole = -count if count < 0 else count

            return rule[1][whole] if whole < SPAN else self._judge_(rule, (whole, whole, 0, 0, 0, 0, 0, 0))

        facts = self._facts_(count)

        return OTHER if facts is None else self._judge_(rule, facts)

    def forms ( self, locale: str ) -> tuple[str, ...]:

        return (self._found.get(locale) or self._rule_(locale))[2]

    def _rule_ ( self, locale: str ) -> Rule:

        home = self._home_(locale)
        rule = WHOLE if home is None else self._rules.get(id(home))

        if rule is None and home is not None:

            rule = self._compile_(home)

            self._rules[id(home)] = rule

        found = rule or WHOLE

        if len(locale) <= WANTED:

            if len(self._found) >= KEPT: self._found.clear()

            self._found[locale] = found

        return found

    def _home_ ( self, locale: str ) -> dict[str, str] | None:

        found = TAG.fullmatch(locale)

        if found is None: return None

        language = found["language"].lower()
        region   = found["region"]
        home     = self._homes.get(f"{language}-{region.upper()}") if region else None

        return home or self._homes.get(language)

    def _compile_ ( self, rules: dict[str, str] ) -> Rule:

        tests = tuple((form, self._test_(rules[form])) for form in FORMS if form in rules)
        table = tuple(self._judge_((tests, (), ()), (whole, whole, 0, 0, 0, 0, 0, 0)) for whole in range(SPAN))

        return (tests, table, (*(form for form, _ in tests), OTHER))

    def _test_ ( self, text: str ) -> Test:

        return tuple(tuple(self._term_(part) for part in side.split(" and ")) for side in text.split(" or "))

    def _term_ ( self, text: str ) -> Term:

        found = TERM.fullmatch(text)

        if found is None: raise Fault(Code.INTERNAL, reason="translate.plural", errors={ "rule": [text] })

        spans = tuple(self._span_(piece) for piece in found["spans"].split(","))

        return (SLOTS.index(found["slot"]), int(found["base"] or 0), found["wanted"] is None, spans)

    def _span_ ( self, text: str ) -> Span:

        low, _, high = text.partition("..")

        return (int(low), int(high or low))

    def _judge_ ( self, rule: Rule, facts: Facts ) -> str:

        holds = self._holds_

        for form, test in rule[0]:

            for terms in test:

                for term in terms:

                    if not holds(term, facts): break

                else: return form

        return OTHER

    def _holds_ ( self, term: Term, facts: Facts ) -> bool:

        slot, base, wanted, spans = term
        value = facts[slot]

        if value is None: return not wanted
        if base: value %= base

        for low, high in spans:

            if low <= value <= high: return wanted

        return not wanted

    def _facts_ ( self, count: object ) -> Facts | None:

        if isinstance(count, bool) or not isinstance(count, int | float | Decimal): return None
        if isinstance(count, int): return (abs(count), abs(count), 0, 0, 0, 0, 0, 0)
        if isinstance(count, Decimal): return self._exact_(count)
        if count.is_integer(): return (abs(int(count)), abs(int(count)), 0, 0, 0, 0, 0, 0)

        return self._exact_(Decimal(repr(count)))

    def _exact_ ( self, count: Decimal ) -> Facts | None:

        _, digits, exponent = count.as_tuple()

        if not isinstance(exponent, int) or len(digits) + abs(exponent) > DIGITS: return None

        scaled = int("".join(map(str, digits)))

        if exponent >= 0: return (scaled * 10 ** exponent, scaled * 10 ** exponent, 0, 0, 0, 0, 0, 0)

        shown          = -exponent
        whole, part    = divmod(scaled, 10 ** shown)
        trimmed, kept  = part, shown

        while kept and trimmed % 10 == 0: trimmed, kept = trimmed // 10, kept - 1

        return (None if part else whole, whole, shown, kept, part, trimmed, 0, 0)
