package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

class ReadingSession {
    final String id;
    final LocalDate date;
    final int currentPage;
    final int pagesRead;
    boolean deleted;

    ReadingSession(LocalDate date, int currentPage, int pagesRead) {
        this(UUID.randomUUID().toString(), date, currentPage, pagesRead, false);
    }

    ReadingSession(String id, LocalDate date, int currentPage, int pagesRead, boolean deleted) {
        this.id = id;
        this.date = date;
        this.currentPage = currentPage;
        this.pagesRead = pagesRead;
        this.deleted = deleted;
    }
}
class RestDayRange {
    final LocalDate startDate;
    final LocalDate endDate;

    RestDayRange(LocalDate startDate, LocalDate endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
    }
}
class BaselineSchedule {
    final LocalDate startDate;
    final LocalDate deadline;
    final double dailyTarget;

    BaselineSchedule(LocalDate startDate, LocalDate deadline, double dailyTarget) {
        this.startDate = startDate;
        this.deadline = deadline;
        this.dailyTarget = dailyTarget;
    }
}
class Book {
    final String id;
    int number;
    final String title;
    final int startPage;
    final int endPage;
    Integer currentPage;
    final List<ReadingSession> readingSessions;
    BaselineSchedule baselineSchedule;
    LocalDate deadlineOverride;
    LocalDate startDateOverride;
    String targetCompletedDate;
    Book(int number, String title, int startPage, int endPage) {
        this(number, title, startPage, endPage, null, new ArrayList<>(), null, null, null);
    }

    Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions) {
        this(number, title, startPage, endPage, currentPage, readingSessions, null, null, null);
    }

    Book(
            int number,
            String title,
            int startPage,
            int endPage,
            Integer currentPage,
            List<ReadingSession> readingSessions,
            BaselineSchedule baselineSchedule
    ) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule, null, null);
    }

    Book(
            int number,
            String title,
            int startPage,
            int endPage,
            Integer currentPage,
            List<ReadingSession> readingSessions,
            BaselineSchedule baselineSchedule,
            LocalDate deadlineOverride
    ) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule, deadlineOverride, null);
    }

    Book(
            int number,
            String title,
            int startPage,
            int endPage,
            Integer currentPage,
            List<ReadingSession> readingSessions,
            BaselineSchedule baselineSchedule,
            LocalDate deadlineOverride,
            LocalDate startDateOverride
    ) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule, deadlineOverride, startDateOverride, null);
    }

    Book(
            int number,
            String title,
            int startPage,
            int endPage,
            Integer currentPage,
            List<ReadingSession> readingSessions,
            BaselineSchedule baselineSchedule,
            LocalDate deadlineOverride,
            LocalDate startDateOverride,
            String targetCompletedDate
    ) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule,
                deadlineOverride, startDateOverride, targetCompletedDate, UUID.randomUUID().toString());
    }

    Book(
            int number,
            String title,
            int startPage,
            int endPage,
            Integer currentPage,
            List<ReadingSession> readingSessions,
            BaselineSchedule baselineSchedule,
            LocalDate deadlineOverride,
            LocalDate startDateOverride,
            String targetCompletedDate,
            String id
    ) {
        this.id = id;
        this.number = number;
        this.title = title;
        this.startPage = startPage;
        this.endPage = endPage;
        this.currentPage = currentPage;
        this.readingSessions = readingSessions;
        this.baselineSchedule = baselineSchedule;
        this.deadlineOverride = deadlineOverride;
        this.startDateOverride = startDateOverride;
        this.targetCompletedDate = targetCompletedDate;
    }

    int pages() {
        return endPage - startPage + 1;
    }
    int pagesRead() {
        if (currentPage == null) {
            return 0;
        }
        return Math.min(Math.max(currentPage - startPage + 1, 0), pages());
    }

    static List<String> bookChoices(BookSection section) {
        List<String> choices = new ArrayList<>();
        for (Book book : section.books) {
            choices.add(book.number + ". " + book.title);
        }
        return choices;
    }
}

class BookFields {
    final String title;
    final int startPage;
    final int endPage;

    BookFields(String title, int startPage, int endPage) {
        this.title = title;
        this.startPage = startPage;
        this.endPage = endPage;
    }
}
