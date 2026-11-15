from msgspec import field

lazy from .arch import Member, Spec
lazy from .resource import Resource
from .rules import Rules
lazy from .shape import Shape
from .validator import Validator
lazy from .plan import Plan

rules = Rules()
validator = Validator()

__all__ = ["Member", "Plan", "Resource", "Rules", "Shape", "Spec", "Validator", "field", "rules", "validator"]
