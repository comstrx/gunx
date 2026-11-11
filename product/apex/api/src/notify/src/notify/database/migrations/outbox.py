from engine.database import Outbox

outbox = Outbox.blueprint("notify_outbox")
