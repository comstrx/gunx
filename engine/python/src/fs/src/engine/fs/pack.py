from collections.abc import Callable
from typing import Any

from engine.error import Code, Fault
from engine.string import string
from engine.thread import thread
from .arch import BROKEN, CHUNK, LEVELS, OPENERS, PACK_ITEMS, PACK_MAX, RATIO, SUFFIXES, TARS, Target
import pathlib, shutil, tarfile, zipfile

class Pack:

    async def archive ( self, target: Target, *sources: Target, root: Target | None = None ) -> pathlib.Path:

        goal  = pathlib.Path(target)
        base  = pathlib.Path(root) if root else None
        items = [pathlib.Path(source) for source in sources]
        mode  = next((mode for suffix, mode in TARS.items() if string.ends(goal.name.lower(), suffix)), None)

        if mode: return await self._run_(goal, self._clean_, goal, self._tar_, goal, items, base, mode)
        if goal.suffix.lower() != ".zip": raise self._refuse_("suffix", goal.name)

        return await self._run_(goal, self._clean_, goal, self._zip_, goal, items, base)

    async def extract ( self, archive: Target, into: Target, limit: int = PACK_MAX ) -> list[pathlib.Path]:

        source = pathlib.Path(archive)

        return await self._run_(source, self._open_, source, pathlib.Path(into), limit)

    async def names ( self, archive: Target ) -> list[str]:

        source = pathlib.Path(archive)

        def go () -> list[str]:

            if zipfile.is_zipfile(source):

                with zipfile.ZipFile(source) as packed:

                    return [item.filename for item in packed.infolist() if not item.is_dir()]

            with tarfile.open(source, "r:*") as bundle: return [member.name for member in bundle if member.isfile()]

        return await self._run_(source, go)

    async def compress (
        self, source: Target, target: Target | None = None, algorithm: str = "zstd", level: int | None = None,
    ) -> pathlib.Path:

        origin = pathlib.Path(source)
        opener = OPENERS.get(algorithm)

        if opener is None: raise Fault(Code.INTERNAL, reason="fs.algorithm", errors={ "algorithm": [algorithm] })

        goal    = pathlib.Path(target) if target else origin.with_name(origin.name + SUFFIXES[algorithm])
        options = {} if level is None else { LEVELS[algorithm]: level }

        def go () -> pathlib.Path:

            with origin.open("rb") as plain, opener(goal, "wb", **options) as packed:

                shutil.copyfileobj(plain, packed, CHUNK)

            return goal

        return await self._run_(origin, self._clean_, goal, go)

    async def decompress (
        self, source: Target, target: Target | None = None, limit: int = PACK_MAX,
    ) -> pathlib.Path:

        origin    = pathlib.Path(source)
        algorithm = next((name for name, suffix in SUFFIXES.items() if origin.suffix.lower() == suffix), None)

        if algorithm is None: raise self._refuse_("suffix", origin.name)

        goal = pathlib.Path(target) if target else origin.with_suffix("")

        def go () -> pathlib.Path:

            read = 0

            if not origin.stat().st_size: raise self._refuse_("archive", origin.name)

            with OPENERS[algorithm](origin, "rb") as packed, goal.open("wb") as plain:

                while piece := packed.read(CHUNK):

                    read += len(piece)

                    if read > limit: raise self._refuse_("bomb", origin.name)

                    plain.write(piece)

            return goal

        return await self._run_(origin, self._clean_, goal, go)

    async def _run_ [T] ( self, path: pathlib.Path, job: Callable[..., T], *args: Any ) -> T:

        try: return await thread.offload(job, *args)
        except FileNotFoundError as error:

            raise Fault(Code.NOT_FOUND, reason="fs.missing", errors={ "path": [path.name] }) from error

        except (*BROKEN, OSError) as error: raise self._refuse_("archive", path.name) from error

    def _clean_ [T] ( self, made: pathlib.Path, job: Callable[..., T], *args: Any ) -> T:

        made.parent.mkdir(parents=True, exist_ok=True)

        try: return job(*args)
        except BaseException:

            made.unlink(missing_ok=True)

            raise

    def _zip_ ( self, goal: pathlib.Path, items: list[pathlib.Path], base: pathlib.Path | None ) -> pathlib.Path:

        with zipfile.ZipFile(goal, "w", zipfile.ZIP_DEFLATED) as packed:

            for item in items:

                item.lstat()

                for file in sorted(item.rglob("*")) if item.is_dir() else [item]:

                    if file.is_file(): packed.write(file, file.relative_to(base or item.parent))

        return goal

    def _tar_ (
        self, goal: pathlib.Path, items: list[pathlib.Path], base: pathlib.Path | None, mode: str,
    ) -> pathlib.Path:

        with tarfile.open(goal, mode) as bundle:  # type: ignore[call-overload]

            for item in items: bundle.add(item, arcname=str(item.relative_to(base or item.parent)))

        return goal

    def _open_ ( self, source: pathlib.Path, into: pathlib.Path, limit: int ) -> list[pathlib.Path]:

        if not source.is_file(): raise FileNotFoundError(source)

        into.mkdir(parents=True, exist_ok=True)

        root = into.resolve()

        if zipfile.is_zipfile(source): return self._unzip_(source, root, limit)
        if tarfile.is_tarfile(source): return self._untar_(source, root, limit)

        raise self._refuse_("archive", source.name)

    def _unzip_ ( self, source: pathlib.Path, root: pathlib.Path, limit: int ) -> list[pathlib.Path]:

        made: list[pathlib.Path] = []

        with zipfile.ZipFile(source) as packed:

            items = packed.infolist()
            total = 0

            if len(items) > PACK_ITEMS: raise self._refuse_("bomb", source.name)

            for item in items:

                total += item.file_size

                inflated = item.compress_size and item.file_size / item.compress_size > RATIO

                if item.file_size > limit or total > limit or inflated: raise self._refuse_("bomb", item.filename)

                self._inside_(root, item.filename)

            for item in items:

                target = self._inside_(root, item.filename)

                if item.is_dir():

                    target.mkdir(parents=True, exist_ok=True)

                    continue

                target.parent.mkdir(parents=True, exist_ok=True)

                with packed.open(item) as plain, target.open("wb") as out: shutil.copyfileobj(plain, out, CHUNK)

                made.append(target)

        return made

    def _untar_ ( self, source: pathlib.Path, root: pathlib.Path, limit: int ) -> list[pathlib.Path]:

        names: list[str] = []

        with tarfile.open(source, "r:*") as bundle:

            total = 0

            for member in bundle:

                total += member.size

                if member.size > limit or total > limit or len(names) >= PACK_ITEMS:

                    raise self._refuse_("bomb", member.name)

                self._inside_(root, member.name)

                try: bundle.extract(member, root, filter="data")
                except tarfile.FilterError as error: raise self._refuse_("slip", member.name) from error

                names.append(member.name)

        return [root / name for name in names if (root / name).is_file()]

    def _inside_ ( self, root: pathlib.Path, name: str ) -> pathlib.Path:

        target = (root / name).resolve()

        if target != root and root not in target.parents: raise self._refuse_("slip", name)

        return target

    def _refuse_ ( self, reason: str, name: str ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Cannot unpack the archive", f"fs.{reason}", { "path": [name[:64]] })
