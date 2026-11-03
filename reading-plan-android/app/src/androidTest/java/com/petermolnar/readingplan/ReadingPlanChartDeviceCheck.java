package com.petermolnar.readingplan;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Bundle;
import android.text.StaticLayout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Native regression check, using only the platform runner; run on a disposable emulator. */
public final class ReadingPlanChartDeviceCheck extends Instrumentation {
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            MainActivity activity = (MainActivity) startActivitySync(new Intent(getTargetContext(), MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            LocalDate today = LocalDate.now();
            onMain(() -> {
                activity.restDays.clear();
                require(!activity.isRestDay(today), "Activity calendar must use its initialized rest-day list");
                activity.restDays.add(new RestDayRange(today.plusDays(3), today.plusDays(3)));
                activity.restDays.add(new RestDayRange(today.plusDays(2), today.plusDays(2)));
                activity.normalizeRestDayRanges();
                require(activity.restDays.size() == 1 && activity.isRestDay(today.plusDays(2)),
                        "Activity calendar must see and normalize later rest-day edits");
                checkScheduleTable(activity, today);
                activity.startDate = today.minusDays(8);
                activity.endDate = today.plusDays(8);
                activity.plannedQuarter = null;
                activity.sections.clear();
                activity.sections.addAll(BookCollections.blankSections());
                addBook(activity, MainActivity.DIGITAL_BOOKS_LABEL, "Projection example (test data)", 1, 120, 1, today);
                addBook(activity, MainActivity.AUDIOBOOKS_LABEL, "Audio example (test data)", 100, 1100, 10, today);
                setField(activity, "jsonLoaded", true);
                setField(activity, "currentTab", "Charts");
                activity.showCurrentTab();
            });
            waitForIdleSync();
            onMain(() -> {
                View root = activity.getWindow().getDecorView();
                ReadingPlanChartView view = find(root, ReadingPlanChartView.class);
                ReadingPlanChartData chart = (ReadingPlanChartData) field(view, "chart");
                require(view.getHeight() == activity.dp(500), "Chart must use the space freed by the explanation");
                checkCompactLayout(activity);
                ViewGroup box = (ViewGroup) view.getParent();
                TextView details = (TextView) box.getChildAt(box.indexOfChild(view) + 1);
                require(!details.getText().toString().contains("\n"), "Keep compact schedule/pace details without the explanation");
                checkForecast(chart, today.plusDays(12));
                checkRange(chart, today.plusDays(10), today.plusDays(15));
                checkLegend(activity, view, chart);
                require(violetPixels(view) > 0, "Projection must render on the native canvas");
                require(bandPixels(view) > 100, "Projection area must render as a translucent fill, not just a line");
                CheckBox toggle = find(root, CheckBox.class);
                toggle.setChecked(false);
                require(violetPixels(view) == 0, "Disabling projection must hide the curve and legend");
                require(bandPixels(view) == 0, "Disabling projection must also hide the shaded range");
                require(!view.getContentDescription().toString().contains("Projection")
                                && view.getContentDescription().toString().contains("assuming no further progress"),
                        "Hidden projection must leave the daily series explanation accessible");
                toggle.setChecked(true);
                checkLegend(activity, view, chart);
                require(bandPixels(view) > 100, "Re-enabling projection must restore the shaded range");
                find(root, Spinner.class).setSelection(1);
            });
            waitForIdleSync();
            onMain(() -> {
                View root = activity.getWindow().getDecorView();
                ReadingPlanChartView view = find(root, ReadingPlanChartView.class);
                ReadingPlanChartData chart = (ReadingPlanChartData) field(view, "chart");
                require(chart.sectionLabel.equals(MainActivity.AUDIOBOOKS_LABEL), "Book selector must update the chart");
                checkForecast(chart, today.plusDays(9));
                checkRange(chart, today.plusDays(7), today.plusDays(11));
                checkLegend(activity, view, chart);
                checkUnavailableRanges(activity, today);
                find(root, Spinner.class).setSelection(0);
            });
            waitForIdleSync();
            onMain(() -> {
                View root = activity.getWindow().getDecorView();
                find(root, ScrollView.class).scrollTo(0, 0);
            });
            waitForIdleSync();
            Bitmap screenshot = getUiAutomation().takeScreenshot();
            require(screenshot != null, "Native chart screenshot unavailable");
            File output = new File(getTargetContext().getExternalFilesDir(null), "chart-projection.png");
            try (FileOutputStream stream = new FileOutputStream(output)) {
                require(screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream), "Could not save chart screenshot");
            } finally {
                screenshot.recycle();
            }
            result.putString("stream", "Native chart checks passed: activity wiring, rest-day edits, anchor, matching finish/date, "
                    + "wrapped phone-width legends, native shaded range, projection toggle, book selection, sparse/open-ended ranges, "
                    + "compact no-scroll layout, metrics schedule columns. Screenshot: " + output);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("stream", android.util.Log.getStackTraceString(failure));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private static void addBook(MainActivity activity, String section, String title, int start, int end,
                                int scale, LocalDate today) {
        Book book = new Book(1, title, start, end);
        int position = start + 15 * scale - (PlanPrimitives.isAudiobookSection(section) ? 0 : 1);
        book.readingSessions.add(new ReadingSession(today.minusDays(8), position, 15 * scale));
        int[] amounts = {4, 8, 4, 8, 4, 8, 6};
        for (int index = 0; index < amounts.length; index++) {
            position += amounts[index] * scale;
            book.readingSessions.add(new ReadingSession(today.minusDays(7 - index), position, amounts[index] * scale));
        }
        position += 6 * scale;
        book.readingSessions.add(new ReadingSession(today, position, 6 * scale));
        book.currentPage = position;
        book.baselineSchedule = new BaselineSchedule(activity.startDate, activity.endDate, 6);
        activity.sectionByLabel(section).books.add(book);
    }

    private static void checkScheduleTable(MainActivity activity, LocalDate today) {
        String[] headers = {"Book", "Daily", "Remaining", "Remaining days", "Start date", "Deadline", "Status"};
        int[] startOffsets = {-6, 4, -6, 0, 2};
        int[] endOffsets = {8, 8, -1, 0, 3};
        String[] remainingDays = {"7", "5", "0", "1", "0"};
        for (String label : MainActivity.BOOK_SECTION_LABELS) {
            List<BookDeadline> deadlines = new ArrayList<>();
            for (int index = 0; index < startOffsets.length; index++) {
                deadlines.add(new BookDeadline(new Book(index + 1, "Schedule example", 1, 100), 100,
                        today.plusDays(startOffsets[index]), today.plusDays(endOffsets[index]), 15, 6, "before end"));
            }
            SectionPlan plan = new SectionPlan(new BookSection(label), deadlines, 6, 500, 6, "achievable");
            TableLayout table = (TableLayout) activity.bookScheduleTable(plan).getChildAt(0);
            TableRow header = (TableRow) table.getChildAt(0);
            require(header.getChildCount() == headers.length, "Schedule header must include both new columns");
            for (int column = 0; column < headers.length; column++) {
                require(((TextView) header.getChildAt(column)).getText().toString().equals(headers[column]),
                        "Unexpected schedule column order");
            }
            for (int index = 0; index < deadlines.size(); index++) {
                TableRow row = (TableRow) table.getChildAt(index + 1);
                require(row.getChildCount() == headers.length, "Schedule rows must align with the header");
                List<String> expected = Arrays.asList(remainingDays[index], deadlines.get(index).startDate.toString(),
                        deadlines.get(index).deadline.toString(), "before end");
                for (int column = 0; column < expected.size(); column++) {
                    require(((TextView) row.getChildAt(column + 3)).getText().toString().equals(expected.get(column)),
                            "Schedule must show remaining reading days, scheduled start, deadline, and status");
                }
            }
        }
    }

    private static void checkCompactLayout(MainActivity activity) {
        ScrollView scroll = new ReadingPlanChartsView(activity).build();
        scroll.measure(View.MeasureSpec.makeMeasureSpec(activity.dp(360), View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(activity.dp(720), View.MeasureSpec.EXACTLY));
        scroll.layout(0, 0, scroll.getMeasuredWidth(), scroll.getMeasuredHeight());
        ViewGroup box = (ViewGroup) scroll.getChildAt(0);
        Spinner selector = find(scroll, Spinner.class);
        require(box.getChildAt(1) == selector, "Book selector must follow the header without redundant status/Book rows");
        require("Book".contentEquals(selector.getContentDescription()), "Book selector must retain its accessible name");
        require(find(scroll, ReadingPlanChartView.class).getHeight() == activity.dp(500),
                "Removing labels must preserve the larger chart");
        require(box.getHeight() <= scroll.getHeight(),
                "Phone content must fit without scrolling: content=" + box.getHeight() + ", viewport="
                        + scroll.getHeight() + ", details bottom=" + box.getChildAt(box.getChildCount() - 1).getBottom());
    }

    private static void checkForecast(ReadingPlanChartData chart, LocalDate expected) {
        require(chart.projectionPages.get(chart.todayIndex).equals(chart.actualPages.get(chart.todayIndex)),
                "Projection must start at today's actual progress");
        require(expected.equals(chart.projectedDeadline), "Unexpected forecast finish: " + chart.projectedDeadline);
        for (int index = chart.todayIndex; index < chart.dates.size(); index++) {
            if (chart.projectionPages.get(index) == PlanPrimitives.totalUnits(chart.book, chart.sectionLabel)) {
                require(chart.dates.get(index).equals(expected), "Estimate must match the curve's first completion date");
                return;
            }
        }
        throw new AssertionError("Curve never reaches completion");
    }

    private static void checkRange(ReadingPlanChartData chart, LocalDate earliest, LocalDate latest) {
        require(earliest.equals(chart.projection.earliestDeadline) && latest.equals(chart.projection.latestDeadline),
                "Finish range must follow the same daily-history model as the central estimate");
        for (List<Integer> values : Arrays.asList(chart.projectionUpperPages, chart.projectionLowerPages)) {
            LocalDate expected = values == chart.projectionUpperPages ? earliest : latest;
            for (int index = chart.todayIndex; index < values.size(); index++) {
                if (values.get(index) == chart.projection.total) {
                    require(chart.dates.get(index).equals(expected), "Finish range must match first boundary completion");
                    break;
                }
                require(index < values.size() - 1, "Range boundary never reaches completion");
            }
        }
    }

    private static void checkLegend(MainActivity activity, ReadingPlanChartView view, ReadingPlanChartData chart) {
        String text = chart.projectionLabel() + "\n" + chart.projectionRangeLabel();
        require(!text.contains("80%"), "Finish-range labels must not display a confidence percentage");
        require(view.getContentDescription().toString().endsWith(text), "Accessible chart text must include both date and range");
        for (int width : new int[]{view.getWidth() - activity.dp(62), activity.dp(258)}) {
            StaticLayout legend = view.projectionLegend(width);
            require(legend.getText().toString().equals(text), "Wrapped legend must retain all forecast information");
            for (int line = 0; line < legend.getLineCount(); line++) {
                require(legend.getLineWidth(line) <= width + 1, "Forecast text must fit even a 320dp-wide phone");
            }
            require(activity.dp(50) + legend.getHeight() < view.getHeight() - activity.dp(52),
                    "Wrapped forecast information must leave room for the chart");
        }
    }

    private static void checkUnavailableRanges(MainActivity activity, LocalDate today) {
        for (boolean sparse : new boolean[]{true, false}) {
            Book book = new Book(1, "Range edge case", 1, 120);
            if (!sparse) {
                book.readingSessions.add(new ReadingSession(today.minusDays(8), 15, 15));
                book.readingSessions.add(new ReadingSession(today.minusDays(1), 57, 42));
            }
            book.readingSessions.add(new ReadingSession(today, 63, sparse ? 63 : 6));
            book.currentPage = 63;
            BookDeadline deadline = new BookDeadline(book, 120, today.minusDays(8), today.plusDays(8), 17, 6, "before end");
            ReadingPlanChartData chart = new ReadingPlanChartData(new ReadingPlanCalendar(activity),
                    MainActivity.DIGITAL_BOOKS_LABEL, book, deadline, today);
            require(chart.projectionRangeLabel().contains(sparse ? "Not enough history" : "latest finish uncertain"),
                    "Sparse or open-ended histories must not invent a finish window");
            ReadingPlanChartView view = new ReadingPlanChartView(activity, chart);
            view.measure(View.MeasureSpec.makeMeasureSpec(activity.dp(320), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(activity.dp(420), View.MeasureSpec.EXACTLY));
            view.layout(0, 0, view.getMeasuredWidth(), view.getMeasuredHeight());
            checkLegend(activity, view, chart);
            require(sparse ? bandPixels(view) == 0 : bandPixels(view) > 100,
                    "Only a supported range may produce a shaded forecast");
        }
    }

    private static int violetPixels(View view) {
        return matchingPixels(view, MainActivity.VIOLET, 0);
    }

    private static int bandPixels(View view) {
        int foreground = MainActivity.VIOLET;
        int background = MainActivity.CREAM;
        int color = Color.rgb((Color.red(foreground) * 48 + Color.red(background) * 207) / 255,
                (Color.green(foreground) * 48 + Color.green(background) * 207) / 255,
                (Color.blue(foreground) * 48 + Color.blue(background) * 207) / 255);
        ReadingPlanChartView chartView = (ReadingPlanChartView) view;
        ReadingPlanChartData chart = (ReadingPlanChartData) field(view, "chart");
        MainActivity activity = (MainActivity) view.getContext();
        int left = activity.dp(54);
        int width = view.getWidth() - activity.dp(48) - left;
        boolean visible = (boolean) field(view, "projectionVisible");
        int top = visible ? activity.dp(50)
                + chartView.projectionLegend(view.getWidth() - left - activity.dp(8)).getHeight() : activity.dp(42);
        int bottom = view.getHeight() - activity.dp(52);
        int height = bottom - top;
        Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
        view.draw(new Canvas(bitmap));
        int count = 0;
        // Sample inside the plot, away from the central stroke: text/line antialiasing is not an area fill.
        for (int index = chart.todayIndex + 1; index < chart.dates.size(); index++) {
            int x = left + Math.round((float) width * index / (chart.dates.size() - 1));
            float centralY = bottom - (float) height * chart.projectionPages.get(index) / chart.yMax;
            int upper = chart.projectionUpperPages.get(index);
            int lower = chart.projectionLowerPages.get(index);
            int from = upper < 0 ? top : Math.round(bottom - (float) height * upper / chart.yMax) + activity.dp(2);
            int to = lower < 0 ? bottom : Math.round(bottom - (float) height * lower / chart.yMax) - activity.dp(2);
            for (int y = Math.max(top + 1, from); y < Math.min(bottom, to); y++) {
                if (Math.abs(y - centralY) > activity.dp(4) && matchesColor(bitmap.getPixel(x, y), color, 2)) count++;
            }
        }
        bitmap.recycle();
        return count;
    }

    private static int matchingPixels(View view, int color, int tolerance) {
        Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
        view.draw(new Canvas(bitmap));
        int[] pixels = new int[bitmap.getWidth() * bitmap.getHeight()];
        bitmap.getPixels(pixels, 0, bitmap.getWidth(), 0, 0, bitmap.getWidth(), bitmap.getHeight());
        bitmap.recycle();
        int count = 0;
        for (int pixel : pixels) {
            if (matchesColor(pixel, color, tolerance)) count++;
        }
        return count;
    }

    private static boolean matchesColor(int pixel, int color, int tolerance) {
        return Math.abs(Color.red(pixel) - Color.red(color)) <= tolerance
                && Math.abs(Color.green(pixel) - Color.green(color)) <= tolerance
                && Math.abs(Color.blue(pixel) - Color.blue(color)) <= tolerance;
    }

    private void onMain(Runnable check) {
        Throwable[] failure = new Throwable[1];
        runOnMainSync(() -> {
            try { check.run(); } catch (Throwable error) { failure[0] = error; }
        });
        if (failure[0] != null) throw new AssertionError("Native chart check failed", failure[0]);
    }

    private static Object field(Object target, String name) {
        try {
            Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            return field.get(target);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private static <T extends View> T find(View root, Class<T> type) {
        if (type.isInstance(root)) return type.cast(root);
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                T found = find(group.getChildAt(i), type);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
