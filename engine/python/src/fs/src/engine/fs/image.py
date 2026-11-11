from collections.abc import Sequence
from io import BytesIO
from typing import Any

from engine.error import Code, Fault
from engine.thread import thread
from PIL import Image as Pil, ImageOps, UnidentifiedImageError
from .arch import ALIASES, BEST, FORMATS, MAX_READ, MEDIA, OPAQUE, Picture, PIXELS, QUALITY, SIGNS, SWATCH, Target
from .file import File

class Image:

    def __init__ ( self, file: File ) -> None:

        self._file    = file
        self._pixels  = PIXELS
        self._formats = FORMATS
        self._quality = QUALITY
        self._decoded = 0
        self._encoded = 0

    def setup ( self, pixels: int = PIXELS, formats: Sequence[str] = tuple(FORMATS), quality: int = QUALITY ) -> None:

        if pixels < 1 or not 1 <= quality <= BEST: raise Fault(Code.INTERNAL, reason="image.setup")

        self._pixels  = pixels
        self._formats = frozenset(name.lower() for name in formats)
        self._quality = quality

    def formats ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._formats))

    def known ( self, format_: str ) -> str:

        name = ALIASES.get(format_.lower(), format_.lower())

        if name not in self._formats:

            raise Fault(Code.UNSUPPORTED_MEDIA, reason="image.format", errors={ "format": [name or "unknown"] })

        return name

    def media ( self, format_: str ) -> str:

        name = ALIASES.get(format_.lower(), format_.lower())

        return MEDIA.get(name, f"image/{name}")

    def sniff ( self, data: bytes ) -> str | None:

        head = bytes(data[:16])

        for magic, name in SIGNS:

            if head.startswith(magic): return name

        if head[:4] == b"RIFF" and head[8:12] == b"WEBP": return "webp"
        if head[4:12] in (b"ftypavif", b"ftypavis"): return "avif"

        return None

    async def decode ( self, data: bytes ) -> Picture:

        made = await thread.offload(self._decode_, bytes(data))

        self._decoded += 1

        return made

    async def encode (
        self, picture: Picture, format_: str = "webp", quality: int | None = None, lossless: bool = False,
    ) -> bytes:

        name = self.known(format_)
        made = await thread.offload(self._encode_, picture.raw, name, quality or self._quality, lossless)

        self._encoded += 1

        return made

    async def read ( self, target: Target, limit: int = MAX_READ ) -> Picture:

        return await self.decode(await self._file.read(target, limit))

    async def write (
        self, target: Target, picture: Picture, format_: str | None = None, quality: int | None = None,
    ) -> int:

        return await self._file.write(target, await self.encode(picture, format_ or self._file.ext(target), quality))

    async def convert ( self, data: bytes, format_: str = "webp", quality: int | None = None ) -> bytes:

        return await self.encode(await self.decode(data), format_, quality)

    async def resize ( self, picture: Picture, width: int | None = None, height: int | None = None ) -> Picture:

        if width is None and height is None: raise Fault(Code.INTERNAL, reason="image.size")

        ratio  = picture.width / picture.height
        target = (
            width or max(1, round((height or 1) * ratio)),
            height or max(1, round((width or 1) / ratio)),
        )

        return Picture(await thread.offload(picture.raw.resize, target, Pil.Resampling.LANCZOS), picture.format)

    async def fit ( self, picture: Picture, width: int, height: int ) -> Picture:

        raw = await thread.offload(ImageOps.contain, picture.raw, (width, height), Pil.Resampling.LANCZOS)

        return Picture(raw, picture.format)

    async def cover ( self, picture: Picture, width: int, height: int ) -> Picture:

        raw = await thread.offload(ImageOps.fit, picture.raw, (width, height), Pil.Resampling.LANCZOS)

        return Picture(raw, picture.format)

    async def crop ( self, picture: Picture, left: int, top: int, width: int, height: int ) -> Picture:

        right, bottom = min(picture.width, left + width), min(picture.height, top + height)

        if left < 0 or top < 0 or right <= left or bottom <= top: raise Fault(Code.INTERNAL, reason="image.size")

        return Picture(await thread.offload(picture.raw.crop, (left, top, right, bottom)), picture.format)

    async def rotate ( self, picture: Picture, degrees: float ) -> Picture:

        turned = await thread.offload(picture.raw.rotate, -degrees, Pil.Resampling.BICUBIC, expand=True)

        return Picture(turned, picture.format)

    async def flip ( self, picture: Picture, vertical: bool = False ) -> Picture:

        turn = ImageOps.flip if vertical else ImageOps.mirror

        return Picture(await thread.offload(turn, picture.raw), picture.format)

    async def thumbnail ( self, data: bytes, size: int = 256, format_: str = "webp" ) -> bytes:

        picture = await self.decode(data)

        return await self.encode(await self.fit(picture, size, size), format_)

    async def variants (
        self, data: bytes, widths: Sequence[int] = (320, 640, 1280), format_: str = "webp",
    ) -> dict[int, bytes]:

        picture = await self.decode(data)
        made: dict[int, bytes] = {}

        for width in sorted(set(widths)):

            if width >= picture.width:

                made[picture.width] = await self.encode(picture, format_)

                break

            made[width] = await self.encode(await self.resize(picture, width=width), format_)

        return made

    async def dominant ( self, picture: Picture, count: int = 3 ) -> list[str]:

        return await thread.offload(self._dominant_, picture.raw, max(1, min(count, SWATCH)))

    def stats ( self ) -> dict[str, int]:

        return { "decoded": self._decoded, "encoded": self._encoded }

    def describe ( self ) -> dict[str, Any]:

        return { "pixels": self._pixels, "quality": self._quality, "formats": list(self.formats()), **self.stats() }

    def _decode_ ( self, data: bytes ) -> Picture:

        try:

            raw  = Pil.open(BytesIO(data))
            name = self.known(str(raw.format or ""))

            if raw.width * raw.height > self._pixels:

                raise Fault(Code.TOO_LARGE, reason="image.pixels", errors={ "pixels": [str(raw.width * raw.height)] })

            raw.load()

            upright = ImageOps.exif_transpose(raw)
            clean   = Pil.new(upright.mode, upright.size)

            clean.paste(upright)

            if upright.mode == "P": clean.putpalette(upright.getpalette() or [])
            if "transparency" in upright.info: clean.info["transparency"] = upright.info["transparency"]

        except (UnidentifiedImageError, OSError, ValueError, Pil.DecompressionBombError) as error:

            raise Fault(Code.UNSUPPORTED_MEDIA, reason="image.decode") from error

        return Picture(clean, name)

    def _encode_ ( self, raw: Pil.Image, name: str, quality: int, lossless: bool ) -> bytes:

        out   = BytesIO()
        image = raw

        if name in OPAQUE and image.mode not in ("RGB", "L"): image = image.convert("RGB")
        if name == "gif" and image.mode not in ("P", "L"): image = image.convert("P", palette=Pil.Palette.ADAPTIVE)

        options: dict[str, Any] = { "quality": quality }

        if name == "png": options = { "optimize": True }
        if name == "jpeg": options["optimize"] = True
        if name == "webp": options["lossless"] = lossless
        if name == "gif": options = {}

        image.save(out, format=name.upper(), **options)

        return out.getvalue()

    def _dominant_ ( self, raw: Pil.Image, count: int ) -> list[str]:

        small = raw.convert("RGB").resize((64, 64), Pil.Resampling.BILINEAR)
        found = small.quantize(colors=count, method=Pil.Quantize.FASTOCTREE)
        tally = found.getcolors() or []
        shade = found.getpalette() or []

        ordered = sorted(tally, key=lambda pair: -pair[0])[:count]
        picked  = [int(index) if isinstance(index, int) else 0 for _, index in ordered]

        return [f"#{shade[i * 3]:02x}{shade[i * 3 + 1]:02x}{shade[i * 3 + 2]:02x}" for i in picked]
