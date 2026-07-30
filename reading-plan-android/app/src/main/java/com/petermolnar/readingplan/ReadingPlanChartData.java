package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static com.petermolnar.readingplan.PlanPrimitives.completedUnits;
import static com.petermolnar.readingplan.PlanPrimitives.isAudiobookSection;
import static com.petermolnar.readingplan.PlanPrimitives.totalUnits;

final class ReadingPlanChartData {
    final String sectionLabel;
    final Book book;
    final LocalDate startDate;
    final LocalDate plannedDeadline;
    final LocalDate deadline;
    final List<LocalDate> dates = new ArrayList<>();
    final List<Integer> plannedPages = new ArrayList<>();
    final List<Integer> actualPages = new ArrayList<>();
    final List<Integer> dailyTargetPages = new ArrayList<>();
    final List<Integer> projectionPages = new ArrayList<>();
    final double actualPace;
    final int todayIndex;
    final int yMax;
    final int dailyYMax;

    ReadingPlanChartData(MainActivity activity, String sectionLabel, Book book, BookDeadline deadline) {
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
        int sessionActual = 0;
        LocalDate today = LocalDate.now();
        this.actualPace = actualReadingPace(activity, book, sectionLabel, today);
        LocalDate projectedDeadline = projectedCompletionDate(activity, book, sectionLabel, today, actualPace);
        LocalDate chartDeadline = this.plannedDeadline.isAfter(projectedDeadline)
                ? this.plannedDeadline
                : projectedDeadline;
        if (chartDeadline.isBefore(today)) {
            chartDeadline = today;
        }
        this.deadline = chartDeadline;
        for (LocalDate date = startDate; !date.isAfter(this.deadline); date = date.plusDays(1)) {
            dates.add(date);
            if (!activity.isRestDay(date)) {
                readingDays++;
            }
            int planned = Math.min(
                    totalUnits(book, sectionLabel),
                    date.isAfter(this.plannedDeadline)
                            ? totalUnits(book, sectionLabel)
                            : (int) Math.ceil(dailyTarget * readingDays - 1e-9)
            );
            plannedPages.add(planned);
            for (ReadingSession session : book.readingSessions) {
                if (!session.date.isAfter(date)) {
                    sessionActual = Math.max(
                            sessionActual,
                            isAudiobookSection(sectionLabel)
                                    ? session.currentPage - book.startPage
                                    : session.currentPage - book.startPage + 1
                    );
                }
            }
            int actual = sessionActual;
            if (!date.isBefore(today) && book.currentPage != null) {
                actual = Math.max(actual, completedUnits(book, sectionLabel));
            }
            actual = Math.min(Math.max(actual, 0), totalUnits(book, sectionLabel));
            actualPages.add(actual);
            int dailyTargetForDate = 0;
            if (!activity.isRestDay(date) && !date.isAfter(this.plannedDeadline)) {
                int daysRemaining = activity.availableReadingDaysCount(date, this.deadline);
                int progress = !date.isBefore(today) && book.currentPage != null
                        ? completedUnits(book, sectionLabel)
                        : sessionActual;
                int remaining = Math.max(totalUnits(book, sectionLabel) - progress, 0);
                dailyTargetForDate = daysRemaining == 0
                        ? 0
                        : (int) Math.ceil((double) remaining / daysRemaining - 1e-9);
            }
            dailyTargetPages.add(dailyTargetForDate);
            int projected = -1;
            if (!date.isBefore(today) && actualPace > 0.0) {
                int projectedReadingDays = activity.availableReadingDaysCount(today, date);
                projected = Math.min(
                        totalUnits(book, sectionLabel),
                        completedUnits(book, sectionLabel)
                                + (int) Math.ceil(actualPace * projectedReadingDays - 1e-9)
                );
            }
            projectionPages.add(projected);
            plannedMaximum = Math.max(plannedMaximum, planned);
            actualMaximum = Math.max(actualMaximum, actual);
            dailyMaximum = Math.max(dailyMaximum, dailyTargetForDate);
        }
        int dayOffset = (int) ChronoUnit.DAYS.between(startDate, today);
        todayIndex = MainActivity.clamp(dayOffset, 0, Math.max(dates.size() - 1, 0));
        yMax = Math.max(1, Math.max(totalUnits(book, sectionLabel), Math.max(plannedMaximum, actualMaximum)));
        dailyYMax = Math.max(1, dailyMaximum);
    }

    private static double actualReadingPace(MainActivity activity, Book book, String sectionLabel, LocalDate today) {
        if (book.readingSessions.isEmpty() || completedUnits(book, sectionLabel) <= 0) {
            return 0.0;
        }
        LocalDate firstSession = book.readingSessions.get(0).date;
        for (ReadingSession session : book.readingSessions) {
            if (session.date.isBefore(firstSession)) {
                firstSession = session.date;
            }
        }
        int elapsedReadingDays = activity.availableReadingDaysCount(firstSession, today);
        return elapsedReadingDays <= 0 ? 0.0 : (double) completedUnits(book, sectionLabel) / elapsedReadingDays;
    }

    private static LocalDate projectedCompletionDate(
            MainActivity activity, Book book, String sectionLabel, LocalDate today, double pace
    ) {
        int total = totalUnits(book, sectionLabel);
        int completed = completedUnits(book, sectionLabel);
        if (pace <= 0.0 || completed >= total) {
            return today;
        }
        int readingDays = 0;
        LocalDate date = today;
        while (completed + (int) Math.ceil(pace * readingDays - 1e-9) < total) {
            if (!activity.isRestDay(date)) {
                readingDays++;
            }
            date = date.plusDays(1);
        }
        return date.minusDays(1);
    }
}
