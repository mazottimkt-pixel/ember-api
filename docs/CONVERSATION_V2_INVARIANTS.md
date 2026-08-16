# Conversation V2 invariants

1. Only the reducer transitions V2 state.
2. At most one interaction is active.
3. Exactly one active-task record exists; type `none` represents idle.
4. Material patches increment revision monotonically.
5. A material patch invalidates existing confirmation.
6. A completed effect never regresses to pending or executing.
7. Completed/cancelled tasks reopen only through explicit events.
8. Bound actions require matching interaction ID.
9. Bound actions require matching task ID.
10. Bound actions require matching state and interaction revision.
11. Interruption preserves the active task and its interaction reference.
12. Confirmed switches start a clean incompatible draft.
13. Recovery preserves every completed effect checkpoint.
14. Interpreters and mappers report conflicts rather than silently resolving them.
15. Experience metadata cannot replace functional reducer output.

These invariants are exercised by `conversation-v2-foundation.test.ts` and `conversation-v2-mapper.test.ts`.
