package com.petermolnar.readingplan.model;

public class SessionEntry {
    public final int sectionIndex;
    public final int bookIndex;
    public final int sessionIndex;
    public final BookSection section;
    public final Book book;
    public final ReadingSession session;

    public SessionEntry(int sectionIndex, int bookIndex, int sessionIndex, BookSection section, Book book, ReadingSession session) {
        this.sectionIndex = sectionIndex;
        this.bookIndex = bookIndex;
        this.sessionIndex = sessionIndex;
        this.section = section;
        this.book = book;
        this.session = session;
    }
}