# ConversationStateV2

`ConversationStateV2` is the single canonical state proposed for the Lume conversational runtime. During the foundation phase it runs only in shadow and never replaces or writes `conversations.context`.

## Ownership

Only `reduceConversationV2` may produce a transitioned V2 state. Interpreters return immutable `InterpretationV2` and `StatePatchV2` proposals. Tools, transport, persistence and renderers are outside the reducer.

## Canonical fields

| Field | Responsibility |
|---|---|
| `revision` | Monotonic material-state revision |
| `activeTask` | One task identity, type and lifecycle status |
| `draft` | Material business data only |
| `draft.provenance` | Source, confidence and semantic status by material path |
| `interaction` | The only active question/choice/confirmation |
| `interruption` | Temporary query plus exact resume reference |
| `pendingSwitch` | Proposed incompatible task switch |
| `confirmation` | Snapshot and fingerprint bound to task revision |
| `effects` | Document, PDF and delivery checkpoints |
| `recovery` | Explicit failed stage and allowed recovery actions |
| `experience` | Introduction and interaction timestamps only |
| `lastProcessedEvent` | Future ordering/deduplication cursor |

The draft deliberately excludes legacy mirrors such as `quotedItemDescription`, `commercialInterpretation` and `hybrid.recentEntities`.

## Lifecycle boundary

Foundation V2 models effects but does not call Supabase, OpenAI, Meta, PDF generation or document tools. Persistence and queue migration belong to later phases.
