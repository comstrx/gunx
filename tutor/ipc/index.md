# IPC

## Contract

Scoped written collaboration between agents. Each participant owns its messages, handles its assigned inputs and reads the counterpart's responses. This is a communication contract, not a tool or shell recipe.

## Structure

### Reviewer and executor

The reviewer writes the input without modifying code. The executor handles it and writes the response; the reviewer reads and reassesses that response.

| Reviewer input | Executor response |
| -------------- | ----------------- |
| review.md      | reply.md          |
| audit.md       | upgrade.md        |
| plan.md        | report.md         |
| logic.md       | evolve.md         |

### Executor and executor

The requesting executor writes require.md and follows impl.md.
The receiving executor handles require.md in its arena and writes impl.md.
This covers frontend-to-backend and fragment-to-engine collaboration, as well as another explicitly assigned capability relationship.
A response may implement, clarify, identify a conflict, object with reasons or offer an existing alternative. Neither executor acquires the other's scope.

### Arena

Engine arena: ipc/engine/<recipient>/<product-or-set>/<part-or-set>/.
Product arena: ipc/product/<product>/<recipient-part>/<requester-or-set>/.
Engine-to-engine communication uses an explicit requester name such as from-engine-<name>, distinct from a product name, and records both scopes in the message.
Consumer levels apply only when the exchange concerns an actual product/part. Engine-internal review or development uses the recipient engine arena without inventing a product. Within a consumer exchange, omit a level only when its scope covers all members of that level. For selected subsets use a clear stable name and state exact members in the message.
Resolve identities from the assignment and approved registry. Descriptions such as enterprise, production or frontend are not product identifiers. If a required identity is missing, ask for it or await the addressed request; never turn descriptive prose into an arena name.
An engine-wide recipient may discover requests in its assigned engine subtree by reading live message headers. Match writer, reader and exact scope before handling a request; do not monitor an unrelated product or infer authority from a filename.
Give independent writers separate subarenas when necessary; each file has one content writer and one designated reader.

## Rules

### Message

- Begin with scope, writer, reader, a fresh cycle identifier and Batch: open or ready. Keep numbered items stable while that cycle is live.
- While Batch is open, append related items without overwriting unresolved work. State the requested result, relevant context and constraints concisely. Publish Batch: ready when handing the stable batch to its reader; content then stays frozen until completion/archive.
- Responses identify the originating cycle and items, and explain what was implemented, rejected with reason, replaced by an alternative or remains pending.
- An IPC request cannot enlarge the reader's assigned authority. Unknown product decisions remain questions, not invented requirements.
- The reviewer owns review, audit, plan and logic without changing code. Audit concerns external dependencies; review concerns engineering quality; logic concerns behavior and practical coverage in products or engines.
- Keep secrets and unrelated material out of messages.

### Publication

Every live revision is published as a complete atomic file: initial message, appended open batch, ready transition, response and reader completion mark.
Prepare the complete revision before exposing it. Directly overwriting a live file and finishing it later does not satisfy this contract, even when the final text looks correct.
Preserve the expected cycle, item range and ownership phase before publication. Atomic replacement gives complete visibility, not conflict reconciliation; the frozen ready phase and designated reader below govern who may write.
A discovered non-atomic publication is reported as such. Validate the current complete live record before continuing; a later correct write cannot establish that the earlier publication was atomic.

### Observation and response

- Executors follow their assigned review, audit and plan files, and logic or require files where their responsibility includes them.
- Reviewers, auditors and planners follow reply, upgrade and report respectively; behavior reviewers follow evolve and requesters follow impl.
- Read relevant inputs at the start, while coordinating dependent work and before declaring the task complete.
- A reviewer is responsible for criticism, not absolute engineering authority. The executor may reject or amend a recommendation with clear reasons, relevant facts and a better alternative.
- Neither role blindly obeys the other. Reassess objections against the owner's intent and shared knowledge; bring an unresolved decision to the owner with the options and consequences.
- Reassess a response honestly. Continue with clear remaining findings or a revised plan where needed; do not accept a reassuring sentence in place of addressing the items.
- Coordinate within the active session without wasteful checking. Do not claim monitoring continues after the session stops.
- A missing counterpart or unresolved dependency remains pending; it is not permission to invent a response. Deliver useful authorized analysis to the owner without waiting for a nonexistent peer; keep peer-dependent handling and acknowledgements pending.

### Completion mark

Use one reader-written line at the end:

`Finished: <cycle> / through=<last-item> / by=<reader>`

- The mark means the reader has handled every item through that number according to its role and published any required response.
- Both directions need a real reader mark: the receiving executor marks the handled input after publishing its response; the originator marks the assessed response. Neither mark is self-acknowledgement. Do not wait for the response mark before acknowledging the handled input; that would make both sides wait on one another.
- A completion mark closes handling of the message, not automatic agreement with its conclusion or a claim that all project work is complete.
- Opening the file or saying work is underway is not completion. Every item needs an assessed disposition and any required response. A reasoned rejection or explicit blocker can complete message handling when remaining work has a stated owner and next step; unanswered or unassessed items cannot. Acknowledging a response does not accept its engineering conclusion.
- The reader may inspect open work but writes its completion mark only on a ready batch. While ready, the writer does not append or replace content; only the reader adds the mark. This ownership handoff prevents competing content/acknowledgement writes.
- A changed cycle, item range or unexpected content invalidates clearance. Preserve the live file and resolve the handoff; never reconstruct a missing acknowledgement from silence.
- After completion, the writer archives that cycle before starting fresh content. Additional work belongs to the next cycle.

### Archive handoff

Only the content writer may clear its live file, after the designated reader's matching completion mark.
Enter history, select track and preserve that completed cycle under its archive contract.
Clear only the same acknowledged content after successful preservation; uncertain preservation leaves it intact.
A prior mark never covers a new cycle, and no participant clears another writer's file.
Archive paths, dates, numbering and preservation details belong to history, not this guide.

## Proof

Every requested item has a clear disposition, responses remain traceable, and only acknowledged preserved content is cleared. No assumed silence, stale mark or partial read counts as completion.

## Sources

Owner-defined collaboration and acknowledgement model.

## Routing

Choose the arena from the current scope and recipient.
For completed messages enter [history](../history/index.md), selecting track. For substantive lessons use report through the same entry.
