from dataclasses import dataclass, field
from typing import Any

from engine.ai import Reply

LIMIT    = 50
FUSION   = 60
PROMPT   = (
    "Answer only from the numbered sources. Cite each fact as [n]. If the sources do not contain the answer, say so."
)

@dataclass(frozen=True, slots=True)
class Chunk:

    scope   : str
    source  : str
    index   : int
    text    : str
    facts   : dict[str, Any] = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class Hit:

    source : str
    index  : int
    text   : str
    score  : float
    facts  : dict[str, Any] = field(default_factory=dict)

    def dump ( self ) -> dict[str, Any]:

        return {
            "source": self.source, "index": self.index, "text": self.text, "score": round(self.score, 4),
            "facts": self.facts,
        }

@dataclass(frozen=True, slots=True)
class Answer:

    text  : str
    hits  : tuple[Hit, ...]
    reply : Reply

    def dump ( self ) -> dict[str, Any]:

        return { "text": self.text, "hits": [hit.dump() for hit in self.hits], "model": self.reply.model }
