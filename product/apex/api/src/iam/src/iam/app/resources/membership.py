from ..models import Membership
from ..utils.cycle import Resource

class MembershipResource(Resource[Membership]):

    fields = ("tenant_id", "roles")
