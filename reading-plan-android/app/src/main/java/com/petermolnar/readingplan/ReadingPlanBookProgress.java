package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static com.petermolnar.readingplan.BookCollections.remapGroupsByBookIdentity;
import static com.petermolnar.readingplan.BookCollections.renumberBooks;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingPlanBookProgress {
    private final MainActivity activity;

    ReadingPlanBookProgress(MainActivity activity) {
        this.activity = activity;
    }

    void addReadingSession(Book book, LocalDate sessionDate, int currentPage, String sectionLabel) {
        int previousPagesRead = completedUnits(book, sectionLabel);
        setBookProgress(book, currentPage, sectionLabel);
        int pagesRead = completedUnits(book, sectionLabel) - previousPagesRead;
        if (pagesRead <= 0) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time left must be less than the previously recorded time left"
                    : "current page must be after the previously recorded page");
        }
        book.readingSessions.add(new ReadingSession(sessionDate, currentPage, pagesRead));
    }

    void removeReadingSession(Book book, int index) {
        if (index < 0 || index >= book.readingSessions.size()) {
            throw new IllegalArgumentException("reading session not found");
        }
        book.readingSessions.get(index).deleted = true;
        int max = Integer.MIN_VALUE;
        for (ReadingSession session : book.readingSessions) {
            if (!session.deleted) {
                max = Math.max(max, session.currentPage);
            }
        }
        if (max == Integer.MIN_VALUE) {
            book.currentPage = null;
            return;
        }
        book.currentPage = max;
    }

    private static void setBookProgress(Book book, int currentPage, String sectionLabel) {
        if (currentPage < book.startPage) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time left cannot be greater than the audiobook duration"
                    : "current page cannot be before the book's start page");
        }
        if (currentPage > book.endPage) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time left cannot be negative"
                    : "current page cannot be after the book's end page");
        }
        book.currentPage = currentPage;
    }

    void moveSelectedBook(BookSection section, int offset) {
        if (!activity.hasSelectedBook(section)) {
            activity.showError("Select a book first");
            return;
        }
        Book selected = section.books.get(activity.selectedBookIndex);
        List<List<Book>> oldGroupBooks = new ArrayList<>();
        for (List<Integer> group : section.simultaneousGroups) {
            List<Book> groupBooks = new ArrayList<>();
            for (Integer id : group) {
                groupBooks.add(section.books.get(id - 1));
            }
            oldGroupBooks.add(groupBooks);
        }
        int[] block = moveBlockRange(section, activity.selectedBookIndex);
        if (offset < 0) {
            if (block[0] == 0) {
                return;
            }
            int[] adjacent = moveBlockRange(section, block[0] - 1);
            List<Book> moving = new ArrayList<>(section.books.subList(block[0], block[1] + 1));
            List<Book> adjacentBooks = new ArrayList<>(section.books.subList(adjacent[0], adjacent[1] + 1));
            section.books.subList(adjacent[0], block[1] + 1).clear();
            section.books.addAll(adjacent[0], moving);
            section.books.addAll(adjacent[0] + moving.size(), adjacentBooks);
        } else {
            if (block[1] == section.books.size() - 1) {
                return;
            }
            int[] adjacent = moveBlockRange(section, block[1] + 1);
            List<Book> moving = new ArrayList<>(section.books.subList(block[0], block[1] + 1));
            List<Book> adjacentBooks = new ArrayList<>(section.books.subList(adjacent[0], adjacent[1] + 1));
            section.books.subList(block[0], adjacent[1] + 1).clear();
            section.books.addAll(block[0], adjacentBooks);
            section.books.addAll(block[0] + adjacentBooks.size(), moving);
        }
        renumberBooks(section.books);
        section.simultaneousGroups = remapGroupsByBookIdentity(section.books, oldGroupBooks);
        activity.selectedBookIndex = section.books.indexOf(selected);
        activity.invalidateBaselineSchedules(section);
        activity.afterStateChange("Book moved");
    }

    private static int[] moveBlockRange(BookSection section, int index) {
        int bookId = index + 1;
        for (List<Integer> group : section.simultaneousGroups) {
            if (group.contains(bookId)) {
                return new int[]{group.get(0) - 1, group.get(group.size() - 1) - 1};
            }
        }
        return new int[]{index, index};
    }
}
