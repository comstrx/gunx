from engine.test import Bench
from engine.validate import Shape, rules, validator

bench = Bench()

class Signup(Shape):

    email : str
    name  : str
    age   : int = 18

payload = b'{"email": "a@b.co", "name": "Ann", "age": 30}'
spec    = { "email": "required|email", "name": "required|max:64", "age": "integer|between:18,99" }
mapping = { "email": "a@b.co", "name": "Ann", "age": 30 }

bench.measure("validate.shape", lambda: validator.shape(Signup, payload))
bench.measure("validate.rules", lambda: rules.check(mapping, spec))
