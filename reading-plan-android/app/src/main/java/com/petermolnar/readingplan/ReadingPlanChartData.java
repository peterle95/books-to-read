package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

import static com.petermolnar.readingplan.PlanPrimitives.totalUnits;

final class ReadingPlanChartData {
    final String sectionLabel;
    final Book book;
    final LocalDate startDate;
    final LocalDate plannedDeadline;
    final LocalDate projectedDeadline;
    final LocalDate deadline;
    final List<LocalDate> dates = new ArrayList<>();
    final List<Integer> plannedPages = new ArrayList<>();
    final List<Integer> actualPages = new ArrayList<>();
    final List<Integer> dailyTargetPages = new ArrayList<>();
    final List<Integer> projectionPages = new ArrayList<>();
    final List<Integer> projectionLowerPages = new ArrayList<>();
    final List<Integer> projectionUpperPages = new ArrayList<>();
    final ReadingProjection projection;
    final double actualPace;
    final int todayIndex;
    final int yMax;
    final int dailyYMax;

    ReadingPlanChartData(MainActivity activity, String sectionLabel, Book book, BookDeadline deadline) {
        this(new ReadingPlanCalendar(activity), sectionLabel, book, deadline, LocalDate.now());
    }

    ReadingPlanChartData(
            ReadingPlanCalendar calendar, String sectionLabel, Book book, BookDeadline deadline, LocalDate today
    ) {
        this.sectionLabel = sectionLabel;
        this.book = book;
        BaselineSchedule baseline = book.baselineSchedule;
        this.startDate = baseline == null ? deadline.startDate : baseline.startDate;
        this.plannedDeadline = baseline == null ? deadline.deadline : baseline.deadline;
        double dailyTarget = baseline == null ? deadline.dailyPages : baseline.dailyTarget;

        int plannedMaximum = 0;
        int actualMaximum = 0;
        int dailyMaximum = 0;
        int readingDays = 0;
        projection = new ReadingProjection(calendar, book, sectionLabel, today);
        this.actualPace = projection.pace;
        this.projectedDeadline = projection.projectedDeadline;
        LocalDate chartDeadline = projectedDeadline == null || this.plannedDeadline.isAfter(projectedDeadline)
                ? this.plannedDeadline
                : projectedDeadline;
        if (chartDeadline.isBefore(today)) {
            chartDeadline = today;
        }
        if (projection.latestDeadline != null && projection.latestDeadline.isAfter(chartDeadline)) {
            chartDeadline = projection.latestDeadline;
        }
        if (projectedDeadline == null && actualPace > 0.0) chartDeadline = projection.horizon;
        this.deadline = chartDeadline;
        LocalDate chartStart = startDate.isAfter(today) && projection.centralAt(0) >= 0 ? today : startDate;
        int targetDaysRemaining = calendar.availableReadingDaysCount(startDate, this.plannedDeadline);
        Map<LocalDate, Integer> dailyReading = new HashMap<>();
        for (ReadingSession session : book.readingSessions) {
            if (!session.deleted && session.date.isBefore(today)) {
                dailyReading.merge(session.date, Math.max(0, session.pagesRead), Integer::sum);
            }
        }
        int projectedReadingDays = 0;
        for (LocalDate date = chartStart; !date.isAfter(this.deadline); date = date.plusDays(1)) {
            dates.add(date);
            if (!date.isBefore(startDate) && !calendar.isRestDay(date)) {
                readingDays++;
            }
            int planned = Math.min(
                    totalUnits(book, sectionLabel),
                    date.isAfter(this.plannedDeadline)
                            ? totalUnits(book, sectionLabel)
                            : (int) Math.ceil(dailyTarget * readingDays - 1e-9)
            );
            plannedPages.add(planned);
            int actual = projection.progressOn(date);
            actualPages.add(actual);
            int dailyTargetForDate = 0;
            if (date.isAfter(this.plannedDeadline)) {
                dailyTargetForDate = -1; // End the series, rather than draw a zero line beyond the deadline.
            } else if (date.isBefore(today)) {
                dailyTargetForDate = dailyReading.getOrDefault(date, 0);
            } else if (!date.isBefore(startDate) && !calendar.isRestDay(date)) {
                int remaining = Math.max(totalUnits(book, sectionLabel) - actual, 0);
                dailyTargetForDate = targetDaysRemaining == 0
                        ? 0
                        : (int) Math.ceil((double) remaining / targetDaysRemaining - 1e-9);
            }
            dailyTargetPages.add(dailyTargetForDate);
            // With no further progress, the same remaining work must fit into fewer reading days.
            if (!date.isBefore(startDate)
                    && !date.isAfter(this.plannedDeadline) && !calendar.isRestDay(date)) targetDaysRemaining--;
            if (date.isAfter(today) && !calendar.isRestDay(date)) projectedReadingDays++;
            projectionPages.add(date.isBefore(today) ? -1 : projection.centralAt(projectedReadingDays));
            projectionLowerPages.add(date.isBefore(today) ? -1 : projection.lowerAt(projectedReadingDays));
            projectionUpperPages.add(date.isBefore(today) ? -1 : projection.upperAt(projectedReadingDays));
            plannedMaximum = Math.max(plannedMaximum, planned);
            actualMaximum = Math.max(actualMaximum, actual);
            dailyMaximum = Math.max(dailyMaximum, dailyTargetForDate);
        }
        int dayOffset = (int) ChronoUnit.DAYS.between(chartStart, today);
        todayIndex = ReadingPlanCalendar.clamp(dayOffset, 0, Math.max(dates.size() - 1, 0));
        yMax = Math.max(1, Math.max(totalUnits(book, sectionLabel), Math.max(plannedMaximum, actualMaximum)));
        dailyYMax = Math.max(1, dailyMaximum);
    }

    String projectionLabel() {
        return projection.projectionLabel();
    }

    String projectionRangeLabel() {
        return projection.rangeLabel();
    }
}
