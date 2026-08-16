# Conversation reducer V2

The reducer is pure and deterministic:

```text
currentState + event + interpretation + proposedPatch
  -> nextState + nextAction + effectsRequested + auditEvents + rejectedPatchOperations
```

It reads no environment variables and performs no I/O.

## Explicit transition table

| Current condition | Event | Transition |
|---|---|---|
| idle | `TASK_START` | Create one task and one open interaction |
| active task | `TASK_CANCEL` | Cancel task and remove interaction |
| active task | `TASK_SWITCH_REQUESTED` | Preserve draft; create pending switch and intent-switch interaction |
| pending switch | `TASK_SWITCH_CONFIRMED` | Start clean target task; incompatible draft is not reused |
| active task | `INTERRUPTION_START` | Preserve task and interaction by revision reference |
| interrupted | `INTERRUPTION_COMPLETE` | Restore referenced interaction |
| collecting | `CONFIRMATION_REQUESTED` | Store snapshot/fingerprint bound to current revision |
| matching confirmation | `CONFIRMATION_ACCEPTED` | Request document effect |
| any incomplete effect | `EFFECT_STARTED` | Mark executing |
| executing/pending effect | `EFFECT_SUCCEEDED` | Mark completed and preserve result reference |
| incomplete effect | `EFFECT_FAILED` | Preserve completed checkpoints and create recovery |
| any | `SESSION_RESET` | Explicitly return to idle state |

Material patch operations are accepted only when their path is whitelisted, their value validates, their base revision matches and the active interaction expects that field.
