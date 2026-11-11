from collections.abc import Sequence
from typing import Any

from engine.token import Pair

from ..models import Membership, User
from ..utils.cycle import Resource
from .membership import MembershipResource
from .user import UserResource

class SessionResource(Resource[User]):

    @classmethod
    def started (
        cls, user: User, pair: Pair, memberships: Sequence[Membership], tenant: str | None,
    ) -> dict[str, Any]:

        held = MembershipResource.many(memberships)

        return { "user": UserResource.one(user), "tenant": tenant, "memberships": held, **pair.dump() }

    @classmethod
    def me ( cls, user: User, memberships: Sequence[Membership], tenant: str | None ) -> dict[str, Any]:

        return { **UserResource.one(user), "tenant": tenant, "memberships": MembershipResource.many(memberships) }
