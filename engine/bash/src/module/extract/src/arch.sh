declare -ga EXTRACT_RESULTS=()
declare -g EXTRACT_STAGE="" EXTRACT_DONE=""
declare -g EXTRACT_HOMES="" EXTRACT_PRODUCTS=""
declare -ga EXTRACT_KINDS=( engine fragment product )
declare -g EXTRACT_KIND=product EXTRACT_HOME=product EXTRACT_ENGINES=engine
declare -ga EXTRACT_SHARED=( branch tag )
declare -ga EXTRACT_OWN=( name type path repo owner logo engines refs )
declare -ga EXTRACT_STAYS=( AGENTS.md README.md tutor )
declare -g EXTRACT_TABLE=deps EXTRACT_VERB=extract EXTRACT_SKIP=.git EXTRACT_TRACK=Track
declare -g EXTRACT_ACTION=src/module/gate/template
declare -g EXTRACT_FORGE=.github EXTRACT_FLOWS=.github/workflows
declare -ga EXTRACT_LABELS=( .github/labels.yml .github/labeler.yml )
declare -g EXTRACT_LABELER=.github/labeler.yml EXTRACT_UPDATES=.github/dependabot.yml
declare -g EXTRACT_ALLOW=.zizmor.yml EXTRACT_CHECKOUT=actions/checkout
declare -g EXTRACT_RUN='run: ' EXTRACT_USES='uses: ' EXTRACT_SELF='[$]/'
declare -g EXTRACT_WATCH=paths EXTRACT_FOLDER='directory: /' EXTRACT_PREFIX='prefix: ' EXTRACT_BUMP=deps
declare -g EXTRACT_CHANGELOG=CHANGELOG.md EXTRACT_CHANGES='# Changelog' EXTRACT_README=README.md EXTRACT_HEADING='# '
declare -g EXTRACT_PAPERS='md|yml|yaml|toml' EXTRACT_PROSE='md|yml|yaml' EXTRACT_YAML='yml|yaml' EXTRACT_PATHS='json|jsonc|toml|yml|yaml|mod|work'
declare -gA EXTRACT_MANIFESTS=( [pyproject.toml]=python )
declare -ga EXTRACT_SECRETS=( .env .secret ) EXTRACT_SAMPLES=( .env.example .secret.example .secrets.example )
declare -g EXTRACT_FORMATTER=prettier
declare -ga EXTRACT_FORMAT=( --log-level warn --write )
declare -ga EXTRACT_SLOTS=( __0__ __1__ )
declare -g EXTRACT_LOGO=150 EXTRACT_BADGE=$'\n<div align="center">\n  <br/>\n  <img height="{height}" src="{src}"/>\n  <br/>\n  <br/>\n</div>\n'
