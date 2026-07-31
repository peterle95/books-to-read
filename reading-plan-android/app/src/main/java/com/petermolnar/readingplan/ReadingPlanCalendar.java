package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

final class ReadingPlanCalendar {
    private final MainActivity activity;

    ReadingPlanCalendar(MainActivity activity) {
        this.activity = activity;
    }

    static LocalDate nextQuarterStart(LocalDate today) {
        for (int month : new int[]{1, 4, 7, 10}) {
            LocalDate candidate = LocalDate.of(today.getYear(), month, 1);
            if (candidate.isAfter(today)) {
                return candidate;
            }
        }
        return LocalDate.of(today.getYear() + 1, 1, 1);
    }

    static LocalDate periodEndFromStart(LocalDate start) {
        return start.plusMonths(3).minusDays(1);
    }

    boolean isRestDay(LocalDate value) {
        for (RestDayRange range : activity.restDays) {
            if (!value.isBefore(range.startDate) && !value.isAfter(range.endDate)) {
                return true;
            }
        }
        return false;
    }

    List<LocalDate> availableReadingDays(LocalDate start, LocalDate end) {
        List<LocalDate> dates = new ArrayList<>();
        for (LocalDate current = start; !current.isAfter(end); current = current.plusDays(1)) {
            if (!isRestDay(current)) {
                dates.add(current);
            }
        }
        return dates;
    }

    int availableReadingDaysCount(LocalDate start, LocalDate end) {
        return availableReadingDays(start, end).size();
    }

    void normalizeRestDayRanges() {
        activity.restDays.sort((left, right) -> left.startDate.compareTo(right.startDate));
        List<RestDayRange> merged = new ArrayList<>();
        for (RestDayRange range : activity.restDays) {
            if (merged.isEmpty()
                    || range.startDate.isAfter(merged.get(merged.size() - 1).endDate.plusDays(1))) {
                merged.add(range);
            } else {
                RestDayRange previous = merged.remove(merged.size() - 1);
                merged.add(new RestDayRange(
                        previous.startDate,
                        previous.endDate.isAfter(range.endDate) ? previous.endDate : range.endDate
                ));
            }
        }
        activity.restDays.clear();
        activity.restDays.addAll(merged);
    }

    static int inclusiveDaysBetween(LocalDate start, LocalDate end) {
        return (int) ChronoUnit.DAYS.between(start, end) + 1;
    }

    LocalDate effectiveRemainingStartDate(LocalDate start, LocalDate end, LocalDate today) {
        LocalDate candidate;
        if (today.isBefore(start)) {
            candidate = start;
        } else if (today.isAfter(end)) {
            candidate = end;
        } else {
            candidate = today;
        }
        for (LocalDate readingDay : availableReadingDays(candidate, end)) {
            return readingDay;
        }
        return end;
    }

    static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }
}
