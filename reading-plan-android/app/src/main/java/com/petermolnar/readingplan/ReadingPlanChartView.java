package com.petermolnar.readingplan;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

import static com.petermolnar.readingplan.PlanPrimitives.formatDuration;
import static com.petermolnar.readingplan.PlanPrimitives.isAudiobookSection;

final class ReadingPlanChartView extends View {
    private final MainActivity activity;
    private ReadingPlanChartData chart;
    private boolean projectionVisible = true;

    ReadingPlanChartView(MainActivity activity, ReadingPlanChartData chart) {
        super(activity);
        this.activity = activity;
        this.chart = chart;
        setBackgroundColor(MainActivity.CREAM);
        setMinimumHeight(activity.dp(300));
    }

    void setChartData(ReadingPlanChartData chart) {
        this.chart = chart;
        invalidate();
    }

    void setProjectionVisible(boolean visible) {
        projectionVisible = visible;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (chart == null || chart.dates.isEmpty()) {
            return;
        }

        float left = activity.dp(54);
        float top = activity.dp(42);
        float right = getWidth() - activity.dp(48);
        float bottom = getHeight() - activity.dp(52);
        if (right <= left || bottom <= top) {
            return;
        }
        float plotWidth = right - left;
        float plotHeight = bottom - top;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(activity.dp(11));
        paint.setColor(MainActivity.MOCHA);
        boolean audiobook = isAudiobookSection(chart.sectionLabel);

        for (int tick = 0; tick <= 4; tick++) {
            int value = (int) Math.ceil(chart.yMax * tick / 4.0 - 1e-9);
            float y = bottom - plotHeight * tick / 4f;
            paint.setColor(MainActivity.BORDER);
            paint.setStrokeWidth(activity.dp(1));
            canvas.drawLine(left, y, right, y, paint);
            paint.setColor(MainActivity.MOCHA);
            canvas.drawText(chartValue(value, audiobook), activity.dp(8), y + activity.dp(4), paint);
        }

        paint.setColor(MainActivity.ESPRESSO);
        paint.setStrokeWidth(activity.dp(2));
        canvas.drawLine(left, top, left, bottom, paint);
        canvas.drawLine(left, bottom, right, bottom, paint);
        paint.setColor(MainActivity.CARAMEL);
        canvas.drawLine(right, top, right, bottom, paint);
        for (int tick = 0; tick <= 4; tick++) {
            int value = (int) Math.ceil(chart.dailyYMax * tick / 4.0 - 1e-9);
            float y = bottom - plotHeight * tick / 4f;
            canvas.drawText(chartValue(value, audiobook), right + activity.dp(5), y + activity.dp(4), paint);
        }
        canvas.drawText(audiobook ? "Time/day" : "Pages/day", right - activity.dp(42), top - activity.dp(10), paint);

        drawSeries(canvas, chart.plannedPages, left, top, plotWidth, plotHeight, MainActivity.MOCHA, activity.dp(3), chart.yMax, null);
        drawSeries(canvas, chart.actualPages, left, top, plotWidth, plotHeight, MainActivity.SUCCESS, activity.dp(2), chart.yMax, null);
        drawSeries(
                canvas, chart.dailyTargetPages, left, top, plotWidth, plotHeight, MainActivity.CARAMEL,
                activity.dp(2), chart.dailyYMax, new DashPathEffect(new float[]{activity.dp(7), activity.dp(5)}, 0)
        );
        if (projectionVisible) {
            drawSeries(
                    canvas, chart.projectionPages, left, top, plotWidth, plotHeight, MainActivity.VIOLET,
                    activity.dp(2), chart.yMax, new DashPathEffect(new float[]{activity.dp(4), activity.dp(4)}, 0)
            );
        }

        float todayX = xForIndex(chart.todayIndex, chart.dates.size(), left, plotWidth);
        paint.setColor(MainActivity.ERROR);
        paint.setStrokeWidth(activity.dp(2));
        paint.setPathEffect(new DashPathEffect(new float[]{activity.dp(6), activity.dp(4)}, 0));
        canvas.drawLine(todayX, top, todayX, bottom, paint);
        paint.setPathEffect(null);
        paint.setTextSize(activity.dp(11));
        canvas.drawText("Today", Math.max(left, todayX - activity.dp(17)), top - activity.dp(10), paint);

        int labelStep = Math.max(1, (chart.dates.size() - 1) / 4);
        for (int index = 0; index < chart.dates.size(); index += labelStep) {
            drawDateLabel(canvas, chart.dates.get(index), index, chart.dates.size(), left, right, bottom, paint);
        }
        int last = chart.dates.size() - 1;
        if (last % labelStep != 0) {
            drawDateLabel(canvas, chart.dates.get(last), last, chart.dates.size(), left, right, bottom, paint);
        }

        paint.setColor(MainActivity.MOCHA);
        canvas.drawText("Plan", left, activity.dp(18), paint);
        paint.setColor(MainActivity.SUCCESS);
        canvas.drawText("Actual", left + activity.dp(60), activity.dp(18), paint);
        paint.setColor(MainActivity.CARAMEL);
        canvas.drawText("Daily target", left + activity.dp(120), activity.dp(18), paint);
        if (projectionVisible) {
            paint.setColor(MainActivity.VIOLET);
            canvas.drawText("Projection", left + activity.dp(210), activity.dp(18), paint);
        }
        canvas.save();
        canvas.rotate(-90, activity.dp(15), (top + bottom) / 2);
        paint.setColor(MainActivity.MOCHA);
        canvas.drawText(audiobook ? "Time" : "Pages", activity.dp(15), (top + bottom) / 2, paint);
        canvas.restore();
    }

    private String chartValue(int value, boolean audiobook) {
        return audiobook ? formatDuration(value) : String.valueOf(value);
    }

    private void drawSeries(
            Canvas canvas, List<Integer> values, float left, float top, float width, float height,
            int color, float strokeWidth, int valueMax, DashPathEffect pathEffect
    ) {
        if (values.isEmpty()) {
            return;
        }
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(strokeWidth);
        paint.setPathEffect(pathEffect);
        Path path = new Path();
        boolean hasPoint = false;
        for (int index = 0; index < values.size(); index++) {
            if (values.get(index) < 0) {
                hasPoint = false;
                continue;
            }
            float x = xForIndex(index, values.size(), left, width);
            float y = top + height - height * values.get(index) / valueMax;
            if (!hasPoint) {
                path.moveTo(x, y);
            } else {
                path.lineTo(x, y);
            }
            hasPoint = true;
        }
        canvas.drawPath(path, paint);
        paint.setPathEffect(null);
    }

    private void drawDateLabel(
            Canvas canvas, LocalDate date, int index, int count, float left, float right, float bottom, Paint paint
    ) {
        String text = String.format(Locale.US, "%02d-%02d", date.getMonthValue(), date.getDayOfMonth());
        float x = xForIndex(index, count, left, right - left);
        paint.setColor(MainActivity.MOCHA);
        canvas.drawText(text, Math.min(x - activity.dp(17), right - activity.dp(34)), bottom + activity.dp(22), paint);
    }

    private static float xForIndex(int index, int count, float left, float width) {
        return count <= 1 ? left : left + width * index / (count - 1);
    }
}
