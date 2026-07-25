package com.petermolnar.readingplan.model;

public class BookFields {
    public final String title;
    public final int startPage;
    public final int endPage;

    public BookFields(String title, int startPage, int endPage) {
        this.title = title;
        this.startPage = startPage;
        this.endPage = endPage;
    }
}