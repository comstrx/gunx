from types import FunctionType
from typing import Any, override
import functools

from jinja2 import nodes, pass_context, pass_eval_context
from jinja2.nodes import EvalContext
from jinja2.runtime import Context, markup_join, str_join
from jinja2.sandbox import ImmutableSandboxedEnvironment
from .arch import BAGS, BARRED, BITS, CONCAT, ELEMENT, Filter, FILTERS, GROWS, LEFT, LIGHT, METHODS, OUTPUT, SIZED
from .arch import Spent, TEXT, TICK, UNIT, VERDICTS
from .limits import CHECKS, Limits

class Sandbox(ImmutableSandboxedEnvironment):

    intercepted_binops = frozenset({ "+", "*", "**", "%" })
    output = OUTPUT

    def __init__ ( self, *args: Any, **kwargs: Any ) -> None:

        super().__init__(*args, **kwargs)

        self.verdicts: dict[tuple[type, str], bool] = {}

    def guard ( self ) -> None:

        self.globals.pop("lipsum", None)
        self.filters.update(FILTERS)

        for name, job in list(self.filters.items()): self.filters[name] = self.weighed(name, job)

        self.globals["range"] = self.span
        self.filters[TICK]    = self.tick
        self.filters[SIZED]   = self.sized
        self.filters[CONCAT]  = self.glued

    def weighed ( self, name: str, job: Filter ) -> Filter:

        check, sized = CHECKS.get(name), self.sized
        skip = 0 if getattr(job, "jinja_pass_arg", None) is None else 1

        @functools.wraps(job)
        def plain ( *args: Any, **kwargs: Any ) -> Any:

            return sized(job(*args, **kwargs))

        @functools.wraps(job)
        def checked ( *args: Any, **kwargs: Any ) -> Any:

            if check is not None and check(args[skip:], kwargs) > self.output: raise Spent("size")

            return sized(job(*args, **kwargs))

        return plain if check is None else checked

    def spend ( self, steps: int ) -> None:

        left = LEFT.get()

        if left is None: return

        left[0] -= steps

        if left[0] < 0: raise Spent("steps")

    def sized ( self, made: Any ) -> Any:

        if isinstance(made, TEXT): units = len(made)
        elif type(made) in LIGHT: return made
        elif isinstance(made, BAGS): units = len(made) * ELEMENT
        else: return made

        if units < UNIT: return made
        if units > self.output: raise Spent("size")

        self.spend(units // UNIT)

        return made

    @pass_context
    def tick ( self, _: Context, value: int ) -> int:

        left = LEFT.get()

        if left is None: return value

        left[0] -= 1

        if left[0] < 0: raise Spent("steps")

        return value

    @pass_eval_context
    def glued ( self, mood: EvalContext, items: list[Any] ) -> Any:

        return self.sized(markup_join(items) if mood.autoescape else str_join(items))

    def span ( self, *bounds: int ) -> range:

        made = range(*bounds)

        try: self.spend(len(made))
        except OverflowError as error: raise Spent("steps") from error

        return made

    @override
    def is_safe_attribute ( self, obj: Any, attr: str, value: Any ) -> bool:

        kind  = type(obj)
        known = self.verdicts.get((kind, attr))

        if known is not None: return known

        safe = not (attr in BARRED and isinstance(obj, TEXT)) and super().is_safe_attribute(obj, attr, value)

        if kind is obj.__class__ and len(self.verdicts) < VERDICTS: self.verdicts[kind, attr] = safe

        return safe

    @override
    def call ( self, context: Context, callee: Any, /, *args: Any, **kwargs: Any ) -> Any:

        name = getattr(callee, "__name__", None)

        if type(name) is str and name in GROWS: self.grown(callee, name, args, kwargs)

        return self.sized(super().call(context, callee, *args, **kwargs))

    def grown ( self, callee: Any, name: str, args: tuple[Any, ...], kwargs: dict[str, Any] ) -> None:

        inner = getattr(callee, "__wrapped__", callee) if type(callee) is FunctionType else callee
        owner = getattr(inner, "__self__", None) if type(inner) in METHODS else None

        if isinstance(owner, TEXT) and Limits.method(owner, name, args, kwargs) > self.output: raise Spent("size")

    @override
    def call_binop ( self, context: Context, operator: str, left: Any, right: Any ) -> Any:

        if operator == "+": return self.sized(left + right)
        if operator == "%": return self.sized(self.styled(left, right))

        whole = isinstance(left, int) and isinstance(right, int)

        if operator == "**":

            if whole and right > 1 and left.bit_length() * right > BITS: raise Spent("number")

            return left ** right

        if whole and left.bit_length() + right.bit_length() > BITS: raise Spent("number")
        if not whole and self.repeated(left, right) > self.output: raise Spent("size")

        return self.sized(left * right)

    def styled ( self, left: Any, right: Any ) -> Any:

        if isinstance(left, TEXT):

            text = left if isinstance(left, str) else left.decode("latin-1")

            if Limits.wide(text, right) > self.output: raise Spent("size")

        return left % right

    def repeated ( self, left: Any, right: Any ) -> int:

        for many, times in ((left, right), (right, left)):

            if not isinstance(times, int): continue
            if isinstance(many, TEXT): return len(many) * times
            if isinstance(many, list | tuple): return len(many) * times * ELEMENT

        return 0

    @override
    def _generate (
        self, source: nodes.Template, name: str | None, filename: str | None, defer_init: bool = False,
    ) -> str:

        for node in list(source.find_all(nodes.Node)): self.marked(node)

        self.marked(source)

        return super()._generate(source, name, filename, defer_init)

    def marked ( self, node: nodes.Node ) -> None:

        at = node.lineno

        if isinstance(node, nodes.For):

            mark = nodes.Filter(nodes.Const(1), TICK, [], [], None, None, lineno=at)

            if node.test is None: node.body.insert(0, nodes.ExprStmt(mark, lineno=at))
            else: node.test = nodes.And(mark, node.test, lineno=at)

        if isinstance(node, nodes.AssignBlock) and node.filter is None:

            node.filter = nodes.Filter(None, SIZED, [], [], None, None, lineno=at)

        for field, value in node.iter_fields():

            if isinstance(value, list): value[:] = [self.swapped(item) for item in value]
            else: setattr(node, field, self.swapped(value))

    def swapped ( self, item: Any ) -> Any:

        if isinstance(item, nodes.Concat):

            parts = nodes.List(item.nodes, lineno=item.lineno)

            return nodes.Filter(parts, CONCAT, [], [], None, None, lineno=item.lineno)

        if isinstance(item, nodes.Getitem) and isinstance(item.arg, nodes.Slice):

            return nodes.Filter(item, SIZED, [], [], None, None, lineno=item.lineno)

        return item
