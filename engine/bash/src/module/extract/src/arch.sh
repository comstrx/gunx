declare -g EXTRACT_ACTION=src/module/gate/template
declare -ga EXTRACT_RESULTS=()
declare -g EXTRACT_STAGE="" EXTRACT_DONE=""
declare -ga EXTRACT_KINDS=( engine fragment tutor product )
declare -ga EXTRACT_NEEDS=( type path )
declare -g EXTRACT_KIND=product EXTRACT_HOME=product
declare -ga EXTRACT_SHARED=( branch tag )
declare -ga EXTRACT_OWN=( name type path repo owner logo engines deps )
declare -ga EXTRACT_STAYS=( AGENTS.md README.md tutor )
declare -g EXTRACT_HOMES="" EXTRACT_PRODUCTS="" EXTRACT_TUTOR=""
declare -ga EXTRACT_SLOTS=( __0__ __1__ )
declare -g EXTRACT_LOGO=150
