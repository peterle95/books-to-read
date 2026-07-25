package com.petermolnar.readingplan.model;

import java.util.List;

public class ParseTableResult {
    public final List<Book> books;
    public final int nextIndex;

    public ParseTableResult(List<Book> books, int nextIndex) {
        this.books = books;
        this.nextIndex = nextIndex;
    }
}