from msgspec import field

lazy from .arch import Member, Spec
lazy from .resource import Resource
from .rules import Rules
lazy from .shape import Shape
from .validator import Validator, validator

rules = Rules()

__all__ = ["Member", "Resource", "Rules", "Shape", "Spec", "Validator", "field", "rules", "validator"]
