from pathlib import Path
from typing import Any
import ast, importlib, io, json, re, sys, tokenize, tomllib

ROOT     = Path(__file__).resolve().parents[1]
SRC      = ROOT / "src"
MEMBERS  = sorted(path.name for path in SRC.iterdir() if path.is_dir())
SERVICES = [member for member in MEMBERS if member != "contract"]
NATIVE   = frozenset(sys.stdlib_module_names)
ROOTED   = frozenset({ ".env.example", ".env.local", ".env.production", "pyproject.toml", "src" })
LAYERS   = frozenset({ "app", "bootstrap", "config", "database", "public", "resources", "routes", "storage" })
PACKAGE  = LAYERS | { "__init__.py", "__main__.py", "py.typed" }
APP      = frozenset({
    "commands", "controllers", "enums", "events", "jobs", "listeners", "mails", "middlewares", "models", "repositories",
    "requests", "resources", "services", "utils", "__init__.py",
})
UTILS    = frozenset({ "cycle", "dna.py", "__init__.py" })
CYCLE    = frozenset({
    "__init__.py", "controller.py", "event.py", "job.py", "middleware.py", "model.py", "repository.py", "request.py",
    "resource.py", "route.py", "service.py",
})
ORDER    = {
    "app.utils.dna"       : set(),
    "app.utils.cycle"     : { "app.utils.dna" },
    "app.enums"           : set(),
    "database.migrations" : set(),
    "app.models"          : { "app.utils.cycle", "app.utils.dna", "app.enums", "database.migrations" },
    "app.repositories"    : { "app.utils.cycle", "app.models", "app.enums" },
    "app.resources"       : { "app.utils.cycle", "app.models", "app.enums" },
    "app.services"        : { "app.utils.cycle", "app.repositories", "app.resources", "app.enums" },
    "app.controllers"     : { "app.utils.cycle", "app.services" },
    "app.requests"        : { "app.utils.cycle", "app.controllers", "app.enums" },
    "app.middlewares"     : { "app.utils.cycle", "app.services" },
    "routes"              : { "app.utils.cycle", "app.requests", "app.controllers", "app.middlewares" },
    "database.seeders"    : { "app.models", "app.enums" },
    "config"              : set(),
}
SHELVES  = { "resources": { "assets", "messages", "views" }, "storage": { "app", "logs" }, "storage/app": { "private", "public" } }
NEEDED   = (
    "__main__.py", "bootstrap/app.py", "config/app.py", "routes/api.py", "public/robots.txt", "resources/messages/en.json",
    "resources/messages/ar.json", "storage/app/public/.gitignore", "storage/app/private/.gitignore", "storage/logs/.gitignore",
)
LOCALES  = ("en", "ar")
IMPORT   = re.compile(r"^(?:from|import)\s+([A-Za-z_]\w*)(?:\.(\w+))?")
CALLS    = re.compile(r"\b(?:print|eval)\(")
REASON   = re.compile(r'reason="([a-z_]+\.[a-z_.]+)"')

def manifest ( member: str ) -> dict[str, Any]:

    return tomllib.loads((SRC / member / "pyproject.toml").read_text())

def sources ( member: str ) -> list[Path]:

    return sorted((SRC / member / "src" / member).rglob("*.py"))

def entries ( folder: Path ) -> set[str]:

    return { path.name for path in folder.iterdir() if path.name != "__pycache__" } if folder.is_dir() else set()

def layer ( dotted: str ) -> str | None:

    return max((name for name in ORDER if dotted == name or dotted.startswith(f"{name}.")), key=len, default=None)

def reaches ( member: str, file: Path ) -> list[tuple[str, int]]:

    base   = SRC / member / "src" / member
    module = ".".join(file.relative_to(base).with_suffix("").parts)
    parts  = module.split(".") if file.name != "__init__.py" else [*module.split(".")[:-1], "__init__"]
    found: list[tuple[str, int]] = []

    for node in ast.walk(ast.parse(file.read_text())):

        if not isinstance(node, ast.ImportFrom) or node.level == 0: continue

        anchor = parts[:-node.level]
        target = ".".join([*anchor, *(node.module.split(".") if node.module else [])])

        found.append((target, node.lineno))

    return found

def reasons ( member: str, locale: str ) -> dict[str, str]:

    path = SRC / member / "src" / member / "resources" / "messages" / f"{locale}.json"

    return dict(json.loads(path.read_text()).get("reasons", {})) if path.is_file() else {}

def test_workspace_law_every_member_is_declared_once () -> None:

    root = tomllib.loads((ROOT / "pyproject.toml").read_text())

    assert root["tool"]["uv"]["workspace"]["members"] == ["src/*"]
    assert sorted(root["project"]["dependencies"]) == [f"api-{member}" for member in MEMBERS]

    for member in MEMBERS:

        found = manifest(member)["project"]

        assert found["name"] == f"api-{member}" and len(found["description"]) <= 80
        assert root["tool"]["uv"]["sources"][f"api-{member}"] == { "workspace": True }
        assert (SRC / member / "src" / member / "py.typed").exists()

def test_domain_law_a_member_reaches_only_the_engine_the_contract_and_itself () -> None:

    for member in MEMBERS:

        allowed  = { "engine", member } | ({ "contract" } if member != "contract" else set())
        declared = set(manifest(member)["project"]["dependencies"])
        used: set[str] = set()

        for file in sources(member):

            for line in file.read_text().splitlines():

                found = IMPORT.match(line)

                if not found or found.group(1) in NATIVE: continue

                assert found.group(1) in allowed, f"{file.relative_to(ROOT)}: {line}"

                if found.group(1) == "engine" and found.group(2): used.add(f"engine-{found.group(2)}")
                if found.group(1) == "contract" and member != "contract": used.add("api-contract")

        assert used == declared, f"{member}: declares {sorted(declared - used)}, misses {sorted(used - declared)}"

def test_layout_law_every_member_keeps_the_one_shape () -> None:

    for member in MEMBERS:

        base = SRC / member / "src" / member

        assert entries(SRC / member) <= ROOTED, f"{member}: {sorted(entries(SRC / member) - ROOTED)}"
        assert entries(base) <= PACKAGE, f"{member}: {sorted(entries(base) - PACKAGE)}"
        assert entries(base / "app") <= APP, f"{member}: {sorted(entries(base / 'app') - APP)}"
        assert entries(base / "app" / "utils") <= UTILS, member
        assert not (base / "app" / "utils").exists() or entries(base / "app" / "utils" / "cycle") == CYCLE, member
        assert all(entries(base / shelf) <= allowed for shelf, allowed in SHELVES.items()), member

    for member in SERVICES:

        base = SRC / member / "src" / member

        assert all((base / need).is_file() for need in NEEDED) and (SRC / member / ".env.example").is_file(), member

    contract = SRC / "contract" / "src" / "contract"

    assert entries(contract) == { "__init__.py", "py.typed", "app", "config", "resources" }
    assert entries(SRC / "contract") == { "pyproject.toml", "src" }
    assert not [path for path in ROOT.rglob("*.sh") if ".venv" not in path.parts], "a script beside the tree"

def test_layer_law_each_layer_reaches_only_the_layers_beneath_it () -> None:

    for member in SERVICES:

        base = SRC / member / "src" / member

        for file in sources(member):

            module = ".".join(file.relative_to(base).with_suffix("").parts)
            home   = layer(module)

            if home is None: continue

            for target, line in reaches(member, file):

                reached = layer(target)

                if reached is None or reached == home: continue

                assert reached in ORDER[home], f"{file.relative_to(ROOT)}:{line}: {home} reaches {reached}"

def test_env_law_every_service_documents_exactly_its_settings () -> None:

    for member in SERVICES:

        settings   = importlib.import_module(f"{member}.config.app").AppSettings
        lines      = (SRC / member / ".env.example").read_text().splitlines()
        documented = { line.split("=", 1)[0] for line in lines if "=" in line }

        assert documented == set(settings.keys().values()), member

def test_message_law_every_reason_a_member_raises_speaks_both_languages () -> None:

    shared = { locale: reasons("contract", locale) for locale in LOCALES }

    for member in MEMBERS:

        own    = { locale: reasons(member, locale) for locale in LOCALES }
        raised = { found for file in sources(member) for found in REASON.findall(file.read_text()) }

        assert set(own["en"]) == set(own["ar"]), member

        for locale in LOCALES:

            missing = raised - set(own[locale]) - set(shared[locale])

            assert not missing, f"{member} ({locale}) misses {sorted(missing)}"

def test_purity_law_no_comment_print_or_eval_in_a_member () -> None:

    for member in MEMBERS:

        for file in sources(member):

            text   = file.read_text()
            tokens = tokenize.generate_tokens(io.StringIO(text).readline)

            assert not [token for token in tokens if token.type == tokenize.COMMENT], f"{file.relative_to(ROOT)}: a comment"
            assert not CALLS.search(text), f"{file.relative_to(ROOT)}: print or eval"
