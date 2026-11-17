declare -ga LAW_LAYERS=( core config module app )
declare -gA LAW_OWNERS=()
declare -g LAW_MACROS=module/bundle/src/macro.sh LAW_FIRST=module/bundle/src/bash.sh LAW_LOADER=module:bundle:load:use LAW_LOAD=module/bundle/src/load.sh
declare -gA PACK_STAMPS=()
declare -ga UI_COMMANDS=()
declare -gA UI_FLAGS=() UI_GLOBALS=() UI_INDEX=() UI_ARITY=() UI_RAW=()
