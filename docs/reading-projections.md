# Android reading projections

Charts show a central reading projection and, when supported by the book's
history, one translucent approximate 80% prediction range. The legend retains
**Projection · est. end date** and adds **Estimated finish range**. The existing
projection toggle controls the line, shading, and both labels together.

The percentage is an internal model target, not part of the finish-range label.
The chart uses the space of the removed explanatory footer for a taller plot;
only compact schedule/pace details remain beneath it.

This is an Android-only view of recorded reading behavior. It does not change
baseline schedules, current required pace, rest days, or the shared storage format.
Physical and digital books use pages; audiobooks use seconds.

## Observations

- Use the book's whole recorded history, including earlier quarters and reading
  before the scheduled start. Ignore deleted and future-dated sessions.
- Combine same-day sessions into their final cumulative position. Session order
  and the number of logs within a day do not increase the observation count.
- The first recorded day's final position is the initial observation, not an
  assumption that all preceding pages were read on that day. Measure daily
  progress starting on the following day.
- Estimate pace and variability from completed days only. Today's recorded
  progress anchors every forecast curve, but today's unfinished reading amount
  is not an observation of a full day's pace.
- A non-rest day without a log contributes zero. Exclude saved rest days without
  reading; retain actual reading on rest days as daily observations.
- Use all saved rest-day information that is available. Older rest days removed
  during quarter rollover cannot be reconstructed. No log cannot be distinguished
  from reading that was not recorded.

The central estimate uses mean daily progress as soon as a positive pace can be
measured. A first-day-only history cannot establish a pace. The range requires at
least **seven completed observation days** and positive mean progress. Otherwise
the legend explains that there is not enough history or reading progress.

## Deterministic prediction range

For `n` observed days, mean daily progress `m`, sample variance `s²`, current
completed work `c`, and `h` future reading days:

```text
central progress = c + m × h
half-width       = t(0.90, n − 1) × s × sqrt(h + h² / n)
lower / upper    = central progress ± half-width
```

The Student-t critical value uses a Cornish–Fisher approximation, only with at
least six degrees of freedom. There are no random draws, arbitrary percentage
margins, or simulated reading sessions. Identical input produces identical output.

The `h` term represents future day-to-day variation; `h² / n` represents uncertainty
about the learned mean. Comparable additional observations generally narrow the
range at a fixed forecast horizon, but new irregular behavior can widen it.
Future variation does not disappear merely because more history exists.

This is an **approximate pointwise prediction range**, assuming independent daily
amounts with sufficiently stable, roughly normal behavior. Daily amounts can be
skewed or correlated, so 80% is a model target, not measured or guaranteed coverage.
The model cannot anticipate a changed reading habit. If recorded daily amounts
are identical, the measured variance is zero and the band collapses; that is not
a guarantee that future behavior will remain identical.

## Curves and finish dates

- Start all forecast curves at today's recorded progress. Add forecast work only
  on subsequent non-rest days; future rest days produce flat segments.
- Clip to current progress through the book's total work: no projected loss of
  progress, negative pages, or reading beyond completion. Clipping can make the
  area asymmetric around its central line.
- Display integer units with the central/lower curve rounded down and the upper
  curve rounded up, without claiming full completion before the underlying
  curve reaches the total.
- The central finish date is the first date the central curve reaches completion.
  The earliest/latest dates are the first completion dates of the upper/lower
  curves respectively. Thus the displayed dates agree with the plotted curves.
  This inverted window is an estimated finish range, not a separately validated
  80% completion-date interval.
- If the lower curve cannot reach completion at a positive long-run rate, show
  the earliest date and **latest finish uncertain** rather than invent a deadline.
- Bound calculation and drawing to a ten-year future horizon. Explicitly label
  estimates beyond that horizon rather than hanging or fabricating a date.
- Extend the chart through a finite latest estimate. When the latest finish is
  uncertain, keep the central/planned horizon. Extending for the range alone must
  not change the planned-progress or daily-target calculations.
- Finished books have no future uncertainty. Keep the existing central completed
  state at today, and label the book finished rather than drawing a range.
- Include the year when a projected date falls outside the current year. Wrap
  both legend labels on narrow phones; expose both to accessibility services.

## Daily reading and required pace (right axis)

The **Read / required** line uses pages/day (or time/day for audiobooks):

- Before today, show the sum of recorded reading sessions for each date. Ignore
  deleted sessions; dates without reading show zero. Retain actual reading on
  historical rest days.
- Today, show remaining work divided by the reading days through the deadline,
  rounded up to a whole page (or second).
- After today, assume no further progress. Keep today's remaining work fixed and
  divide it by the reading days left at each future date. Required pace therefore
  rises as reading days pass. Future-dated sessions do not reduce this amount.
- Today and future rest days show zero. End the line at the deadline; do not draw
  a zero line after it or extend it to the estimated finish date.

This no-progress scenario is separate from the reading projection, which assumes
continued reading based on recorded history. Neither changes the baseline schedule.

## Checks

From `reading-plan-android`:

```powershell
.\gradlew.bat :app:checkChartProjection :app:checkQuarterPlanning
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest
```

The standalone chart check covers observation construction, deterministic bands,
learning versus variability, rest days, unit offsets, finish/boundary consistency,
insufficient history, open-ended/remote forecasts, and schedule isolation. The
native device check additionally verifies filled-area rendering, wrapped legends,
accessibility, the toggle, and book selection. Run it only on a disposable emulator
using the instructions in `reading-plan-android/README.md`.
