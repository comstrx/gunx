from collections.abc import Sequence

from engine.error import Code, Fault
from .arch import Representation

class Dash:

    @staticmethod
    def manifest (
        duration: float, representations: Sequence[Representation], segment: float = 4.0, timescale: int = 1000,
        start: int = 1,
    ) -> str:

        if not representations: raise Fault(Code.INTERNAL, reason="stream.variants")
        if duration <= 0 or segment <= 0: raise Fault(Code.INTERNAL, reason="stream.duration")

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static"',
            f'  mediaPresentationDuration="{Dash.clock(duration)}" minBufferTime="{Dash.clock(segment)}">',
            f'  <Period id="0" start="PT0S" duration="{Dash.clock(duration)}">',
            '    <AdaptationSet segmentAlignment="true" startWithSAP="1">',
        ]

        for item in representations:

            lines.append(
                f'      <Representation id="{item.id}" bandwidth="{item.bandwidth}" width="{item.width}" '
                f'height="{item.height}" codecs="{item.codecs}" mimeType="{item.mime}">',
            )
            lines.append(
                f'        <SegmentTemplate timescale="{timescale}" duration="{int(segment * timescale)}" '
                f'initialization="{item.init}" media="{item.media}" startNumber="{start}"/>',
            )
            lines.append("      </Representation>")

        lines += ["    </AdaptationSet>", "  </Period>", "</MPD>"]

        return "\n".join(lines) + "\n"

    @staticmethod
    def clock ( seconds: float ) -> str:

        hours, rest    = divmod(seconds, 3600)
        minutes, whole = divmod(rest, 60)

        return f"PT{int(hours)}H{int(minutes)}M{whole:.3f}S"
