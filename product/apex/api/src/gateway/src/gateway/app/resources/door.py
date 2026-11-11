from ..models import Door
from ..utils.cycle import Resource

class DoorResource(Resource[Door]):

    fields = ("id", "method", "path", "service", "audience", "scope", "policy")
