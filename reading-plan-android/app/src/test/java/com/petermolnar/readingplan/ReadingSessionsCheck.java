package com.petermolnar.readingplan;

import java.time.LocalDate;

/** Run with :app:checkReadingSessions. */
public final class ReadingSessionsCheck {
    private static final String PHYSICAL = "Physical books";
    private static final String AUDIO = "Audiobooks";

    public static void main(String[] args) {
        ReadingPlanBookProgress progress = new ReadingPlanBookProgress(null);
        Book book = new Book(1, "Pages", 1, 100);
        progress.addReadingSession(book, LocalDate.of(2026, 9, 17), 30, PHYSICAL);
        progress.addReadingSession(book, LocalDate.of(2026, 9, 16), 10, PHYSICAL);
        progress.addReadingSession(book, LocalDate.of(2026, 9, 17), 20, PHYSICAL);
        assert book.readingSessions.get(0).pagesRead == 10;
        assert book.readingSessions.get(1).pagesRead == 10;
        assert book.readingSessions.get(2).pagesRead == 10;
        assert book.currentPage == 30;

        ReadingSession middle = book.readingSessions.get(1);
        progress.replaceReadingSession(book, middle, middle.date, 25, PHYSICAL);
        assert book.readingSessions.get(1).pagesRead == 15;
        assert book.readingSessions.get(2).pagesRead == 5;
        assert book.currentPage == 30;
        ReadingSession changed = book.readingSessions.get(1);
        try {
            progress.replaceReadingSession(book, changed, LocalDate.of(2026, 9, 18), 25, PHYSICAL);
            throw new AssertionError("regressing date was accepted");
        } catch (IllegalArgumentException expected) {
            assert book.readingSessions.get(1) == changed;
            assert book.currentPage == 30;
        }
        try {
            progress.replaceReadingSession(book, changed, changed.date, 30, PHYSICAL);
            throw new AssertionError("duplicate progress was accepted");
        } catch (IllegalArgumentException expected) {
            assert book.readingSessions.get(1) == changed;
        }
        progress.removeReadingSession(book, 1, PHYSICAL);
        assert book.readingSessions.get(1).deleted;
        assert book.readingSessions.get(2).pagesRead == 20;
        assert book.currentPage == 30;
        progress.removeReadingSession(book, 2, PHYSICAL);
        assert book.currentPage == 10;

        Book audio = new Book(1, "Audio", 0, 3600);
        progress.addReadingSession(audio, LocalDate.of(2026, 9, 17), 1800, AUDIO);
        progress.addReadingSession(audio, LocalDate.of(2026, 9, 16), 600, AUDIO);
        assert audio.readingSessions.get(0).pagesRead == 600;
        assert audio.readingSessions.get(1).pagesRead == 1200;
        progress.removeReadingSession(audio, 0, AUDIO);
        assert audio.readingSessions.get(1).pagesRead == 1800;
        assert audio.currentPage == 1800;
        System.out.println("Reading session chain checks passed (backdating, edit, rollback, deletion, audio).");
    }
}
