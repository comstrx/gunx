# Tracks

## Contract

Own the archive location and preservation of completed live messages. IPC owns message types, participants and completion semantics.

## Structure

Mirror only the arena path after ipc/, then append the date; do not retain the leading ipc/ directory.
For example, ipc/engine/<name>/reply.md becomes history/track/engine/<name>/<YYYY-MM-DD>/NNN-reply.md.
Use `history/track/<arena>/<YYYY-MM-DD>/NNN-<kind>.md`.
Kind is the live filename without .md; do not maintain another message-type catalogue here.
The increasing sequence is local to that arena, day and kind.

## Rules

- Accept only the completed content handed off under IPC's contract.
- Preserve the full live record, including scope, cycle, items, responses if present and the completion mark, in a new destination.
- Capture the complete acknowledged live content before publication. Establish that the full intended record was successfully written; file existence or a nonzero size alone does not prove complete preservation. IPC owns whether that same live content may then be cleared.
- Do not read archived contents, including your own destination, to verify, compare or recover an exchange.
- Keep the live source if a write fails or preservation is uncertain. Do not guess from an old filename that a cycle was archived.
- If current-session write results establish that this cycle was already preserved, retain that destination reference. Otherwise leave the live source intact and report the uncertainty.
- New records never overwrite old ones. An interrupted operation must not destroy the only known complete copy.
- An unexpectedly empty or changed live source stops archival. Do not reconstruct an old reader mark from memory; an owner-authorized recovered response is a new live handoff requiring its reader’s actual completion mark.
- The contract does not prescribe a helper, shell command, checksum or receipt file.

## Proof

Preservation is established from the current live content and successful publication, without consuming historical evidence as knowledge.

## Sources

Owner archive design.

## Routing

Return to history after study. Apply its daily organization and root/work's access policy.
