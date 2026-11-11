from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime as DateTime
from typing import Any

from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.string import string
from engine.thread import thread
from .arch import ACCESS, BACKUP, CHUNK, Info, LOCK_TICK, MODE_FILE, NAME_MAX, STAMP, Target, UNSAFE
import fcntl, glob, mimetypes, os, pathlib, shutil, tempfile

class Path:

    _only = ""

    def join ( self, *parts: Target ) -> pathlib.Path:

        return pathlib.Path(*parts)

    def fix ( self, target: Target ) -> pathlib.Path:

        return pathlib.Path(os.path.normpath(pathlib.Path(os.path.expandvars(target)).expanduser().absolute()))

    def name ( self, target: Target ) -> str:

        return pathlib.Path(target).name

    def stem ( self, target: Target ) -> str:

        return pathlib.Path(target).stem

    def ext ( self, target: Target ) -> str:

        return string.chop_start(pathlib.Path(target).suffix.lower(), ".")

    def parent ( self, target: Target ) -> pathlib.Path:

        return pathlib.Path(target).parent

    def parts ( self, target: Target ) -> tuple[str, ...]:

        return pathlib.Path(target).parts

    def depth ( self, target: Target ) -> int:

        path = pathlib.Path(target)

        return len(path.parts) - (1 if path.anchor else 0)

    def ancestors ( self, target: Target ) -> list[pathlib.Path]:

        return list(pathlib.Path(target).parents)

    def common ( self, *targets: Target ) -> pathlib.Path | None:

        try: return pathlib.Path(os.path.commonpath([self.fix(target) for target in targets]))
        except ValueError: return None

    def rel ( self, target: Target, base: Target ) -> pathlib.Path:

        path, root = self.fix(target), self.fix(base)

        if path != root and root not in path.parents: raise self._escape_(target)

        return path.relative_to(root)

    def set_name ( self, target: Target, name: str ) -> pathlib.Path:

        return pathlib.Path(target).with_name(name)

    def set_stem ( self, target: Target, stem: str ) -> pathlib.Path:

        return pathlib.Path(target).with_stem(stem)

    def set_ext ( self, target: Target, ext: str ) -> pathlib.Path:

        return pathlib.Path(target).with_suffix(string.start(ext, ".") if ext else "")

    def is_abs ( self, target: Target ) -> bool:

        return pathlib.Path(target).is_absolute()

    def is_root ( self, target: Target ) -> bool:

        path = pathlib.Path(target)

        return bool(path.anchor) and path == pathlib.Path(path.anchor)

    def is_hidden ( self, target: Target ) -> bool:

        return pathlib.Path(target).name.startswith(".")

    def is_under ( self, target: Target, base: Target ) -> bool:

        path, root = self.fix(target), self.fix(base)

        return path == root or root in path.parents

    def is_safe ( self, name: str ) -> bool:

        return name not in UNSAFE and len(name) <= NAME_MAX and name == self.safe(name)

    def has_ext ( self, target: Target, *exts: str ) -> bool:

        return self.ext(target) in { string.chop_start(ext.lower(), ".") for ext in exts }

    def match ( self, target: Target, pattern: str ) -> bool:

        return string.glob(pathlib.Path(target).name.lower(), pattern.lower())

    def safe ( self, name: str, limit: int = NAME_MAX ) -> str:

        kept = string.keep(pathlib.Path(name).name, "._-", "_")[:limit]

        return string.trim(kept, "._") or "file"

    def mime ( self, target: Target ) -> str:

        return mimetypes.guess_type(str(target))[0] or "application/octet-stream"

    def posix ( self, target: Target ) -> str:

        return pathlib.Path(target).as_posix()

    def home ( self ) -> pathlib.Path:

        return pathlib.Path.home()

    def cwd ( self ) -> pathlib.Path:

        return pathlib.Path.cwd()

    def temp_root ( self ) -> pathlib.Path:

        return pathlib.Path(tempfile.gettempdir())

    async def has ( self, target: Target ) -> bool:

        path = pathlib.Path(target)

        return await thread.offload(lambda: self._fits_(path) if self._only else os.path.lexists(path))

    async def kind ( self, target: Target ) -> str:

        return await thread.offload(self._kind_, pathlib.Path(target))

    async def is_file ( self, target: Target ) -> bool:

        return await thread.offload(pathlib.Path(target).is_file)

    async def is_dir ( self, target: Target ) -> bool:

        return await thread.offload(pathlib.Path(target).is_dir)

    async def is_link ( self, target: Target ) -> bool:

        return await thread.offload(pathlib.Path(target).is_symlink)

    async def get ( self, target: Target ) -> Info:

        path = pathlib.Path(target)

        def go () -> Info:

            found = self._need_(path).lstat()

            return Info(
                path, self._kind_(path), found.st_size, found.st_mode, found.st_uid, found.st_gid, found.st_ino,
                found.st_nlink, date.of(found.st_mtime), date.of(found.st_ctime), date.of(found.st_atime),
            )

        return await self._run_(path, go)

    async def set (
        self, target: Target, mode: int | None = None, modified: DateTime | None = None,
        accessed: DateTime | None = None,
    ) -> pathlib.Path:

        path = pathlib.Path(target)

        def go () -> pathlib.Path:

            found = self._need_(path).stat()

            if mode is not None: path.chmod(mode)

            if modified is not None or accessed is not None:

                os.utime(path, (
                    accessed.timestamp() if accessed else found.st_atime,
                    modified.timestamp() if modified else found.st_mtime,
                ))

            return path

        return await self._run_(path, go)

    async def size ( self, target: Target ) -> int:

        path = pathlib.Path(target)

        def go () -> int:

            found = self._need_(path).stat()

            if not path.is_dir(): return found.st_size

            return sum(item.stat().st_size for item in self._files_(path))

        return await self._run_(path, go)

    async def modified ( self, target: Target ) -> DateTime:

        path = pathlib.Path(target)

        return date.of(await self._run_(path, lambda: self._need_(path).stat().st_mtime))

    async def age ( self, target: Target ) -> float:

        path = pathlib.Path(target)

        return max(0.0, date.stamp() - await self._run_(path, lambda: self._need_(path).stat().st_mtime))

    async def changed ( self, target: Target, since: DateTime ) -> bool:

        path = pathlib.Path(target)

        return await self._run_(path, lambda: self._need_(path).stat().st_mtime) > since.timestamp()

    async def can ( self, target: Target, mode: str = "r" ) -> bool:

        path   = pathlib.Path(target)
        wanted = sum(ACCESS.get(char, 0) for char in mode) or os.F_OK

        return await thread.offload(lambda: self._fits_(path) and os.access(path, wanted))

    async def same ( self, left: Target, right: Target ) -> bool:

        try: return await thread.offload(os.path.samefile, left, right)
        except (OSError, ValueError): return False

    async def which ( self, name: str ) -> pathlib.Path | None:

        found = await thread.offload(shutil.which, name)

        return pathlib.Path(found) if found else None

    async def resolve ( self, target: Target ) -> pathlib.Path:

        path = pathlib.Path(target)

        return await self._run_(path, path.resolve)

    async def under ( self, base: Target, relative: Target ) -> pathlib.Path:

        root = pathlib.Path(base)

        return await self._run_(root, self._under_, root, relative)

    async def inside ( self, base: Target, relative: Target ) -> bool:

        try: await self.under(base, relative)
        except Fault: return False

        return True

    async def disk ( self, target: Target ) -> dict[str, int]:

        path  = pathlib.Path(target)
        usage = await self._run_(path, shutil.disk_usage, path)

        percent = round(usage.used * 100 / usage.total) if usage.total else 0

        return { "total": usage.total, "used": usage.used, "free": usage.free, "percent": percent }

    async def move ( self, source: Target, target: Target ) -> pathlib.Path:

        origin, goal = pathlib.Path(source), pathlib.Path(target)

        def go () -> pathlib.Path:

            self._need_(origin)
            goal.parent.mkdir(parents=True, exist_ok=True)

            return pathlib.Path(shutil.move(str(origin), str(goal)))

        return await self._run_(origin, go)

    async def rename ( self, target: Target, name: str ) -> pathlib.Path:

        if not self.is_safe(name): raise self._escape_(name)

        return await self.move(target, pathlib.Path(target).with_name(name))

    async def copy ( self, source: Target, target: Target ) -> pathlib.Path:

        origin, goal = pathlib.Path(source), pathlib.Path(target)

        def go () -> pathlib.Path:

            self._need_(origin)
            goal.parent.mkdir(parents=True, exist_ok=True)

            if origin.is_dir(): return pathlib.Path(shutil.copytree(origin, goal, dirs_exist_ok=True))

            return pathlib.Path(shutil.copy2(origin, goal))

        return await self._run_(origin, go)

    async def remove ( self, target: Target ) -> bool:

        path = pathlib.Path(target)

        def go () -> bool:

            if not os.path.lexists(self._need_(path)): return False

            if path.is_dir() and not path.is_symlink(): shutil.rmtree(path)
            else: path.unlink()

            return True

        return await self._run_(path, go)

    async def link ( self, source: Target, target: Target, hard: bool = False ) -> pathlib.Path:

        origin, goal = pathlib.Path(source), pathlib.Path(target)

        def go () -> pathlib.Path:

            self._need_(origin)
            goal.parent.mkdir(parents=True, exist_ok=True)

            if hard: goal.hardlink_to(origin)
            else: goal.symlink_to(origin, origin.is_dir())

            return goal

        return await self._run_(origin, go)

    async def readlink ( self, target: Target ) -> pathlib.Path:

        path = pathlib.Path(target)

        return await self._run_(path, path.readlink)

    async def hash ( self, target: Target, algorithm: str = "blake3" ) -> str:

        path = pathlib.Path(target)

        def go () -> str:

            total = crypto.hasher(algorithm)
            files = self._files_(path) if self._need_(path).is_dir() else [path]

            for item in files:

                if item != path: total.update(item.relative_to(path).as_posix().encode() + b"\0")

                with item.open("rb") as handle:

                    while piece := handle.read(CHUNK): total.update(piece)

            return str(total.hexdigest())

        return await self._run_(path, go)

    async def backup ( self, target: Target, folder: Target | None = None ) -> pathlib.Path:

        path  = pathlib.Path(target)
        stamp = date.format(date.now(), STAMP)

        return await self.copy(path, pathlib.Path(folder or path.parent) / f"{path.stem}.{stamp}{path.suffix}")

    async def restore ( self, target: Target, folder: Target | None = None ) -> pathlib.Path:

        path  = pathlib.Path(target)
        store = pathlib.Path(folder or path.parent)

        def go () -> pathlib.Path:

            kept = max(store.glob(f"{glob.escape(path.stem)}.{BACKUP}{glob.escape(path.suffix)}"), default=None)

            if kept is None: raise FileNotFoundError(path)

            if self._need_(kept).is_dir():

                shutil.rmtree(path, ignore_errors=True)
                shutil.copytree(kept, path)

            else: shutil.copy2(kept, path)

            return kept

        return await self._run_(path, go)

    async def temp (
        self, suffix: str = "", prefix: str = "engine-", near: Target | None = None, folder: bool | None = None,
    ) -> pathlib.Path:

        wide = self._only == "dir" if folder is None else folder

        def go () -> pathlib.Path:

            if wide: return pathlib.Path(tempfile.mkdtemp(suffix=suffix, prefix=prefix, dir=near))

            handle, name = tempfile.mkstemp(suffix=suffix, prefix=prefix, dir=near)

            os.close(handle)

            return pathlib.Path(name)

        return await self._run_(pathlib.Path(near or tempfile.gettempdir()), go)

    @asynccontextmanager
    async def lock ( self, target: Target, wait: float = 5.0 ) -> AsyncIterator[pathlib.Path]:

        path = pathlib.Path(target)

        def opened () -> int:

            path.parent.mkdir(parents=True, exist_ok=True)

            return os.open(path, os.O_RDWR | os.O_CREAT, MODE_FILE)

        handle   = await self._run_(path, opened)
        deadline = date.monotonic() + wait

        try:

            while True:

                try:

                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)

                    break

                except BlockingIOError:

                    if date.monotonic() >= deadline:

                        raise Fault(Code.CONFLICT, reason="fs.locked", errors={ "path": [path.name] }) from None

                    await thread.sleep(LOCK_TICK)

            yield path

        finally:

            fcntl.flock(handle, fcntl.LOCK_UN)
            os.close(handle)

    async def _run_ [T] ( self, path: pathlib.Path, job: Callable[..., T], *args: Any ) -> T:

        try: return await thread.offload(job, *args)
        except (OSError, ValueError) as error: raise self._fault_(path, error) from error

    def _fits_ ( self, path: pathlib.Path ) -> bool:

        if not self._only: return os.path.lexists(path)

        return path.is_file() if self._only == "file" else path.is_dir()

    def _need_ ( self, path: pathlib.Path ) -> pathlib.Path:

        if self._only and os.path.lexists(path) and not self._fits_(path):

            raise Fault(Code.CONFLICT, reason="fs.kind", errors={ "path": [path.name], "kind": [self._only] })

        return path

    def _held_ ( self, path: pathlib.Path ) -> pathlib.Path:

        self._need_(path).lstat()

        return path

    def _files_ ( self, path: pathlib.Path ) -> list[pathlib.Path]:

        return sorted(item for item in path.rglob("*") if item.is_file())

    def _holds_ ( self, path: pathlib.Path, needle: bytes ) -> bool:

        if not needle: return True

        with path.open("rb") as handle:

            held = b""

            while piece := handle.read(CHUNK):

                if string.contains(held[-len(needle):] + piece, needle): return True

                held = piece

        return False

    def _kind_ ( self, path: pathlib.Path ) -> str:

        if path.is_symlink(): return "link"
        if path.is_dir(): return "dir"
        if path.is_file(): return "file"

        return "other" if os.path.lexists(path) else "missing"

    def _under_ ( self, base: pathlib.Path, relative: Target ) -> pathlib.Path:

        root      = base.resolve()
        wanted    = pathlib.Path(relative)
        candidate = wanted.resolve() if wanted.is_absolute() else (root / wanted).resolve()

        if candidate != root and root not in candidate.parents: raise self._escape_(relative)

        return candidate

    def _fault_ ( self, path: pathlib.Path, error: Exception ) -> Fault:

        held = getattr(error, "filename", None)
        name = pathlib.Path(held).name if isinstance(held, str) else path.name

        if isinstance(error, FileNotFoundError): code, reason = Code.NOT_FOUND, "fs.missing"
        elif isinstance(error, PermissionError): code, reason = Code.FORBIDDEN, "fs.denied"
        elif isinstance(error, ValueError): code, reason = Code.BAD_REQUEST, "fs.name"
        else: code, reason = Code.INTERNAL, "fs.failed"

        return Fault(code, reason=reason, errors={ "path": [name[:NAME_MAX]] })

    def _escape_ ( self, target: Target ) -> Fault:

        return Fault(Code.FORBIDDEN, "The path leaves its root", "fs.escape", { "path": [str(target)[:64]] })
