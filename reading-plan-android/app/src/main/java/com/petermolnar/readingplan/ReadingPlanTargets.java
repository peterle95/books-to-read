package com.petermolnar.readingplan;

import java.time.LocalDate;

import static com.petermolnar.readingplan.BookCollections.sectionPlanByLabel;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingPlanTargets {
    private final MainActivity activity;

    ReadingPlanTargets(MainActivity activity) {
        this.activity = activity;
    }

    SessionTarget sessionTarget(String sectionLabel, Book book, LocalDate targetDate) {
        PlanSummary summary = activity.buildRemainingPlans();
        SectionPlan sectionPlan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
        BookDeadline deadline = deadlineForBook(sectionPlan, book);
        if (deadline == null) {
            throw new IllegalArgumentException("no target available");
        }
        String target = targetDisplayValue(
                sectionLabel,
                book,
                targetUnitsForDate(book, sectionLabel, deadline, targetDate)
        );
        return new SessionTarget(target, sessionDailyPaceValue(sectionLabel, deadline.dailyPages));
    }

    private static BookDeadline deadlineForBook(SectionPlan sectionPlan, Book book) {
        for (BookDeadline deadline : sectionPlan.deadlines) {
            if (deadline.book == book) {
                return deadline;
            }
        }
        return null;
    }

    private int targetUnitsForDate(Book book, String sectionLabel, BookDeadline deadline, LocalDate targetDate) {
        int total = totalUnits(book, sectionLabel);
        int completed = completedUnits(book, sectionLabel);
        if (unitsRemaining(book, sectionLabel) <= 0 || targetDate.isAfter(deadline.deadline)) {
            return total;
        }
        if (targetDate.isBefore(deadline.startDate) || deadline.dailyPages <= 0) {
            return completed;
        }

        LocalDate paceStart = deadline.startDate;
        if (book.currentPage != null && LocalDate.now().isAfter(paceStart)) {
            paceStart = LocalDate.now();
        }
        if (targetDate.isBefore(paceStart)) {
            return completed;
        }

        LocalDate activeDate = targetDate.isAfter(deadline.deadline) ? deadline.deadline : targetDate;
        int elapsedDays = activity.availableReadingDaysCount(paceStart, activeDate);
        int scheduledUnits = (int) Math.ceil(deadline.dailyPages * elapsedDays - 1e-9);
        return Math.min(Math.max(completed + scheduledUnits, completed), total);
    }

    String todayTargetValue(String sectionLabel, BookDeadline deadline) {
        LocalDate today = LocalDate.now();
        if (today.isBefore(deadline.startDate)
                || today.isAfter(deadline.deadline)
                || activity.isRestDay(today)) {
            return isAudiobookSection(sectionLabel) ? formatDuration(0) : "0";
        }
        if (!isAudiobookSection(sectionLabel)) {
            LocalDate paceStart = deadline.startDate;
            if (deadline.book.currentPage != null && today.isAfter(paceStart)) {
                paceStart = today;
            }
            if (!today.isBefore(paceStart) && deadline.dailyPages > 0) {
                return String.valueOf(roundedUpPageTarget(deadline.dailyPages));
            }
        }
        int todayTarget = targetUnitsForDate(deadline.book, sectionLabel, deadline, today);
        int yesterdayTarget = targetUnitsForDate(deadline.book, sectionLabel, deadline, today.minusDays(1));
        int targetUnits = Math.max(todayTarget - yesterdayTarget, 0);
        return isAudiobookSection(sectionLabel) ? formatDuration(targetUnits) : String.valueOf(targetUnits);
    }

    boolean markTargetCompletedIfReached(
            Book book, String sectionLabel, String dateText, String inputText
    ) {
        try {
            LocalDate targetDate = parseDate(dateText);
            if (!targetDate.equals(LocalDate.now()) || inputText.isEmpty()) {
                return isTargetCompleteToday(book);
            }
            int currentPage = isAudiobookSection(sectionLabel)
                    ? currentTimeFromRemaining(book, parseDuration(inputText))
                    : Integer.parseInt(inputText);
            if (!targetReached(book, sectionLabel, targetDate, currentPage)) {
                return false;
            }
            if (!isTargetCompleteToday(book)) {
                book.targetCompletedDate = targetDate.toString();
                activity.autosaveJson("Today's target completed");
            }
            return true;
        } catch (IllegalArgumentException ex) {
            return isTargetCompleteToday(book);
        }
    }

    boolean targetReached(Book book, String sectionLabel, LocalDate targetDate, int currentPage) {
        if (!targetDate.equals(LocalDate.now())) {
            return false;
        }
        PlanSummary summary = activity.buildRemainingPlans();
        BookDeadline deadline = deadlineForBook(
                sectionPlanByLabel(summary.sectionPlans, sectionLabel), book
        );
        if (deadline == null) {
            return false;
        }
        int completed = completedUnits(book, sectionLabel);
        int target = targetUnitsForDate(book, sectionLabel, deadline, targetDate);
        int currentUnits = isAudiobookSection(sectionLabel)
                ? currentPage - book.startPage
                : currentPage - book.startPage + 1;
        return target > completed && currentUnits >= target;
    }

    boolean isTargetCompleteToday(Book book) {
        return LocalDate.now().toString().equals(book.targetCompletedDate);
    }

    private static String targetDisplayValue(String sectionLabel, Book book, int targetUnits) {
        if (isAudiobookSection(sectionLabel)) {
            return formatDuration(Math.max(totalUnits(book, sectionLabel) - targetUnits, 0));
        }
        if (targetUnits <= 0) {
            return String.valueOf(book.startPage);
        }
        return String.valueOf(book.startPage + targetUnits - 1);
    }

    private static String sessionDailyPaceValue(String sectionLabel, double dailyPages) {
        return isAudiobookSection(sectionLabel) ? formatDuration(dailyPages) : String.valueOf(roundedUpPageTarget(dailyPages));
    }
}
