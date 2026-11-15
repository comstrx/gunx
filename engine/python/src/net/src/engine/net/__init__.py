lazy from .arch import Reply
lazy from .egress import Egress
from .net import Net
lazy from .remote import Remote

net = Net()

__all__ = ["Egress", "Net", "Remote", "Reply", "net"]
