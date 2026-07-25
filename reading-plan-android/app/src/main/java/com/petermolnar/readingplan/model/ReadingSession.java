package com.petermolnar.readingplan.model;

import java.time.LocalDate;

public class ReadingSession {
    public final LocalDate date;
    public final int currentPage;
    public final int pagesRead;

    public ReadingSession(LocalDate date, int currentPage, int pagesRead) {
        this.date = date;
        this.currentPage = currentPage;
        this.pagesRead = pagesRead;
    }
}