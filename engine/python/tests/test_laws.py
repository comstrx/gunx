from pathlib import Path
from engine.parse import parse
import ast, re, sys

ROOT    = Path(__file__).resolve().parents[1]
SRC     = ROOT / "src"
KEPT    = frozenset({ "__pycache__", "py.typed" })
MEMBERS = sorted(p.name for p in SRC.iterdir() if p.is_dir() and p.name != "engine")
HEADER  = re.compile(r"^\s*(?:async\s+)?(?:def|class)\s+\S.*:\s*$")
IMPORT  = re.compile(r"^from engine\.([a-z]+)")
LIBRARY = re.compile(r"^(?:from|import)\s+([A-Za-z_][\w]*)")
NATIVE  = frozenset(sys.stdlib_module_names) | { "engine" }

def test_workspace_law_every_member_is_declared_once () -> None:

    root    = parse.toml((ROOT / "pyproject.toml").read_text())
    sources = root["tool"]["uv"]["sources"]
    facade  = parse.toml((SRC / "engine" / "pyproject.toml").read_text())

    assert sorted(facade["project"]["dependencies"]) == [f"engine-{m}" for m in MEMBERS]
    assert all(f"engine-{m}" in sources for m in MEMBERS) and sources["engine"] == { "workspace": True }

    for member in MEMBERS:

        manifest = parse.toml((SRC / member / "pyproject.toml").read_text())
        project  = manifest["project"]

        assert project["name"] == f"engine-{member}" and project["dynamic"] == ["version"] and len(project["description"]) <= 80
        assert sorted(project) == ["dependencies", "description", "dynamic", "name"], member
        assert sorted(manifest) == ["build-system", "project", "tool"] and sorted(manifest["tool"]) == ["hatch"], member

        for dependency in project["dependencies"]: assert re.fullmatch(r"[a-zA-Z0-9_.-]+(\[[a-z,]+\])?", dependency), dependency

    assert sorted(SRC.rglob("py.typed")) == sorted(SRC / member / "src" / "engine" / member / "py.typed" for member in MEMBERS)

def test_package_law_a_member_is_a_facade_an_arch_and_one_class_per_file () -> None:

    offenders: list[str] = []

    for member in MEMBERS:

        base  = SRC / member / "src" / "engine" / member
        files = { file.stem: ast.parse(file.read_text()) for file in base.glob("*.py") }
        extra = sorted(item.name for item in base.iterdir() if item.suffix != ".py" and item.name not in KEPT)

        if extra: offenders.append(f"{member}: {extra}")
        if not { "__init__", "arch" } <= set(files): offenders.append(f"{member}: lacks __init__ or arch")

        for stem, tree in files.items():

            classes = [node.name for node in tree.body if isinstance(node, ast.ClassDef)]
            loose   = [node.name for node in tree.body if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)]

            if stem == "__init__" and (classes or loose): offenders.append(f"{member}/__init__ defines {classes + loose}")
            if stem in ("__init__", "arch"): continue
            if loose: offenders.append(f"{member}/{stem} holds loose functions {loose}")
            if [name.lower() for name in classes] != [stem]: offenders.append(f"{member}/{stem} holds {classes}")

    assert offenders == []

def test_shape_law_domains_form_a_dag_and_declare_their_imports () -> None:

    edges: dict[str, set[str]] = {}

    for member in MEMBERS:

        manifest = parse.toml((SRC / member / "pyproject.toml").read_text())
        declared = { d.removeprefix("engine-") for d in manifest["project"]["dependencies"] if d.startswith("engine-") }
        used: set[str] = set()

        for file in (SRC / member / "src" / "engine" / member).glob("*.py"):

            for line in file.read_text().splitlines():

                found = IMPORT.match(line)

                if found and found.group(1) != member: used.add(found.group(1))

        assert used <= declared, f"{member} imports {sorted(used - declared)} without declaring them"
        assert member not in used

        edges[member] = used

    seen: dict[str, int] = {}

    def visit ( node: str, trail: tuple[str, ...] ) -> None:

        state = seen.get(node, 0)

        assert state != 1, f"cycle: {' -> '.join((*trail, node))}"

        if state == 2: return

        seen[node] = 1

        for other in sorted(edges.get(node, ())): visit(other, (*trail, node))

        seen[node] = 2

    for member in MEMBERS: visit(member, ())

    assert edges["error"] == set() and "error" in edges["log"] | edges["context"]

LADDER = (
    ("error", "context", "log"),
    ("rand", "func", "thread", "adapter", "exception"),
    ("json", "parse", "number", "date", "string", "array"),
    ("crypto", "token", "validate", "config", "translate", "metric", "health", "cli"),
    ("fs", "net", "cache", "stream", "storage", "view"),
    ("database", "search"),
    ("broker", "queue", "event", "schedule", "socket", "broadcast"),
    ("http", "auth"),
    ("mail", "sms", "notify", "gateway", "geo", "domain", "ai", "rag", "video"),
    ("fake", "test"),
)
RUNG = { name: index for index, names in enumerate(LADDER) for name in names }

def test_ladder_law_a_member_leans_only_on_members_at_or_below_its_rung () -> None:

    assert sorted(RUNG) == MEMBERS, sorted(set(MEMBERS) ^ set(RUNG))

    climbs: list[str] = []

    for member in MEMBERS:

        manifest = parse.toml((SRC / member / "pyproject.toml").read_text())

        for dependency in manifest["project"]["dependencies"]:

            if not dependency.startswith("engine-"): continue

            other = dependency.removeprefix("engine-")

            if RUNG[other] > RUNG[member]: climbs.append(f"{member} ({RUNG[member]}) -> {other} ({RUNG[other]})")

    assert climbs == [], climbs

def test_door_law_every_library_has_exactly_one_owner_domain () -> None:

    owners: dict[str, set[str]] = {}

    for member in MEMBERS:

        for file in (SRC / member / "src" / "engine" / member).glob("*.py"):

            for line in file.read_text().splitlines():

                bare  = line.strip()
                found = LIBRARY.match(bare)
                names = [found.group(1)] if found else []
                names += [part.strip().split(".")[0].split(" ")[0] for part in bare.split(",")[1:]] if bare.startswith("import ") else []

                for name in names:

                    if name not in NATIVE: owners.setdefault(name, set()).add(member)

    shared = { library: sorted(found) for library, found in owners.items() if len(found) > 1 }

    assert owners and shared == {}, f"a library enters through more than one domain: {shared}"

def test_facade_law_every_package_exports_a_sorted_surface () -> None:

    for member in MEMBERS:

        text = (SRC / member / "src" / "engine" / member / "__init__.py").read_text()

        assert "__all__ = [" in text, member

        names = re.findall(r'"([A-Za-z_][A-Za-z0-9_]*)"', text.split("__all__ = [", 1)[1])

        assert names == sorted(names, key=lambda n: (0 if n.isupper() else 1 if n[0].isupper() else 2, n)), member

def test_blank_line_law_every_header_breathes () -> None:

    offenders: list[str] = []

    for file in SRC.rglob("*.py"):

        lines = file.read_text().splitlines()

        for index, line in enumerate(lines[:-1]):

            if HEADER.match(line) and lines[index + 1].strip() and not line.rstrip().endswith("..."):

                if not line.lstrip().startswith("def") and not line.lstrip().startswith("async def") and not line.lstrip().startswith("class"): continue

                offenders.append(f"{file.relative_to(ROOT)}:{index + 1}")

    assert offenders == []

def test_purity_law_no_comments_prints_or_evals_in_sources () -> None:

    offenders: list[str] = []

    for file in SRC.rglob("*.py"):

        for index, line in enumerate(file.read_text().splitlines(), 1):

            stripped = line.strip()

            if stripped.startswith("#") or "eval(" in stripped or "exec(" in stripped or re.search(r"(^|\s)print\(", stripped):

                offenders.append(f"{file.relative_to(ROOT)}:{index}")

    assert [o for o in offenders if "/test/" not in o] == []
