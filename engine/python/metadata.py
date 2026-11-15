from pathlib import Path
from typing import Any, override

from hatchling.metadata.plugin.interface import MetadataHookInterface
import tomllib

class Metadata(MetadataHookInterface):

    @override
    def update ( self, metadata: dict[str, Any] ) -> None:

        workspace = Path(self.root).parents[1] / "pyproject.toml"
        project   = tomllib.loads(workspace.read_text(encoding="utf-8"))["project"]

        for name in metadata["dynamic"]: metadata[name] = project[name]
