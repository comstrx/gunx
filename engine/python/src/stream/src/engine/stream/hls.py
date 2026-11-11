from collections.abc import Sequence

from engine.error import Code, Fault
from .arch import Segment, Variant
import math

class Hls:

    @staticmethod
    def media (
        segments: Sequence[Segment], sequence: int = 0, live: bool = False, version: int = 3, init: str | None = None,
        target: int | None = None,
    ) -> str:

        if not segments: raise Fault(Code.INTERNAL, reason="stream.segments")

        longest = target or math.ceil(max(segment.duration for segment in segments))
        lines   = ["#EXTM3U", f"#EXT-X-VERSION:{version}", f"#EXT-X-TARGETDURATION:{longest}"]

        lines.append(f"#EXT-X-MEDIA-SEQUENCE:{sequence}")

        if not live: lines.append("#EXT-X-PLAYLIST-TYPE:VOD")
        if init: lines.append(f'#EXT-X-MAP:URI="{init}"')

        for segment in segments:

            if segment.discontinuity: lines.append("#EXT-X-DISCONTINUITY")
            if segment.byterange: lines.append(f"#EXT-X-BYTERANGE:{segment.byterange[0]}@{segment.byterange[1]}")

            lines.append(f"#EXTINF:{segment.duration:.3f},")
            lines.append(segment.uri)

        if not live: lines.append("#EXT-X-ENDLIST")

        return "\n".join(lines) + "\n"

    @staticmethod
    def master ( variants: Sequence[Variant], version: int = 3 ) -> str:

        if not variants: raise Fault(Code.INTERNAL, reason="stream.variants")

        lines = ["#EXTM3U", f"#EXT-X-VERSION:{version}"]

        for variant in sorted(variants, key=lambda item: item.bandwidth):

            facts = [f"BANDWIDTH={variant.bandwidth}"]

            if variant.resolution: facts.append(f"RESOLUTION={variant.resolution}")
            if variant.frame_rate: facts.append(f"FRAME-RATE={variant.frame_rate:.3f}")
            if variant.codecs: facts.append(f'CODECS="{variant.codecs}"')

            lines.append(f"#EXT-X-STREAM-INF:{','.join(facts)}")
            lines.append(variant.uri)

        return "\n".join(lines) + "\n"

    @staticmethod
    def window ( segments: Sequence[Segment], keep: int ) -> tuple[list[Segment], int]:

        if keep < 1: raise Fault(Code.INTERNAL, reason="stream.window")

        dropped = max(0, len(segments) - keep)

        return list(segments[dropped:]), dropped
