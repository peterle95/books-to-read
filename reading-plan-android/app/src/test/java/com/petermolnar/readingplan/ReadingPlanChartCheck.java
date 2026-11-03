package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Standalone chart regression checks; run with java -ea (no test framework required). */
public final class ReadingPlanChartCheck {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);

    public static void main(String[] args) {
        checkForecastAndFinishRange();
        checkObservationRules();
        checkRestDaysAndUnits();
        checkUncertaintyLearning();
        checkUnavailableAndCompleted();
        checkCalendarAndScheduleIsolation();
        checkDeadlineRequiredPace();
        System.out.println("Chart projection checks passed: daily observations, deterministic 80% bands, learning, "
                + "matching finish ranges, rest days, units, sparse/deleted/future history, bounded horizons, schedules.");
    }

    private static void checkForecastAndFinishRange() {
        ReadingPlanChartData chart = chart(pageBook(), MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert chart.actualPages.get(chart.todayIndex) == 63;
        assert chart.projectionPages.get(chart.todayIndex + 1) == 69;
        assert chart.projection.observationDays == 7 && chart.actualPace == 6.0;
        assert Math.abs(chart.projection.variance - 4.0) < 1e-9;
        assertFinish(chart, TODAY.plusDays(10), "Projection · est. end date: 11/10");
        assert chart.projection.earliestDeadline.equals(TODAY.plusDays(8));
        assert chart.projection.latestDeadline.equals(TODAY.plusDays(13));
        assert chart.deadline.equals(chart.projection.latestDeadline);
        assert chart.projectionRangeLabel().equals("Estimated finish range: 09/10–14/10");
        assertFirstCompletion(chart, chart.projectionUpperPages, chart.projection.earliestDeadline);
        assertFirstCompletion(chart, chart.projectionLowerPages, chart.projection.latestDeadline);
        assertShape(chart);

        ReadingPlanChartData repeated = chart(pageBook(), MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert chart.projectionPages.equals(repeated.projectionPages);
        assert chart.projectionLowerPages.equals(repeated.projectionLowerPages);
        assert chart.projectionUpperPages.equals(repeated.projectionUpperPages) : "Forecasts must not use randomness";

        Book slow = history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 17, 15, new int[]{1, 0, 0, 0, 0, 0, 0}, 0);
        ReadingPlanChartData fractional = chart(slow, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assertFinish(fractional, TODAY.plusDays(7), "Projection · est. end date: 08/10");
        assert fractional.projectionPages.get(fractional.todayIndex + 1) == 16
                : "Rounding must not claim the final page was read before the mean forecast reaches it";
    }

    private static void checkObservationRules() {
        Book book = pageBook();
        ReadingPlanChartData original = chart(book, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        book.readingSessions.add(new ReadingSession(TODAY.minusDays(7), 17, 2));
        book.readingSessions.add(new ReadingSession("deleted", TODAY.minusDays(100), 100, 100, true));
        Collections.reverse(book.readingSessions);
        ReadingPlanChartData split = chart(book, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert split.projection.observationDays == 7 : "Same-day sessions must not inflate the sample count";
        assert split.actualPace == original.actualPace;
        assert split.projectionLowerPages.equals(original.projectionLowerPages);

        book.readingSessions.add(new ReadingSession(TODAY.plusDays(1), book.endPage, 57));
        book.currentPage = book.endPage;
        ReadingPlanChartData future = chart(book, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert future.projection.completed == 63 : "Future logs must not leak into today's progress";
        assert future.projectionPages.equals(original.projectionPages);
        assert future.actualPages.equals(original.actualPages);

        Book highInitialPosition = history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 10000, 200,
                new int[]{4, 8, 4, 8, 4, 8, 6}, 100);
        ReadingPlanChartData high = chart(highInitialPosition, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert high.actualPace == 6.0 && high.projection.variance == 4.0
                : "The first recorded position and today's unfinished day are not daily-rate observations";
        assert high.projection.completed == 342;

        Book deleted = pageBook();
        deleted.readingSessions.get(2).deleted = true;
        Book removed = pageBook();
        removed.readingSessions.remove(2);
        assert chart(deleted, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>()).projectionUpperPages.equals(
                chart(removed, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>()).projectionUpperPages);
    }

    private static void checkRestDaysAndUnits() {
        List<RestDayRange> rests = Arrays.asList(new RestDayRange(TODAY.plusDays(2), TODAY.plusDays(3)));
        ReadingPlanChartData chart = chart(pageBook(), MainActivity.PHYSICAL_BOOKS_LABEL, rests);
        assertFinish(chart, TODAY.plusDays(12), "Projection · est. end date: 13/10");
        assert chart.projection.earliestDeadline.equals(TODAY.plusDays(10));
        assert chart.projection.latestDeadline.equals(TODAY.plusDays(15));
        for (List<Integer> series : Arrays.asList(chart.projectionPages, chart.projectionLowerPages, chart.projectionUpperPages)) {
            assert series.get(chart.todayIndex + 1).equals(series.get(chart.todayIndex + 2));
            assert series.get(chart.todayIndex + 2).equals(series.get(chart.todayIndex + 3));
        }
        assertShape(chart);

        ReadingPlanChartData todayRest = chart(pageBook(), MainActivity.DIGITAL_BOOKS_LABEL,
                Arrays.asList(new RestDayRange(TODAY, TODAY)));
        assertFinish(todayRest, TODAY.plusDays(10), "Projection · est. end date: 11/10");

        Book restingHistory = history(MainActivity.PHYSICAL_BOOKS_LABEL, 1, 120, 15,
                new int[]{4, 0, 8, 4, 8, 4, 8, 6}, 6);
        ReadingPlanChartData historical = chart(restingHistory, MainActivity.PHYSICAL_BOOKS_LABEL,
                Arrays.asList(new RestDayRange(TODAY.minusDays(8), TODAY.minusDays(7))));
        assert historical.projection.observationDays == 7 && historical.actualPace == 6.0
                : "Retain reading on a rest day but exclude rest days without reading";

        Book offset = history(MainActivity.PHYSICAL_BOOKS_LABEL, 101, 120, 15, new int[]{4, 8, 4, 8, 4, 8, 6}, 6);
        assert chart(offset, MainActivity.PHYSICAL_BOOKS_LABEL, new ArrayList<>()).projectionPages.equals(
                chart(pageBook(), MainActivity.PHYSICAL_BOOKS_LABEL, new ArrayList<>()).projectionPages);
        Book audio = history(MainActivity.AUDIOBOOKS_LABEL, 100, 1200, 150,
                new int[]{40, 80, 40, 80, 40, 80, 60}, 60);
        ReadingPlanChartData audioChart = chart(audio, MainActivity.AUDIOBOOKS_LABEL, rests);
        assert audioChart.projection.completed == 630 && audioChart.actualPace == 60;
        assertFinish(audioChart, TODAY.plusDays(12), "Projection · est. end date: 13/10");
        assert audioChart.projection.latestDeadline.equals(TODAY.plusDays(15));
        assertShape(audioChart);
    }

    private static void checkUncertaintyLearning() {
        ReadingProjection shortHistory = forecast(new int[]{4, 8, 4, 8, 4, 8, 6});
        int[] longer = new int[28];
        for (int index = 0; index < longer.length; index++) longer[index] = new int[]{4, 8, 4, 8, 4, 8, 6}[index % 7];
        ReadingProjection longHistory = forecast(longer);
        assert bandWidth(longHistory, 5) < bandWidth(shortHistory, 5)
                : "More comparable observations should reduce uncertainty at a fixed horizon";
        assert bandWidth(longHistory, 5) > 0 : "Future day-to-day variation must not vanish with more history";
        assert bandWidth(shortHistory, 7) > bandWidth(shortHistory, 1)
                : "Forecast uncertainty should grow further into the future";
        assert bandWidth(forecast(new int[]{0, 12, 0, 12, 0, 12, 6}), 5) > bandWidth(shortHistory, 5)
                : "Irregular reading should widen, not automatically shrink, the band";

        ReadingProjection constant = forecast(new int[]{6, 6, 6, 6, 6, 6, 6});
        assert bandWidth(constant, 5) == 0 : "Do not invent random variation absent from the observations";
        ReadingPlanChartData sporadic = chart(history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 120, 15,
                new int[]{0, 0, 0, 0, 0, 0, 42}, 6), MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert sporadic.projectedDeadline != null && sporadic.projection.earliestDeadline != null;
        assert sporadic.projection.latestDeadline == null;
        assert sporadic.projectionRangeLabel().equals("Estimated finish range: 04/10 onward; latest finish uncertain");
        assertShape(sporadic);
    }

    private static void checkUnavailableAndCompleted() {
        Book sparse = history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 120, 15, new int[]{4, 8, 4, 8, 4, 8}, 6);
        ReadingPlanChartData sparseChart = chart(sparse, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert sparseChart.projectedDeadline != null && !sparseChart.projection.rangeAvailable;
        assert sparseChart.projectionRangeLabel().contains("Not enough history (6/7 reading days)");
        assert sparseChart.projectionLowerPages.stream().allMatch(value -> value == -1);

        for (int scenario = 0; scenario < 4; scenario++) {
            Book unknown = new Book(1, "No usable pace", 1, 300);
            unknown.currentPage = 200;
            if (scenario == 1) unknown.readingSessions.add(new ReadingSession(TODAY, 200, 200));
            if (scenario == 2) unknown.readingSessions.add(new ReadingSession("deleted", TODAY.minusDays(10), 200, 200, true));
            if (scenario == 3) unknown.readingSessions.add(new ReadingSession(TODAY.minusDays(10), 200, 200));
            ReadingPlanChartData chart = chart(unknown, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
            assert chart.projectedDeadline == null && !chart.projection.rangeAvailable;
            assert chart.projectionLabel().equals("Projection · est. end date: —");
            assert chart.projectionPages.stream().allMatch(value -> value == -1);
        }

        Book finished = pageBook();
        finished.currentPage = finished.endPage;
        ReadingPlanChartData complete = chart(finished, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assertFinish(complete, TODAY, "Projection · est. end date: 01/10");
        assert !complete.projection.rangeAvailable && complete.projectionRangeLabel().contains("Book finished");
        assert complete.dailyTargetPages.get(complete.todayIndex) == 0;

        ReadingPlanChartData remote = chart(history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 1000000, 15,
                new int[]{1, 1, 1, 1, 1, 1, 1}, 0), MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert remote.projectedDeadline == null && remote.projection.latestDeadline == null;
        assert remote.deadline.equals(TODAY.plusYears(10));
        assert remote.dates.size() < 3700 : "Unfinishable/remote forecasts must not create unbounded charts";
        assert remote.projectionLabel().contains("beyond 10 years");
    }

    private static void checkCalendarAndScheduleIsolation() {
        Book early = pageBook();
        early.baselineSchedule = new BaselineSchedule(TODAY.plusDays(2), TODAY.plusDays(8), 6);
        ReadingPlanChartData earlyChart = chart(early, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert earlyChart.dates.get(earlyChart.todayIndex).equals(TODAY);
        assert earlyChart.plannedPages.get(earlyChart.todayIndex) == 0;
        assert earlyChart.dailyTargetPages.get(earlyChart.todayIndex) == 0;
        assert earlyChart.dailyTargetPages.get(earlyChart.todayIndex + 2) == 9
                : "Reading before the planned start must not add reading days to the schedule";
        assertFinish(earlyChart, TODAY.plusDays(10), "Projection · est. end date: 11/10");

        Book stable = history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 120, 15, new int[]{6, 6, 6, 6, 6, 6, 6}, 6);
        ReadingPlanChartData stableChart = chart(stable, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        Book variable = pageBook();
        BaselineSchedule originalBaseline = variable.baselineSchedule;
        ReadingPlanChartData variableChart = chart(variable, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert variableChart.deadline.isAfter(stableChart.deadline);
        for (int index = 0; index < stableChart.dates.size(); index++) {
            assert stableChart.plannedPages.get(index).equals(variableChart.plannedPages.get(index));
            if (index >= stableChart.todayIndex) {
                assert stableChart.dailyTargetPages.get(index).equals(variableChart.dailyTargetPages.get(index))
                        : "Extending the axis for uncertainty must not change required pace";
            }
        }
        assert variable.baselineSchedule == originalBaseline : "Forecasts must not mutate schedules";

        LocalDate december = LocalDate.of(2026, 12, 28);
        Book yearBook = pageBook();
        for (int index = 0; index < yearBook.readingSessions.size(); index++) {
            ReadingSession old = yearBook.readingSessions.get(index);
            yearBook.readingSessions.set(index, new ReadingSession(december.plusDays(
                    java.time.temporal.ChronoUnit.DAYS.between(TODAY, old.date)), old.currentPage, old.pagesRead));
        }
        ReadingProjection year = new ReadingProjection(new ReadingPlanCalendar(new ArrayList<>()), yearBook,
                MainActivity.DIGITAL_BOOKS_LABEL, december);
        assert year.projectionLabel().endsWith("07/01/2027");
        assert year.rangeLabel().contains("05/01/2027–10/01/2027");
    }

    private static void checkDeadlineRequiredPace() {
        for (String section : MainActivity.BOOK_SECTION_LABELS) {
            int scale = PlanPrimitives.isAudiobookSection(section) ? 60 : 1;
            Book book = history(section, 1, 284 * scale, 150 * scale,
                    new int[]{6 * scale, 6 * scale, 6 * scale, 6 * scale, 6 * scale, 6 * scale, 6 * scale}, 6 * scale);
            LocalDate deadline = TODAY.plusDays(10);
            book.baselineSchedule = new BaselineSchedule(TODAY.minusDays(8), deadline, 6 * scale);
            List<RestDayRange> rests = Arrays.asList(new RestDayRange(TODAY.plusDays(2), TODAY.plusDays(3)));
            ReadingPlanCalendar calendar = new ReadingPlanCalendar(rests);
            ReadingPlanChartData chart = chart(book, section, rests);
            assert chart.projectedDeadline.isAfter(deadline) : "Fixture must finish after the deadline";
            assert calendar.availableReadingDaysCount(TODAY, deadline) == 9;
            int required = PlanPrimitives.roundedUpPageTarget(86.0 * scale / 9);
            assert chart.dailyTargetPages.get(chart.todayIndex) == required
                    : "Today's pace must use the deadline, not the estimated finish date";
            for (int index = chart.todayIndex; index < chart.dates.size(); index++) {
                LocalDate date = chart.dates.get(index);
                int days = calendar.availableReadingDaysCount(date, deadline);
                int expected = date.isAfter(deadline) ? -1 : calendar.isRestDay(date) ? 0
                        : PlanPrimitives.roundedUpPageTarget(86.0 * scale / days);
                assert chart.dailyTargetPages.get(index) == expected
                        : "Required pace must rise with no further progress and stop at the deadline: " + date;
            }
            assert chart.dailyTargetPages.get(0) == 150 * scale : "Show recorded reading, not required pace, in the past";
            assert chart.dailyTargetPages.get(1) == 6 * scale;
            assert chart.dailyTargetPages.get(chart.dates.indexOf(deadline)) == 86 * scale;
            assert chart.dailyYMax >= 150 * scale : "Right axis must include actual reading and required pace";

            List<RestDayRange> todayRest = Arrays.asList(new RestDayRange(TODAY, TODAY.plusDays(2)));
            ReadingPlanChartData restChart = chart(book, section, todayRest);
            assert restChart.dailyTargetPages.get(restChart.todayIndex) == 0;
            assert restChart.dailyTargetPages.get(restChart.todayIndex + 3)
                    == PlanPrimitives.roundedUpPageTarget(86.0 * scale / 8)
                    : "Today's rest day must be excluded from the future required pace";

            book.baselineSchedule = new BaselineSchedule(TODAY.minusDays(8), TODAY.minusDays(1), 6 * scale);
            ReadingPlanChartData overdue = chart(book, section, rests);
            for (int index = overdue.todayIndex; index < overdue.dates.size(); index++) {
                assert overdue.dailyTargetPages.get(index) == -1 : "Do not extend targets beyond the deadline";
            }
        }
        Book history = history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 200, 10,
                new int[]{4, 0, 8, 0, 0, 0, 0}, 6);
        LocalDate first = TODAY.minusDays(8);
        history.readingSessions.add(new ReadingSession(first.plusDays(1), 17, 3));
        history.readingSessions.add(new ReadingSession("deleted", first.plusDays(2), 100, 83, true));
        history.readingSessions.add(new ReadingSession(TODAY.plusDays(1), 150, 122));
        ReadingPlanChartData daily = chart(history, MainActivity.DIGITAL_BOOKS_LABEL,
                Arrays.asList(new RestDayRange(first.plusDays(3), first.plusDays(3))));
        assert daily.dailyTargetPages.get(1) == 7 : "Combine same-day reading sessions";
        assert daily.dailyTargetPages.get(2) == 0 : "No reading and deleted sessions must contribute zero";
        assert daily.dailyTargetPages.get(3) == 8 : "Retain recorded reading even on a historical rest day";
        assert daily.dailyTargetPages.get(4) == 0 : "Do not spread reading over missing dates";
        assert daily.dailyTargetPages.get(daily.todayIndex) == 20 : "Today must show required pace, not today's recorded reading";
        assert daily.dailyTargetPages.get(daily.todayIndex + 1) == 22 : "Ignore future sessions in the no-progress scenario";
    }

    private static int bandWidth(ReadingProjection projection, int days) {
        return projection.upperAt(days) - projection.lowerAt(days);
    }

    private static ReadingProjection forecast(int[] amounts) {
        return new ReadingProjection(new ReadingPlanCalendar(new ArrayList<>()),
                history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 10000, 15, amounts, 6), MainActivity.DIGITAL_BOOKS_LABEL, TODAY);
    }

    private static Book pageBook() {
        return history(MainActivity.DIGITAL_BOOKS_LABEL, 1, 120, 15, new int[]{4, 8, 4, 8, 4, 8, 6}, 6);
    }

    private static Book history(String label, int start, int total, int initial, int[] amounts, int todayAmount) {
        Book book = new Book(1, "Projection", start, start + total - (PlanPrimitives.isAudiobookSection(label) ? 0 : 1));
        int position = start + initial - (PlanPrimitives.isAudiobookSection(label) ? 0 : 1);
        LocalDate first = TODAY.minusDays(amounts.length + 1L);
        book.readingSessions.add(new ReadingSession(first, position, initial));
        for (int index = 0; index < amounts.length; index++) {
            position += amounts[index];
            if (amounts[index] > 0) book.readingSessions.add(new ReadingSession(first.plusDays(index + 1L), position, amounts[index]));
        }
        position += todayAmount;
        if (todayAmount > 0) book.readingSessions.add(new ReadingSession(TODAY, position, todayAmount));
        book.currentPage = position;
        book.baselineSchedule = new BaselineSchedule(first, TODAY.plusDays(8), 6);
        return book;
    }

    private static ReadingPlanChartData chart(Book book, String section, List<RestDayRange> rests) {
        BookDeadline deadline = new BookDeadline(book, PlanPrimitives.totalUnits(book, section),
                TODAY.minusDays(8), TODAY.plusDays(8), 17, 6, "On track");
        return new ReadingPlanChartData(new ReadingPlanCalendar(rests), section, book, deadline, TODAY);
    }

    private static void assertShape(ReadingPlanChartData chart) {
        for (int index = 0; index < chart.dates.size(); index++) {
            int center = chart.projectionPages.get(index);
            int lower = chart.projectionLowerPages.get(index);
            int upper = chart.projectionUpperPages.get(index);
            if (index < chart.todayIndex) {
                assert center == -1 && lower == -1 && upper == -1;
            } else {
                assert chart.projection.completed <= lower && lower <= center && center <= upper && upper <= chart.projection.total;
                if (index == chart.todayIndex) assert lower == center && center == upper && center == chart.projection.completed;
                else {
                    assert lower >= chart.projectionLowerPages.get(index - 1);
                    assert upper >= chart.projectionUpperPages.get(index - 1);
                }
            }
        }
    }

    private static void assertFinish(ReadingPlanChartData chart, LocalDate expected, String expectedLabel) {
        assert expected.equals(chart.projectedDeadline) : "Unexpected forecast finish: " + chart.projectedDeadline;
        assert expectedLabel.equals(chart.projectionLabel()) : "Legend must use the forecast finish";
        assertFirstCompletion(chart, chart.projectionPages, expected);
    }

    private static void assertFirstCompletion(ReadingPlanChartData chart, List<Integer> values, LocalDate expected) {
        for (int index = chart.todayIndex; index < chart.dates.size(); index++) {
            if (values.get(index) == chart.projection.total) {
                assert chart.dates.get(index).equals(expected) : "Finish label must match the curve's first completion";
                return;
            }
        }
        throw new AssertionError("Curve never reaches its estimated completion");
    }
}
