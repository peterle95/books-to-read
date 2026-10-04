package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Standalone chart regression checks; run with java -ea (no test framework required). */
public final class ReadingPlanChartCheck {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 1);

    public static void main(String[] args) {
        Book book = pageBook(1, 100, 53);
        ReadingPlanChartData chart = chart(book, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert chart.actualPages.get(chart.todayIndex) == 53;
        assert chart.projectionPages.get(chart.todayIndex) == 53
                : "Today's existing reading must not be counted twice";
        assert chart.projectionPages.get(chart.todayIndex + 1) == 61;
        assert chart.projectionPages.subList(0, chart.todayIndex).stream().allMatch(pages -> pages == -1);
        assertFinish(chart, LocalDate.of(2026, 10, 8), "Projection · est. end date: 08/10");

        // A slow forecast must extend beyond the original deadline to its actual finish.
        book.baselineSchedule = new BaselineSchedule(TODAY.minusDays(6), TODAY.plusDays(2), 6);
        ReadingPlanChartData lateChart = chart(book, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert lateChart.deadline.equals(LocalDate.of(2026, 10, 8));
        assertFinish(lateChart, LocalDate.of(2026, 10, 8), "Projection · est. end date: 08/10");

        List<RestDayRange> rests = Arrays.asList(new RestDayRange(TODAY.plusDays(2), TODAY.plusDays(3)));
        ReadingPlanChartData restChart = chart(pageBook(1, 100, 53), MainActivity.PHYSICAL_BOOKS_LABEL, rests);
        assert restChart.projectionPages.get(restChart.todayIndex + 1) == 61;
        assert restChart.projectionPages.get(restChart.todayIndex + 2) == 61;
        assert restChart.projectionPages.get(restChart.todayIndex + 3) == 61;
        assert restChart.projectionPages.get(restChart.todayIndex + 4) == 69;
        assertFinish(restChart, LocalDate.of(2026, 10, 10), "Projection · est. end date: 10/10");

        // If today is a rest day, it remains the anchor, not a forecast reading day.
        ReadingPlanChartData todayRest = chart(pageBook(1, 100, 53), MainActivity.DIGITAL_BOOKS_LABEL,
                Arrays.asList(new RestDayRange(TODAY, TODAY)));
        assert todayRest.projectionPages.get(todayRest.todayIndex) == 53;
        assertFinish(todayRest, LocalDate.of(2026, 10, 7), "Projection · est. end date: 07/10");

        Book offsetBook = pageBook(101, 200, 153);
        assertFinish(chart(offsetBook, MainActivity.PHYSICAL_BOOKS_LABEL, new ArrayList<>()),
                LocalDate.of(2026, 10, 8), "Projection · est. end date: 08/10");

        Book audio = new Book(1, "Audiobook", 100, 1100);
        audio.currentPage = 630;
        audio.readingSessions.add(new ReadingSession(TODAY.minusDays(6), 310, 210));
        audio.readingSessions.add(new ReadingSession(TODAY, 630, 320));
        audio.baselineSchedule = new BaselineSchedule(TODAY.minusDays(6), TODAY.plusDays(8), 60);
        ReadingPlanChartData audioChart = chart(audio, MainActivity.AUDIOBOOKS_LABEL, new ArrayList<>());
        assert audioChart.projectionPages.get(audioChart.todayIndex) == 530;
        assert audioChart.actualPages.get(audioChart.todayIndex) == 530;
        assertFinish(audioChart, LocalDate.of(2026, 10, 8), "Projection · est. end date: 08/10");

        Book unknownPace = new Book(1, "No history", 1, 100);
        unknownPace.currentPage = 53;
        unknownPace.readingSessions.add(new ReadingSession("deleted", TODAY.minusDays(10), 53, 53, true));
        ReadingPlanChartData unknownChart = chart(unknownPace, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert unknownChart.projectedDeadline == null;
        assert unknownChart.projectionLabel().equals("Projection · est. end date: —");
        assert unknownChart.projectionPages.stream().allMatch(pages -> pages == -1);

        ReadingPlanChartData completedChart = chart(pageBook(1, 100, 100),
                MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assertFinish(completedChart, TODAY, "Projection · est. end date: 01/10");

        Book earlyBook = pageBook(1, 100, 53);
        earlyBook.baselineSchedule = new BaselineSchedule(TODAY.plusDays(2), TODAY.plusDays(8), 6);
        ReadingPlanChartData earlyChart = chart(earlyBook, MainActivity.DIGITAL_BOOKS_LABEL, new ArrayList<>());
        assert earlyChart.dates.get(earlyChart.todayIndex).equals(TODAY);
        assert earlyChart.projectionPages.get(earlyChart.todayIndex) == 53;
        assert earlyChart.plannedPages.get(earlyChart.todayIndex) == 0;
        assertFinish(earlyChart, LocalDate.of(2026, 10, 8), "Projection · est. end date: 08/10");
        System.out.println("Chart projection checks passed: anchor, matching finish/label, late finish, rest days, "
                + "page offsets, audiobooks, no pace, completed books, early reading.");
    }

    private static Book pageBook(int start, int end, int current) {
        Book book = new Book(1, "Projection", start, end);
        book.currentPage = current;
        book.readingSessions.add(new ReadingSession(TODAY.minusDays(6), start + 20, 21));
        book.readingSessions.add(new ReadingSession(TODAY, current, current - start - 20));
        book.baselineSchedule = new BaselineSchedule(TODAY.minusDays(6), TODAY.plusDays(8), 6);
        return book;
    }

    private static ReadingPlanChartData chart(Book book, String section, List<RestDayRange> rests) {
        BookDeadline deadline = new BookDeadline(book, PlanPrimitives.totalUnits(book, section),
                TODAY.minusDays(6), TODAY.plusDays(8), 15, 6, "On track");
        return new ReadingPlanChartData(new ReadingPlanCalendar(rests), section, book, deadline, TODAY);
    }

    private static void assertFinish(ReadingPlanChartData chart, LocalDate expected, String expectedLabel) {
        assert expected.equals(chart.projectedDeadline) : "Unexpected forecast finish: " + chart.projectedDeadline;
        assert expectedLabel.equals(chart.projectionLabel()) : "Legend must use dd/mm and the forecast finish";
        for (int index = chart.todayIndex; index < chart.dates.size(); index++) {
            if (chart.projectionPages.get(index) == PlanPrimitives.totalUnits(chart.book, chart.sectionLabel)) {
                assert chart.dates.get(index).equals(expected)
                        : "Legend's estimate must match where the projection first reaches completion";
                return;
            }
        }
        throw new AssertionError("Chart ends before the projection reaches completion");
    }
}
