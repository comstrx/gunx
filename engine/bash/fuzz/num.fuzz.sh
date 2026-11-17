fuzz:core:num:range () {

    local value="" low="" high="" out=""
    local -a words=()

    mapfile -t words < <(tr -c '0-9a-z.+-' '\n' < "${1}" | head -n 3)

    value="${words[0]:-}" low="${words[1]:-}" high="${words[2]:-}"

    core:num:is "${value}" || true
    core:num:between "${value}" "${low}" "${high}" || true
    core:num:percent "${value}" "${low}" >/dev/null || true
    core:num:max "${value}" "${low}" "${high}" >/dev/null || true
    core:num:min "${value}" "${low}" "${high}" >/dev/null || true

    core:num:natural "${value}" && core:num:natural "${low}" && core:num:natural "${high}" || return 0
    (( ${#value} < 16 && ${#low} < 16 && ${#high} < 16 && 10#${low} <= 10#${high} )) || return 0

    out="$(core:num:clamp "${value}" "${low}" "${high}")" || return 3

    (( 10#${out} >= 10#${low} && 10#${out} <= 10#${high} )) || return 3

}
