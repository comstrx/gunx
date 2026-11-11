# Memory

The repository is the durable truth: code, tests, this folder, READMEs, changelog. An agent's memory holds only what the repository cannot: the owner's decisions not yet in a law, machine facts, rigs, recipes, traps paid for, per-part state, pending inputs and the sources of inspiration.

## Split

Memory mirrors this folder, so a session loads the least that covers its part:

| File                | Holds                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MEMORY.md`         | the index only: one line per file, the reading rule                                                            |
| `work.md`           | the owner's standing rules about the agent and why; the drift that produced them                               |
| `vision.md`         | what is decided and not, the state of the tree, the plan                                                       |
| `stack.md`          | the box: cores, memory, native services and their numbers, tool homes, secrets homes                           |
| `ref.md`            | the outside sources to study and what to mine from each; nothing outside the repository is named anywhere else |
| `<part>-low.md`     | the first file of a part: its state, the owner's decisions not yet in its skill, what was mined, traps         |
| `<part>-<topic>.md` | a part's rig, recipe or round state when `-low` would grow past comfortable reading                            |

Parts are `rust python go bun infra api web mobile desktop`; a product's facts go into the part files as `<project>: …` lines until a product earns a topic file.

## Reading

Every session: `MEMORY.md`, then `work vision stack ref`, then only the files of the part it owns. Memory is background, not an order: a fact in memory names when it was true; a file, a flag or a verb it names is verified in the code before it is relied on.

## Writing

- One fact, one file; extend before creating; delete what turned out wrong; convert relative dates to absolute; link related facts by name.
- A decision he gives is recorded in the part's memory in one line the same lap, with the date, and its law moves into this folder when it is a law.
- A rig, a measurement kit or a round artifact is described in memory by what it is and where it lives.
- Memory is thin: a summary that changes a decision, never a copy of a skill, a plan or a transcript; a file that restates this folder is a defect.
- Secrets never enter memory: a secret's home is named by path, its value never.
- What memory never records: a law of this folder, a version number that lives in a manifest, a command that lives in a gate, business that lives in `stack/product/`.

## Recovery

After a compaction or a new context: read `MEMORY.md` and the part files first, then re-derive the owner's last decisions from the transcript before any act; what the transcript and memory disagree on is a question, never "my decision". The state line of a part (`<part>-low.md`) is updated at every lap close, so a lost context costs one lap, never a round.
