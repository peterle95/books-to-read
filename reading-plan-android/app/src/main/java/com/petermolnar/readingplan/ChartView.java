package com.petermolnar.readingplan;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class ChartView extends View {
    private MainActivity.ChartData chart;
    private boolean projectionVisible = true;

    public ChartView(Context context, MainActivity.ChartData chart) {
        super(context);
        this.chart = chart;
        setBackgroundColor(Colors.CREAM);
        setMinimumHeight(dp(300));
    }

    public void setChartData(MainActivity.ChartData chart) {
        this.chart = chart;
        invalidate();
    }

    public void setProjectionVisible(boolean visible) {
        projectionVisible = visible;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (chart == null || chart.dates.isEmpty()) {
            return;
        }

        float left = dp(54);
        float top = dp(42);
        float right = getWidth() - dp(48);
        float bottom = getHeight() - dp(52);
        if (right <= left || bottom <= top) {
            return;
        }
        float plotWidth = right - left;
        float plotHeight = bottom - top;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(dp(11));
        paint.setColor(Colors.MOCHA);

        for (int tick = 0; tick <= 4; tick++) {
            int value = (int) Math.ceil(chart.yMax * tick / 4.0 - 1e-9);
            float y = bottom - plotHeight * tick / 4f;
            paint.setColor(Colors.BORDER);
            paint.setStrokeWidth(dp(1));
            canvas.drawLine(left, y, right, y, paint);
            paint.setColor(Colors.MOCHA);
            canvas.drawText(String.valueOf(value), dp(8), y + dp(4), paint);
        }

        paint.setColor(Colors.ESPRESSO);
        paint.setStrokeWidth(dp(2));
        canvas.drawLine(left, top, left, bottom, paint);
        canvas.drawLine(left, bottom, right, bottom, paint);
        paint.setColor(Colors.CARAMEL);
        canvas.drawLine(right, top, right, bottom, paint);
        for (int tick = 0; tick <= 4; tick++) {
            int value = (int) Math.ceil(chart.dailyYMax * tick / 4.0 - 1e-9);
            float y = bottom - plotHeight * tick / 4f;
            canvas.drawText(String.valueOf(value), right + dp(5), y + dp(4), paint);
        }
        canvas.drawText("Pages/day", right - dp(42), top - dp(10), paint);

        drawSeries(canvas, chart.plannedPages, left, top, plotWidth, plotHeight, Colors.MOCHA, dp(3), chart.yMax, null);
        drawSeries(canvas, chart.actualPages, left, top, plotWidth, plotHeight, Colors.SUCCESS, dp(2), chart.yMax, null);
        drawSeries(
                canvas,
                chart.dailyTargetPages,
                left,
                top,
                plotWidth,
                plotHeight,
                Colors.CARAMEL,
                dp(2),
                chart.dailyYMax,
                new DashPathEffect(new float[]{dp(7), dp(5)}, 0)
        );
        if (projectionVisible) {
            drawSeries(
                    canvas,
                    chart.projectionPages,
                    left,
                    top,
                    plotWidth,
                    plotHeight,
                    Colors.VIOLET,
                    dp(2),
                    chart.yMax,
                    new DashPathEffect(new float[]{dp(4), dp(4)}, 0)
            );
        }

        float todayX = xForIndex(chart.todayIndex, chart.dates.size(), left, plotWidth);
        paint.setColor(Colors.ERROR);
        paint.setStrokeWidth(dp(2));
        paint.setPathEffect(new DashPathEffect(new float[]{dp(6), dp(4)}, 0));
        canvas.drawLine(todayX, top, todayX, bottom, paint);
        paint.setPathEffect(null);
        paint.setTextSize(dp(11));
        canvas.drawText("Today", Math.max(left, todayX - dp(17)), top - dp(10), paint);

        int labelStep = Math.max(1, (chart.dates.size() - 1) / 4);
        for (int index = 0; index < chart.dates.size(); index += labelStep) {
            drawDateLabel(canvas, chart.dates.get(index), index, chart.dates.size(), left, right, bottom, paint);
        }
        int last = chart.dates.size() - 1;
        if (last % labelStep != 0) {
            drawDateLabel(canvas, chart.dates.get(last), last, chart.dates.size(), left, right, bottom, paint);
        }

        paint.setColor(Colors.MOCHA);
        canvas.drawText("Plan", left, dp(18), paint);
        paint.setColor(Colors.SUCCESS);
        canvas.drawText("Actual", left + dp(60), dp(18), paint);
        paint.setColor(Colors.CARAMEL);
        canvas.drawText("Daily target", left + dp(120), dp(18), paint);
        if (projectionVisible) {
            paint.setColor(Colors.VIOLET);
            canvas.drawText("Projection", left + dp(210), dp(18), paint);
        }
        canvas.save();
        canvas.rotate(-90, dp(15), (top + bottom) / 2);
        paint.setColor(Colors.MOCHA);
        canvas.drawText("Pages", dp(15), (top + bottom) / 2, paint);
        canvas.restore();
    }

    private void drawSeries(
            Canvas canvas,
            List<Integer> values,
            float left,
            float top,
            float width,
            float height,
            int color,
            float strokeWidth,
            int valueMax,
            DashPathEffect pathEffect
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
            Canvas canvas,
            LocalDate date,
            int index,
            int count,
            float left,
            float right,
            float bottom,
            Paint paint
    ) {
        String text = String.format(Locale.US, "%02d-%02d", date.getMonthValue(), date.getDayOfMonth());
        float x = xForIndex(index, count, left, right - left);
        paint.setColor(Colors.MOCHA);
        canvas.drawText(text, Math.min(x - dp(17), right - dp(34)), bottom + dp(22), paint);
    }

    private float xForIndex(int index, int count, float left, float width) {
        return count <= 1 ? left : left + width * index / (count - 1);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}