package com.petermolnar.readingplan;
import java.util.*;
import static com.petermolnar.readingplan.PlanPrimitives.*;
final class CsvSupport {
    private CsvSupport() {
    }
    static List<RestDayRange> restDayRangesFromCsv(String raw) {
        List<RestDayRange> ranges = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) {
            return ranges;
        }
        for (String value : raw.split(";")) {
            String[] dates = value.trim().split("/", 2);
            if (dates.length != 2) {
                throw new IllegalArgumentException("invalid rest-day range");
            }
            java.time.LocalDate start = parseDate(dates[0]);
            java.time.LocalDate end = parseDate(dates[1]);
            if (end.isBefore(start)) {
                throw new IllegalArgumentException("rest-day end date must be on or after the start date");
            }
            ranges.add(new RestDayRange(start, end));
        }
        return ranges;
    }
    static List<String> csvHeaders(String sectionLabel) {
        if (isAudiobookSection(sectionLabel)) {
            return Arrays.asList(
                    "Book", "Title", "Start time", "End time", "Remaining time", "Duration",
                    "Daily time", "Cumulative remaining time",
                    "Start date", "Deadline", "Days allocated", "Status"
            );
        }
        return Arrays.asList(
                "Book", "Title", "Start page", "End page", "Current page", "Pages",
                "Read pages", "Remaining pages", "Daily pages",
                "Cumulative remaining pages",
                "Start date", "Deadline", "Days allocated", "Status"
        );
    }
    static List<String> csvRow(BookDeadline deadline, String sectionLabel) {
        Book book = deadline.book;
        if (isAudiobookSection(sectionLabel)) {
            return Arrays.asList(
                    String.valueOf(book.number),
                    book.title,
                    formatDuration(book.startPage),
                    formatDuration(book.endPage),
                    formatDuration(unitsRemaining(book, sectionLabel)),
                    formatDuration(totalUnits(book, sectionLabel)),
                    formatDuration(deadline.dailyPages),
                    formatDuration(deadline.cumulativePages),
                    deadline.startDate.toString(),
                    deadline.deadline.toString(),
                    String.valueOf(deadline.daysAllocated),
                    deadline.status
            );
        }
        return Arrays.asList(
                String.valueOf(book.number),
                book.title,
                String.valueOf(book.startPage),
                String.valueOf(book.endPage),
                book.currentPage == null ? "" : String.valueOf(book.currentPage),
                String.valueOf(book.pages()),
                String.valueOf(book.pagesRead()),
                String.valueOf(pagesRemaining(book)),
                format15(deadline.dailyPages),
                String.valueOf(deadline.cumulativePages),
                deadline.startDate.toString(),
                deadline.deadline.toString(),
                String.valueOf(deadline.daysAllocated),
                deadline.status
        );
    }
    static List<List<String>> parseCsv(String raw) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (inQuotes) {
                if (ch == '"') {
                    if (i + 1 < raw.length() && raw.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                inQuotes = true;
            } else if (ch == ',') {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (ch == '\n') {
                row.add(cell.toString());
                rows.add(row);
                row = new ArrayList<>();
                cell.setLength(0);
            } else if (ch != '\r') {
                cell.append(ch);
            }
        }
        if (cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }
    static boolean isBlankRow(List<String> row) {
        if (row.isEmpty()) {
            return true;
        }
        for (String cell : row) {
            if (!cell.trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }
    static boolean startsWith(List<String> row, String... values) {
        if (row.size() < values.length) {
            return false;
        }
        for (int i = 0; i < values.length; i++) {
            if (!values[i].equals(row.get(i))) {
                return false;
            }
        }
        return true;
    }
    static int intCell(List<String> row, int index) {
        if (index >= row.size()) {
            throw new IllegalArgumentException("book page fields must be whole numbers");
        }
        try {
            return Integer.parseInt(row.get(index).trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("book page fields must be whole numbers");
        }
    }

    static String cell(List<String> row, int index) {
        return index < row.size() ? row.get(index).trim() : "";
    }
}
