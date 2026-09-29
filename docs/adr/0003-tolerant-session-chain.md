# Tolerant session-chain load in canonical session order

- Status: Accepted
- Date: 2026-09-19

## Context

The bundle stores each book's reading history as an array of reading sessions
with `current_page` and `pages_read`. The per-session `pages_read` values form
a **session chain**: each entry's contribution is the progress difference from
the previous entry.

Two recurrences of `Reading plan data unavailable` on Android traced back to
this chain:

1. The Android reader validated the chain in raw file order and failed closed
   (`pages read conflicts with session progress`), while the desktop reader
   never checked the chain and derived progress from the maximum. Any order
   the writer persisted that disagreed with file-order validation bricked the
   phone, even though the desktop loaded the same data fine.
2. Sorting by `(date, id)` does not fix the observed case: the two conflicting
   sessions share the same date (`2026-09-17`) and UUID order keeps the higher
   page first (`300/11` before `289/5`). The arithmetically consistent order is
   by page (`284 -> 289/5 -> 300/11 -> 306/6`).

Both writers also appended new sessions, so a back-dated entry persisted a
file order no strict reader could accept.

## Decision

- **Canonical session order** is `(date, current_page, id)` on both platforms,
  for reading, writing, and chain math. Deleted sessions are skipped by the
  chain on both platforms.
- Loaders validate the chain in canonical order, never in file order.
- A chain mismatch on load recomputes `pages_read` from the page progression
  instead of throwing; the repaired bundle is saved back (self-heal).
  Fail-closed remains only for unreadable files (missing files, bad JSON,
  checksum mismatch, unknown schema).
- Writers persist canonical order on every save, so a save can never store a
  chain break.
- Back-dated entries are allowed: adding a session inserts it in canonical
  position and recomputes contributions. Recording zero progress (an exact
  duplicate page) is still rejected.

## Consequences

- Desktop and Android agree on order, chain math, and deleted-session
  handling; a bundle one of them writes always loads on the other.
- Same-day sessions are ordered by page, so UUID assignment can never invert
  the chain again.
- Genuinely corrupt values (negative or zero amounts, out-of-range pages)
  still fail fast; that residual strictness is intentional and out of scope.
