from msgspec import field

from .arch import Member
from .resource import Resource
from .rules import Rules
from .shape import Shape
from .validator import Validator, validator

rules = Rules()

__all__ = ["Member", "Resource", "Rules", "Shape", "Validator", "field", "rules", "validator"]
