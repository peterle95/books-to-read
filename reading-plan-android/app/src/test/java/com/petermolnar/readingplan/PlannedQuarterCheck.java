package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import static com.petermolnar.readingplan.BookCollections.blankSections;

/** Standalone regression check; run with java -ea (no test framework required). */
public final class PlannedQuarterCheck {
    public static void main(String[] args) {
        for (LocalDate boundary : Arrays.asList(LocalDate.of(2027, 1, 1), LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 10, 1))) {
            List<BookSection> current = blankSections();
            Book done = new Book(1, "Done", 1, 100);
            done.currentPage = 100;
            Book ongoing = new Book(2, "Continue", 1, 100);
            ongoing.currentPage = 40;
            ongoing.readingSessions.add(new ReadingSession(boundary.minusDays(1), 40, 40));
            ongoing.deadlineOverride = boundary.minusDays(1);
            current.get(0).books.addAll(Arrays.asList(done, ongoing, new Book(3, "Also continue", 1, 50)));
            current.get(0).simultaneousGroups.add(Arrays.asList(1, 2, 3));
            Book audio = new Book(1, "Audio", 0, 3600);
            audio.currentPage = 1200;
            current.get(2).books.add(audio);
            List<BookSection> future = blankSections();
            future.get(0).books.add(new Book(1, "Next", 1, 200));
            PlannedQuarter planned = new PlannedQuarter(boundary, future);
            assert ReadingPlanCalendar.nextQuarterStart(boundary.minusDays(1)).equals(boundary);
            assert planned.activate(current, boundary.minusDays(1)) == null;
            List<BookSection> activated = planned.activate(current, boundary);
            assert activated.get(0).books.size() == 3;
            Book carried = activated.get(0).books.get(0);
            assert carried.id.equals(ongoing.id);
            assert carried.currentPage == 40;
            assert carried.readingSessions.get(0).id.equals(ongoing.readingSessions.get(0).id);
            assert carried.deadlineOverride == null;
            assert ongoing.deadlineOverride != null;
            assert activated.get(0).books.get(2).title.equals("Next");
            assert activated.get(0).books.get(2).number == 3;
            assert activated.get(0).simultaneousGroups.equals(Arrays.asList(Arrays.asList(1, 2)));
            assert activated.get(2).books.get(0).currentPage == 1200;
            ongoing.currentPage = 100;
            current.get(0).books.get(2).currentPage = 50;
            assert planned.activate(current, boundary.plusMonths(4)).get(0).books.size() == 1;
        }
        System.out.println("Quarter rollover checks passed (four boundaries, history, groups, audio, replacement).");
    }
}
