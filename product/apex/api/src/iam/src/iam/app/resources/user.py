from ..models import User
from ..utils.cycle import Resource

class UserResource(Resource[User]):

    fields = ("id", "email", "name", "roles", "status")
