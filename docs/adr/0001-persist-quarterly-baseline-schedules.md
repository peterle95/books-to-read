# Persist quarterly baseline schedules

Reading plans will persist their calculated per-book schedules instead of recalculating them from the current date and progress. This preserves the original quarterly commitment while allowing the app to show a separate current required pace; explicit structural recalculation creates a new baseline, and progress history is preserved.

## Consequences

- Desktop and Android must share the persisted schedule schema.
- Existing plans without schedules need a one-time migration that preserves reading sessions.
- Plan-wide rest days are part of the schedule inputs and are excluded from available reading days.
- Individual deadline overrides recalculate only the affected book or simultaneous group; an overridden group member becomes independently scheduled.
