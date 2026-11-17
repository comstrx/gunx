fuzz:core:list:sets () {

    local item="" wanted=""
    local -a items=() unique=() rest=() mixed=()

    mapfile -t items < <(tr -d '\0' < "${1}" | head -n 40)
    (( ${#items[@]} > 0 )) || return 0

    wanted="${items[0]}"

    core:list:has "${wanted}" "${items[@]}" || return 3

    mapfile -t unique < <(core:list:uniq "${items[@]}")
    (( ${#unique[@]} <= ${#items[@]} )) || return 3

    for item in "${unique[@]}"; do
        core:list:has "${item}" "${items[@]}" || return 3
    done

    mapfile -t rest < <(core:list:without "${wanted}" "${items[@]}")
    ! core:list:has "${wanted}" "${rest[@]}" || return 3

    mapfile -t mixed < <(core:list:shuffle "${items[@]}")
    (( ${#mixed[@]} == ${#items[@]} )) || return 3

    [[ "$(core:list:count "${items[@]}")" == "${#items[@]}" ]] || return 3

}
