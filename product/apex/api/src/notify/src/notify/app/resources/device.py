from ..models import Device
from ..utils.cycle import Resource

class DeviceResource(Resource[Device]):

    fields = ("id", "token", "platform")
