package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;

import static com.petermolnar.readingplan.PlanPrimitives.completedUnits;
import static com.petermolnar.readingplan.PlanPrimitives.isAudiobookSection;
import static com.petermolnar.readingplan.PlanPrimitives.totalUnits;

/** Daily-history forecast; see docs/reading-projections.md for assumptions and limits. */
final class ReadingProjection {
    static final int MIN_OBSERVATION_DAYS = 7;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM");
    private static final DateTimeFormatter DATE_WITH_YEAR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    final int completed;
    final int total;
    final int observationDays;
    final double pace;
    final double variance;
    final boolean rangeAvailable;
    final LocalDate projectedDeadline;
    final LocalDate earliestDeadline;
    final LocalDate latestDeadline;
    final LocalDate horizon;
    private final LocalDate today;
    private final NavigableMap<LocalDate, Integer> positions = new TreeMap<>();
    private final double criticalValue;

    ReadingProjection(ReadingPlanCalendar calendar, Book book, String sectionLabel, LocalDate today) {
        this.today = today;
        total = totalUnits(book, sectionLabel);
        boolean futureSessions = false;
        for (ReadingSession session : book.readingSessions) {
            if (session.deleted) continue;
            if (session.date.isAfter(today)) {
                futureSessions = true;
                continue;
            }
            int units = session.currentPage - book.startPage + (isAudiobookSection(sectionLabel) ? 0 : 1);
            positions.merge(session.date, Math.max(0, Math.min(total, units)), Math::max);
        }
        int previous = 0;
        for (Map.Entry<LocalDate, Integer> entry : positions.entrySet()) {
            previous = Math.max(previous, entry.getValue());
            entry.setValue(previous);
        }
        // A future-dated log must not move today's forecast anchor into the future.
        completed = Math.max(0, Math.min(total,
                futureSessions ? previous : Math.max(previous, completedUnits(book, sectionLabel))));

        int count = 0;
        double mean = 0.0;
        double squaredDifferences = 0.0;
        if (!positions.isEmpty()) {
            previous = positions.firstEntry().getValue();
            // The first day's position is a baseline, not evidence of one enormous reading day.
            for (LocalDate date = positions.firstKey().plusDays(1); date.isBefore(today); date = date.plusDays(1)) {
                int position = positions.getOrDefault(date, previous);
                int amount = position - previous;
                previous = position;
                if (!calendar.isRestDay(date) || amount > 0) {
                    count++;
                    double difference = amount - mean;
                    mean += difference / count;
                    squaredDifferences += difference * (amount - mean);
                }
            }
        }
        observationDays = count;
        pace = mean;
        variance = count < 2 ? 0.0 : Math.max(0.0, squaredDifferences / (count - 1));
        rangeAvailable = completed < total && pace > 0.0 && count >= MIN_OBSERVATION_DAYS;
        criticalValue = rangeAvailable ? studentT80(count - 1) : 0.0;

        // ponytail: bound remote forecasts to ten years; revisit with a zoomable chart if needed.
        horizon = today.plusYears(10);
        LocalDate central = completed >= total ? today : null;
        LocalDate earliest = null;
        LocalDate latest = null;
        boolean finiteLatest = rangeAvailable && pace > criticalValue * Math.sqrt(variance / observationDays);
        int readingDays = 0;
        if (pace > 0.0 && completed < total) {
            for (LocalDate date = today.plusDays(1); !date.isAfter(horizon); date = date.plusDays(1)) {
                if (calendar.isRestDay(date)) continue;
                readingDays++;
                if (central == null && centralAt(readingDays) >= total) central = date;
                if (rangeAvailable) {
                    if (earliest == null && upperAt(readingDays) >= total) earliest = date;
                    if (finiteLatest && latest == null && lowerAt(readingDays) >= total) latest = date;
                }
                if (central != null && (!rangeAvailable || (earliest != null && (!finiteLatest || latest != null)))) break;
            }
        }
        projectedDeadline = central;
        earliestDeadline = earliest;
        latestDeadline = latest;
    }

    int progressOn(LocalDate date) {
        if (!date.isBefore(today)) return completed;
        Map.Entry<LocalDate, Integer> entry = positions.floorEntry(date);
        return entry == null ? 0 : entry.getValue();
    }

    int centralAt(int readingDays) {
        return pace > 0.0 || completed >= total ? progressAt(readingDays, 0) : -1;
    }

    int lowerAt(int readingDays) {
        return rangeAvailable ? progressAt(readingDays, -1) : -1;
    }

    int upperAt(int readingDays) {
        return rangeAvailable ? progressAt(readingDays, 1) : -1;
    }

    private int progressAt(int readingDays, int direction) {
        // Predict future daily variation AND uncertainty about the learned mean, not just a confidence interval for pace.
        double width = criticalValue * Math.sqrt(variance
                * (readingDays + (double) readingDays * readingDays / Math.max(1, observationDays)));
        double units = Math.max(completed, Math.min(total, completed + pace * readingDays + direction * width));
        if (units >= total - 1e-9) return total;
        // Integer display rounding must not claim completion before the underlying forecast does.
        return Math.min(total - 1, (int) (direction > 0 ? Math.ceil(units - 1e-9) : Math.floor(units + 1e-9)));
    }

    private static double studentT80(int degreesOfFreedom) {
        // Cornish-Fisher approximation to t(0.90), used only with >= 6 degrees of freedom.
        double z = 1.2815515655446004;
        double z2 = z * z;
        double df = degreesOfFreedom;
        return z + z * (z2 + 1) / (4 * df)
                + z * (5 * z2 * z2 + 16 * z2 + 3) / (96 * df * df)
                + z * (3 * z2 * z2 * z2 + 19 * z2 * z2 + 17 * z2 - 15) / (384 * df * df * df);
    }

    String projectionLabel() {
        String date = projectedDeadline == null ? (pace > 0.0 ? "beyond 10 years" : "—") : formatDate(projectedDeadline);
        return "Projection · est. end date: " + date;
    }

    String rangeLabel() {
        if (completed >= total) return "Book finished — no future uncertainty";
        String prefix = "Estimated finish range: ";
        if (observationDays < MIN_OBSERVATION_DAYS) {
            return prefix + "Not enough history (" + observationDays + "/" + MIN_OBSERVATION_DAYS + " reading days)";
        }
        if (pace <= 0.0) return prefix + "Not enough reading progress";
        if (earliestDeadline == null) return prefix + "beyond 10-year forecast horizon";
        if (latestDeadline == null) {
            return prefix + formatDate(earliestDeadline) + " onward; latest finish uncertain";
        }
        return prefix + formatDate(earliestDeadline) + "–" + formatDate(latestDeadline);
    }

    private String formatDate(LocalDate date) {
        return date.format(date.getYear() == today.getYear() ? DATE : DATE_WITH_YEAR);
    }
}
