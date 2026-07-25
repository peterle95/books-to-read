package com.petermolnar.readingplan.model;

import java.time.LocalDate;

public class BookDeadline {
    public final Book book;
    public final int cumulativePages;
    public final LocalDate startDate;
    public final LocalDate deadline;
    public final int daysAllocated;
    public final double dailyPages;
    public final String status;

    public BookDeadline(Book book, int cumulativePages, LocalDate startDate, LocalDate deadline, int daysAllocated, double dailyPages, String status) {
        this.book = book;
        this.cumulativePages = cumulativePages;
        this.startDate = startDate;
        this.deadline = deadline;
        this.daysAllocated = daysAllocated;
        this.dailyPages = dailyPages;
        this.status = status;
    }
}