from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, override

from hatchling.builders.config import BuilderConfig
from hatchling.builders.hooks.plugin.interface import BuildHookInterface
import tomllib, tomli_w

class Distribution(BuildHookInterface[BuilderConfig]):

    @override
    def initialize ( self, version: str, build_data: dict[str, Any] ) -> None:

        root      = Path(self.root)
        manifest  = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
        inherited = tomllib.loads((root.parents[1] / "pyproject.toml").read_text(encoding="utf-8"))["project"]
        project   = manifest["project"]

        for name in project.pop("dynamic"): project[name] = inherited[name]

        del manifest["tool"]["hatch"]["metadata"]["hooks"]["custom"]
        del manifest["tool"]["hatch"]["build"]["targets"]["sdist"]["hooks"]["custom"]

        manifest["build-system"]["requires"].remove("tomli-w")

        if not manifest["tool"]["hatch"]["metadata"]["hooks"]: del manifest["tool"]["hatch"]["metadata"]["hooks"]
        if not manifest["tool"]["hatch"]["metadata"]: del manifest["tool"]["hatch"]["metadata"]
        if not manifest["tool"]["hatch"]["build"]["targets"]["sdist"]["hooks"]:

            del manifest["tool"]["hatch"]["build"]["targets"]["sdist"]["hooks"]

        self._temporary = TemporaryDirectory(prefix="engine-sdist-")
        staged = Path(self._temporary.name) / "pyproject.toml"

        staged.write_text(tomli_w.dumps(manifest), encoding="utf-8")
        build_data["force_include"].pop(str(root / "pyproject.toml"), None)
        build_data["force_include"][str(staged)] = "pyproject.toml"

    @override
    def finalize ( self, version: str, build_data: dict[str, Any], artifact_path: str ) -> None:

        self._temporary.cleanup()
