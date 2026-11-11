from typing import ClassVar

from ..utils.cycle import Job

class Push(Job):

    name: ClassVar[str] = "notify.push"

    notice : str
    user   : str
