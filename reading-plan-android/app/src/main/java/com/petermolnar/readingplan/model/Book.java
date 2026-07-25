package com.petermolnar.readingplan.model;

import java.util.ArrayList;
import java.util.List;
import java.time.LocalDate;

public class Book {
    public int number;
    public final String title;
    public final int startPage;
    public final int endPage;
    public Integer currentPage;
    public final List<ReadingSession> readingSessions;
    public BaselineSchedule baselineSchedule;
    public LocalDate deadlineOverride;
    public LocalDate startDateOverride;
    public String targetCompletedDate;

    public Book(int number, String title, int startPage, int endPage) {
        this(number, title, startPage, endPage, null, new ArrayList<>(), null, null, null);
    }

    public Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions) {
        this(number, title, startPage, endPage, currentPage, readingSessions, null, null, null);
    }

    public Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions, BaselineSchedule baselineSchedule) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule, null, null);
    }

    public Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions, BaselineSchedule baselineSchedule, LocalDate deadlineOverride) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule, deadlineOverride, null);
    }

    public Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions, BaselineSchedule baselineSchedule, LocalDate deadlineOverride, LocalDate startDateOverride) {
        this(number, title, startPage, endPage, currentPage, readingSessions, baselineSchedule, deadlineOverride, startDateOverride, null);
    }

    public Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions, BaselineSchedule baselineSchedule, LocalDate deadlineOverride, LocalDate startDateOverride, String targetCompletedDate) {
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

    public int pages() {
        return endPage - startPage + 1;
    }

    public int pagesRead() {
        if (currentPage == null) {
            return 0;
        }
        return Math.min(Math.max(currentPage - startPage + 1, 0), pages());
    }
}