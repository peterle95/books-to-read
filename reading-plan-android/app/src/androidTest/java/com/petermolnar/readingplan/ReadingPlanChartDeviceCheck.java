package com.petermolnar.readingplan;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.Spinner;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.time.LocalDate;

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
                activity.startDate = today.minusDays(6);
                activity.endDate = today.plusDays(8);
                activity.plannedQuarter = null;
                activity.sections.clear();
                activity.sections.addAll(BookCollections.blankSections());
                addBook(activity, MainActivity.DIGITAL_BOOKS_LABEL, "Projection example (test data)", 1, 100, 53, 21, today);
                addBook(activity, MainActivity.AUDIOBOOKS_LABEL, "Audio example (test data)", 100, 1100, 800, 310, today);
                setField(activity, "jsonLoaded", true);
                setField(activity, "currentTab", "Charts");
                activity.showCurrentTab();
            });
            waitForIdleSync();
            onMain(() -> {
                View root = activity.getWindow().getDecorView();
                ReadingPlanChartView view = find(root, ReadingPlanChartView.class);
                ReadingPlanChartData chart = (ReadingPlanChartData) field(view, "chart");
                checkForecast(chart, today.plusDays(9));
                require(view.getContentDescription().equals(chart.projectionLabel()), "Visible legend must use the forecast date");
                Paint paint = new Paint();
                paint.setTextSize(activity.dp(11));
                require(activity.dp(54) + paint.measureText(chart.projectionLabel()) <= view.getWidth(),
                        "Projection date must fit the phone-width chart");
                require(violetPixels(view) > 0, "Projection must render on the native canvas");
                CheckBox toggle = find(root, CheckBox.class);
                toggle.setChecked(false);
                require(violetPixels(view) == 0, "Disabling projection must hide the curve and legend");
                require(view.getContentDescription().equals("Reading progress chart"), "Hidden estimate must leave accessibility text");
                toggle.setChecked(true);
                require(view.getContentDescription().equals(chart.projectionLabel()), "Re-enabling projection must restore its estimate");
                find(root, Spinner.class).setSelection(1);
            });
            waitForIdleSync();
            onMain(() -> {
                View root = activity.getWindow().getDecorView();
                ReadingPlanChartView view = find(root, ReadingPlanChartView.class);
                ReadingPlanChartData chart = (ReadingPlanChartData) field(view, "chart");
                require(chart.sectionLabel.equals(MainActivity.AUDIOBOOKS_LABEL), "Book selector must update the chart");
                checkForecast(chart, today.plusDays(5));
                require(view.getContentDescription().equals(chart.projectionLabel()), "Switching books must update the estimate");
                find(root, Spinner.class).setSelection(0);
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
                    + "phone-width legend, native canvas, projection toggle, book selection. Screenshot: " + output);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("stream", android.util.Log.getStackTraceString(failure));
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private static void addBook(MainActivity activity, String section, String title, int start, int end,
                                int current, int first, LocalDate today) {
        Book book = new Book(1, title, start, end);
        book.currentPage = current;
        book.readingSessions.add(new ReadingSession(today.minusDays(6), first,
                first - start + (PlanPrimitives.isAudiobookSection(section) ? 0 : 1)));
        book.readingSessions.add(new ReadingSession(today, current, current - first));
        book.baselineSchedule = new BaselineSchedule(activity.startDate, activity.endDate, 6);
        activity.sectionByLabel(section).books.add(book);
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

    private static int violetPixels(View view) {
        Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
        view.draw(new Canvas(bitmap));
        int[] pixels = new int[bitmap.getWidth() * bitmap.getHeight()];
        bitmap.getPixels(pixels, 0, bitmap.getWidth(), 0, 0, bitmap.getWidth(), bitmap.getHeight());
        bitmap.recycle();
        int count = 0;
        for (int pixel : pixels) if (pixel == MainActivity.VIOLET) count++;
        return count;
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
