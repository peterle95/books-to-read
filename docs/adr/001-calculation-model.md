# Calculation model for baseline schedules and deadline overrides

- Status: Accepted
- Date: 2026-07-17

## Context

A reading plan has a persisted **baseline schedule** and a separate **current required pace**. The baseline schedule records the commitment created by an explicit plan calculation. Progress updates and the remaining-plan view may change the current required pace, but they must not silently rewrite that commitment.

An individual book may also have a **deadline override**. An override must affect the book's displayed schedule, current remaining plan, and session targets. When the book belongs to a **simultaneous group**, the override must detach that book from the shared schedule while leaving the other group members together.

## Decision

The calculation flow is layered:

```text
build_plan
  -> calculate_deadlines
  -> materialize BaselineSchedule values
  -> apply_persisted_deadline_overrides
       -> apply_deadline_override
```

The same model is used for physical, digital, and audiobook sections; the section label determines whether the unit is pages or duration.

### `build_plan` and `calculate_deadlines`

`build_plan` calculates the total work, available reading days, required pace, and overall status. It delegates the ordered schedule to `calculate_deadlines`.

`calculate_deadlines` schedules books sequentially using cumulative work and the supplied pace. A simultaneous group is one scheduling unit: its members share a start date and deadline, while their daily targets are split in proportion to their work. Plan-wide rest days are excluded from the reading-date sequence.

These functions calculate a complete ordinary schedule. They do not mutate books and do not apply deadline overrides themselves.

### Baseline schedule creation

`calculate_baseline_schedules` and `recalculate_baseline_schedules` first use the ordinary calculation flow, then persist each resulting `BookDeadline` as the book's `BaselineSchedule`. They then call `apply_persisted_deadline_overrides` so persisted overrides are reapplied after a load or explicit recalculation.

An explicit recalculation replaces the baseline schedule for unfinished work. Merely logging progress, viewing the remaining plan, editing rest days, or making other non-recalculation changes does not replace the persisted baseline.

### `apply_deadline_override`

Applying an override:

1. Requires that a baseline schedule already exists.
2. Validates that the override is not before today and is not after the plan end.
3. Stores the `deadline_override` on the book.
4. Computes the book's pace from its remaining work between its effective remaining start date and override deadline, excluding rest days.
5. Replaces that book's baseline schedule with the resulting independent schedule.

The effective remaining start date is used as the persisted schedule start date. This prevents the schedule from claiming that already elapsed or rest days are still available for the book. When a group is recalculated after detachment, the same effective start is persisted for every remaining shared member.

Clearing an override restores the book to the plan end date, or to the containing group's existing shared deadline when another group member still supplies one, and recalculates its pace.

### Simultaneous groups and overrides

When an overridden book belongs to a simultaneous group, it is removed from the active group for scheduling purposes. The remaining non-overridden members stay in a simultaneous group if at least two members remain. Their shared schedule and proportional daily targets are recalculated from their remaining work.

This means an override creates an **independent schedule** for exactly the selected book while preserving the shared relationship among the other members.

### Remaining-plan calculation

`build_remaining_section_plan` is a view of unfinished work from the current date; it is not a baseline mutation.

When overrides exist, the function schedules non-overridden books while treating overridden books as zero work in that ordinary pass. It then adds each overridden book as a fixed time slot using its persisted baseline start date, override deadline, remaining work, and per-book pace. Fixed slots remain in book order; a slot that overlaps an earlier fixed slot or leaves no available reading days makes the section not achievable. The algorithm never changes an explicit override deadline. The resulting deadlines are sorted back into book order, and the section status considers both ordinary and overridden deadlines.

Without overrides, the function delegates directly to the ordinary `build_plan` flow.

### Session targets

The session view obtains a book's target from its persisted `BaselineSchedule`, not by rebuilding the section schedule. The session target therefore uses the book's own start date, deadline, and daily target, including an override or the proportional target of a simultaneous group.

## Consequences

- The baseline schedule is stable and explainable across progress updates.
- Physical, digital, and audiobook sections share the same override and fixed-slot semantics; only their unit conversion differs.
- JSON persistence stores both BaselineSchedule and deadline_override, and loading/recalculation reapplies persisted overrides before consumers read the schedule.
- Deadline overrides are respected consistently in the plan table, remaining-plan view, and session targets.
- A group member can be independently scheduled without destroying the shared schedule of the remaining group.
- Explicit recalculation remains the operation that creates a new baseline commitment.
- Desktop and Android implementations must preserve these semantics when sharing the persisted schema.
- Tests must cover ordinary schedules, overrides, group detachment, session targets, rest days, and JSON round trips.
