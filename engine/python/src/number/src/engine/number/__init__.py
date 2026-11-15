from decimal import Decimal

lazy from .money import Money
from .number import Number

number = Number()

__all__ = ["Decimal", "Money", "Number", "number"]
