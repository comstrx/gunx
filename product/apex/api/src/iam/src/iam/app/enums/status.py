from enum import StrEnum

class Status(StrEnum):

    ACTIVE    = "active"
    SUSPENDED = "suspended"
    DELETED   = "deleted"

class TenantStatus(StrEnum):

    ACTIVE    = "active"
    SUSPENDED = "suspended"
