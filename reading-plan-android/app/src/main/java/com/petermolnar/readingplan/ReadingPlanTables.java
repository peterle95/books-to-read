package com.petermolnar.readingplan;

import android.view.Gravity;
import android.widget.HorizontalScrollView;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;

import java.util.Arrays;
import java.util.List;

import static com.petermolnar.readingplan.MainActivity.format2;
import static com.petermolnar.readingplan.PlanPrimitives.formatDuration;
import static com.petermolnar.readingplan.PlanPrimitives.isAudiobookSection;
import static com.petermolnar.readingplan.PlanPrimitives.pagesRemaining;
import static com.petermolnar.readingplan.PlanPrimitives.totalUnits;
import static com.petermolnar.readingplan.PlanPrimitives.unitsRemaining;

final class ReadingPlanTables {
    private final MainActivity activity;

    ReadingPlanTables(MainActivity activity) {
        this.activity = activity;
    }

    void addMetricRow(TableLayout table, String area, String metric, String value, String details) {
        addTableRow(table, false, Arrays.asList(area, metric, value, details), -1);
    }

    HorizontalScrollView bookScheduleTable(SectionPlan sectionPlan) {
        HorizontalScrollView scroll = new HorizontalScrollView(activity);
        TableLayout table = new TableLayout(activity);
        scroll.addView(table);
        boolean audiobookSection = isAudiobookSection(sectionPlan.section.label);
        addTableRow(table, true, Arrays.asList("Book", "Daily", "Remaining", "Deadline", "Status"), -1);
        for (BookDeadline deadline : sectionPlan.deadlines) {
            Book book = deadline.book;
            String daily = audiobookSection
                    ? formatDuration(deadline.dailyPages)
                    : format2(deadline.dailyPages) + " pages";
            String remaining = audiobookSection
                    ? formatDuration(unitsRemaining(book, sectionPlan.section.label))
                    : pagesRemaining(book) + " pages";
            addTableRow(table, false, Arrays.asList(
                    book.number + ". " + book.title,
                    daily,
                    remaining,
                    deadline.deadline.toString(),
                    deadline.status
            ), -1);
        }
        return scroll;
    }

    HorizontalScrollView planTable(SectionPlan sectionPlan) {
        HorizontalScrollView scroll = new HorizontalScrollView(activity);
        TableLayout table = new TableLayout(activity);
        scroll.addView(table);
        boolean audiobookSection = isAudiobookSection(sectionPlan.section.label);
        List<String> headers = audiobookSection
                ? Arrays.asList(
                        "Book", "Title", "Daily time", "Remaining time", "Start time", "End time",
                        "Duration", "Start date", "Deadline", "Days allocated", "Status"
                )
                : Arrays.asList(
                        "Book", "Title", "Daily pages", "Remaining", "Start page", "End page",
                        "Current page", "Pages", "Start date", "Deadline", "Days allocated", "Status"
                );
        addTableRow(table, true, headers, -1);
        for (BookDeadline deadline : sectionPlan.deadlines) {
            Book book = deadline.book;
            List<String> row = audiobookSection
                    ? Arrays.asList(
                            String.valueOf(book.number),
                            book.title,
                            formatDuration(deadline.dailyPages),
                            formatDuration(unitsRemaining(book, sectionPlan.section.label)),
                            formatDuration(book.startPage),
                            formatDuration(book.endPage),
                            formatDuration(totalUnits(book, sectionPlan.section.label)),
                            deadline.startDate.toString(),
                            deadline.deadline.toString(),
                            String.valueOf(deadline.daysAllocated),
                            deadline.status
                    )
                    : Arrays.asList(
                            String.valueOf(book.number),
                            book.title,
                            format2(deadline.dailyPages),
                            String.valueOf(pagesRemaining(book)),
                            String.valueOf(book.startPage),
                            String.valueOf(book.endPage),
                            book.currentPage == null ? "" : String.valueOf(book.currentPage),
                            String.valueOf(book.pages()),
                            deadline.startDate.toString(),
                            deadline.deadline.toString(),
                            String.valueOf(deadline.daysAllocated),
                            deadline.status
                    );
            addTableRow(table, false, row, -1);
        }
        return scroll;
    }

    TableRow addTableRow(TableLayout table, boolean header, List<String> values, int rowColor) {
        TableRow row = new TableRow(activity);
        table.addView(row);
        for (String value : values) {
            TextView cell = new TextView(activity);
            cell.setText(value);
            cell.setTextSize(13);
            cell.setTextColor(rowColor == MainActivity.CARAMEL ? MainActivity.CREAM : MainActivity.ESPRESSO);
            cell.setPadding(activity.dp(10), activity.dp(8), activity.dp(10), activity.dp(8));
            cell.setGravity(Gravity.CENTER_VERTICAL);
            cell.setSingleLine(false);
            cell.setMinWidth(activity.dp(96));
            if (header) {
                cell.setTypeface(null, 1);
                cell.setBackgroundColor(MainActivity.LIGHT_CREAM);
            } else if (rowColor != -1) {
                cell.setBackgroundColor(rowColor);
            } else {
                cell.setBackgroundColor(MainActivity.CREAM);
            }
            row.addView(cell);
        }
        return row;
    }
}
