from datetime import UTC, date as Day, datetime as DateTime, timedelta as TimeDelta

from .date import Date
lazy from .span import Span

date = Date()

__all__ = ["UTC", "Date", "DateTime", "Day", "Span", "TimeDelta", "date"]
