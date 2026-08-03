package com.petermolnar.readingplan;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Locale;
final class PlanPrimitives {
    static String chartValue(double value, boolean audiobook) {
        return audiobook ? formatDuration(value) : String.valueOf((int) Math.ceil(value - 1e-9));
    }
    static String format15(double value) { return String.format(Locale.US, "%.15g", value); }
    static int roundedUpPageTarget(double dailyPages) {
        return Math.max(0, (int) Math.ceil(dailyPages - 1e-9));
    }
    static int pagesRemaining(Book book) {
        return Math.max(book.pages() - book.pagesRead(), 0);
    }
    static boolean isAudiobookSection(String label) {
        return MainActivity.AUDIOBOOKS_LABEL.equals(label);
    }
    static String canonicalSectionLabel(String rawLabel, String defaultLabel) {
        String label = rawLabel == null ? "" : rawLabel.trim();
        if (label.isEmpty()) {
            label = defaultLabel;
        }
        String normalized = label.toLowerCase(Locale.US).replaceAll("[^a-z0-9]", "");
        switch (normalized) {
            case "physical":
            case "physicalbook":
            case "physicalbooks":
            case "paperbook":
            case "paperbooks":
            case "printbook":
            case "printbooks":
                return MainActivity.PHYSICAL_BOOKS_LABEL;
            case "digital":
            case "digitalbook":
            case "digitalbooks":
            case "ebook":
            case "ebooks":
            case "kindlebook":
            case "kindlebooks":
                return MainActivity.DIGITAL_BOOKS_LABEL;
            case "audio":
            case "audiobook":
            case "audiobooks":
                return MainActivity.AUDIOBOOKS_LABEL;
            default:
                if (MainActivity.BOOK_SECTION_LABELS.contains(defaultLabel) && !MainActivity.BOOK_SECTION_LABELS.contains(label)) {
                    return defaultLabel;
                }
                return label;
        }
    }
    static int parseBookUnit(String sectionLabel, String value) {
        return isAudiobookSection(sectionLabel)
                ? parseDuration(value)
                : Integer.parseInt(value);
    }
    static int parseDuration(String value) {
        String[] parts = value.trim().split(":");
        if (parts.length != 2 && parts.length != 3) {
            throw new IllegalArgumentException("time must be HH:MM or HH:MM:SS");
        }
        int hours = Integer.parseInt(parts[0]);
        int minutes = Integer.parseInt(parts[1]);
        int seconds = parts.length == 3 ? Integer.parseInt(parts[2]) : 0;
        if (hours < 0 || minutes < 0 || seconds < 0) {
            throw new IllegalArgumentException("time cannot be negative");
        }
        if (minutes >= 60 || seconds >= 60) {
            throw new IllegalArgumentException("minutes and seconds must be below 60");
        }
        return hours * 3600 + minutes * 60 + seconds;
    }
    static String formatDuration(double rawSeconds) {
        int totalSeconds = Math.max(0, (int) Math.round(rawSeconds));
        int hours = totalSeconds / 3600;
        int remainder = totalSeconds % 3600;
        int minutes = remainder / 60;
        int seconds = remainder % 60;
        if (seconds == 0) {
            return String.format(Locale.US, "%d:%02d", hours, minutes);
        }
        return String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
    }
    static String displayValue(String sectionLabel, Integer value) {
        if (value == null) {
            return "";
        }
        return isAudiobookSection(sectionLabel) ? formatDuration(value) : String.valueOf(value);
    }
    static int totalUnits(Book book, String sectionLabel) {
        return isAudiobookSection(sectionLabel) ? book.endPage - book.startPage : book.pages();
    }
    static int completedUnits(Book book, String sectionLabel) {
        if (book.currentPage == null) {
            return 0;
        }
        if (isAudiobookSection(sectionLabel)) {
            return Math.min(Math.max(book.currentPage - book.startPage, 0), totalUnits(book, sectionLabel));
        }
        return book.pagesRead();
    }
    static int unitsRemaining(Book book, String sectionLabel) {
        return Math.max(totalUnits(book, sectionLabel) - completedUnits(book, sectionLabel), 0);
    }
    static int remainingTimeAt(Book book, int currentTime) {
        return Math.max(book.endPage - currentTime, 0);
    }
    static int currentTimeFromRemaining(Book book, int remainingTime) {
        return currentTimeFromRemaining(book.startPage, book.endPage, remainingTime);
    }
    static int currentTimeFromRemaining(int startTime, int endTime, int remainingTime) {
        int duration = endTime - startTime;
        if (remainingTime < 0) {
            throw new IllegalArgumentException("remaining time cannot be negative");
        }
        if (remainingTime > duration) {
            throw new IllegalArgumentException("remaining time cannot be greater than the audiobook duration");
        }
        return endTime - remainingTime;
    }
    static LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("invalid date");
        }
    }
    static void validatePageRange(int startPage, int endPage) {
        if (startPage < 0) {
            throw new IllegalArgumentException("start page cannot be negative");
        }
        if (endPage < startPage) {
            throw new IllegalArgumentException("end page must be on or after the start page");
        }
    }
    static void validateBookRange(String sectionLabel, int start, int end) {
        if (!isAudiobookSection(sectionLabel)) {
            validatePageRange(start, end);
            return;
        }
        if (start < 0) {
            throw new IllegalArgumentException("start time cannot be negative");
        }
        if (end < start) {
            throw new IllegalArgumentException("end time must be on or after the start time");
        }
    }
}
