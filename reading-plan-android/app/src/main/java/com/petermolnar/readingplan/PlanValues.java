package com.petermolnar.readingplan;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

interface PageCounter {
    int pages(Book book);
}
class SessionTarget {
    final String value;
    final String dailyPace;

    SessionTarget(String value, String dailyPace) {
        this.value = value;
        this.dailyPace = dailyPace;
    }
}
class SessionEntry {
    final int sectionIndex;
    final int bookIndex;
    final int sessionIndex;
    final BookSection section;
    final Book book;
    final ReadingSession session;

    SessionEntry(int sectionIndex, int bookIndex, int sessionIndex, BookSection section, Book book, ReadingSession session) {
        this.sectionIndex = sectionIndex;
        this.bookIndex = bookIndex;
        this.sessionIndex = sessionIndex;
        this.section = section;
        this.book = book;
        this.session = session;
    }

    static String sessionText(String sectionLabel, Book book, ReadingSession session) {
        if (PlanPrimitives.isAudiobookSection(sectionLabel)) {
            return session.date + " | " + sectionLabel + " | "
                    + book.number + ". " + book.title + " | time left "
                    + PlanPrimitives.formatDuration(PlanPrimitives.remainingTimeAt(book, session.currentPage)) + " | +"
                    + PlanPrimitives.formatDuration(session.pagesRead);
        }
        return session.date + " | " + sectionLabel + " | "
                + book.number + ". " + book.title + " | page "
                + session.currentPage + " | +" + session.pagesRead;
    }
}
class BookSection {
    final String label;
    final List<Book> books = new ArrayList<>();
    List<List<Integer>> simultaneousGroups = new ArrayList<>();
    boolean baselineNeedsRecalculation;
    BookSection(String label) {
        this.label = label;
    }
}
class BookDeadline {
    final Book book;
    final int cumulativePages;
    final LocalDate startDate;
    final LocalDate deadline;
    final int daysAllocated;
    final double dailyPages;
    final String status;
    BookDeadline(Book book, int cumulativePages, LocalDate startDate, LocalDate deadline, int daysAllocated, double dailyPages, String status) {
        this.book = book;
        this.cumulativePages = cumulativePages;
        this.startDate = startDate;
        this.deadline = deadline;
        this.daysAllocated = daysAllocated;
        this.dailyPages = dailyPages;
        this.status = status;
    }
}
class SectionPlan {
    final BookSection section;
    final List<BookDeadline> deadlines;
    final double dailyPace;
    final int totalPages;
    final double requiredPace;
    final String overallStatus;
    SectionPlan(BookSection section, List<BookDeadline> deadlines, double dailyPace, int totalPages, double requiredPace, String overallStatus) {
        this.section = section;
        this.deadlines = deadlines;
        this.dailyPace = dailyPace;
        this.totalPages = totalPages;
        this.requiredPace = requiredPace;
        this.overallStatus = overallStatus;
    }

    static String csvDailyPace(SectionPlan sectionPlan) {
        if (PlanPrimitives.isAudiobookSection(sectionPlan.section.label)) {
            return PlanPrimitives.formatDuration(sectionPlan.dailyPace) + "/day";
        }
        return PlanPrimitives.format15(sectionPlan.dailyPace) + " pages/day";
    }
}
class PlanSummary {
    final List<SectionPlan> sectionPlans;
    final int totalPages;
    final double highestDailyPace;
    final String overallStatus;

    PlanSummary(List<SectionPlan> sectionPlans, int totalPages, double highestDailyPace, String overallStatus) {
        this.sectionPlans = sectionPlans;
        this.totalPages = totalPages;
        this.highestDailyPace = highestDailyPace;
        this.overallStatus = overallStatus;
    }
}
class StatsOptions {
    final boolean bookCounts;
    final boolean pageShare;
    final boolean averagePages;
    final boolean readingPeriod;
    final boolean paceDriver;

    StatsOptions(boolean bookCounts, boolean pageShare, boolean averagePages, boolean readingPeriod, boolean paceDriver) {
        this.bookCounts = bookCounts;
        this.pageShare = pageShare;
        this.averagePages = averagePages;
        this.readingPeriod = readingPeriod;
        this.paceDriver = paceDriver;
    }
}
class CsvPlan {
    final List<BookSection> sections;
    final LocalDate startDate;
    final LocalDate endDate;
    final String endLabel;
    final StatsOptions statsOptions;
    final List<RestDayRange> restDays;

    CsvPlan(List<BookSection> sections, LocalDate startDate, LocalDate endDate, String endLabel, StatsOptions statsOptions, List<RestDayRange> restDays) {
        this.sections = sections;
        this.startDate = startDate;
        this.endDate = endDate;
        this.endLabel = endLabel;
        this.statsOptions = statsOptions;
        this.restDays = restDays;
    }
}
class ParseTableResult {
    final List<Book> books;
    final int nextIndex;

    ParseTableResult(List<Book> books, int nextIndex) {
        this.books = books;
        this.nextIndex = nextIndex;
    }
}
