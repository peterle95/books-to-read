package com.petermolnar.readingplan;

import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

import static com.petermolnar.readingplan.BookCollections.sectionPlanByLabel;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingPlanChartsView {
    private final MainActivity activity;

    ReadingPlanChartsView(MainActivity activity) {
        this.activity = activity;
    }

    ScrollView build() {
        ScrollView scroll = new ScrollView(activity);
        LinearLayout box = activity.verticalBox();
        scroll.addView(box);
        LinearLayout header = activity.row();
        header.addView(activity.heading("Charts"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(activity.secondaryButton("Metrics", v -> {
            activity.showMetricsDialog();
        }));
        box.addView(header);

        List<ReadingPlanChartData> charts = chartData();
        if (charts.isEmpty()) {
            box.addView(activity.label("Add a book to see its chart."));
            return scroll;
        }

        List<String> choices = new ArrayList<>();
        for (ReadingPlanChartData chart : charts) {
            choices.add(chart.sectionLabel + " - " + chart.book.number + ". " + chart.book.title);
        }
        box.addView(activity.label("Book"));
        Spinner bookSpinner = activity.spinner(choices, choices.get(0));
        box.addView(bookSpinner);

        ReadingPlanChartView chartView = new ReadingPlanChartView(activity, charts.get(0));
        chartView.setProjectionVisible(activity.showActualPaceProjection);
        CheckBox projectionToggle = activity.checkBox(
                "Show projection based on actual reading pace",
                activity.showActualPaceProjection
        );
        projectionToggle.setOnCheckedChangeListener((button, checked) -> {
            activity.showActualPaceProjection = checked;
            chartView.setProjectionVisible(checked);
        });
        box.addView(projectionToggle);
        box.addView(chartView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, activity.dp(420)
        ));

        TextView chartDetails = activity.label(chartDetails(charts.get(0)));
        chartDetails.setTextColor(MainActivity.MOCHA);
        box.addView(chartDetails);
        bookSpinner.setOnItemSelectedListener(new MainActivity.SimpleItemSelectedListener(() -> {
            int index = bookSpinner.getSelectedItemPosition();
            if (index >= 0 && index < charts.size()) {
                chartView.setChartData(charts.get(index));
                chartDetails.setText(chartDetails(charts.get(index)));
            }
        }));
        return scroll;
    }

    private List<ReadingPlanChartData> chartData() {
        PlanSummary summary = activity.buildRemainingPlans();
        List<ReadingPlanChartData> charts = new ArrayList<>();
        for (String sectionLabel : MainActivity.BOOK_SECTION_LABELS) {
            SectionPlan plan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
            for (BookDeadline deadline : plan.deadlines) {
                if (totalUnits(deadline.book, sectionLabel) > 0) {
                    charts.add(new ReadingPlanChartData(activity, sectionLabel, deadline.book, deadline));
                }
            }
        }
        return charts;
    }

    private String chartDetails(ReadingPlanChartData chart) {
        boolean audiobook = isAudiobookSection(chart.sectionLabel);
        String projection = chart.actualPace <= 0.0
                ? "no actual pace yet"
                : "actual pace " + (audiobook ? formatDuration(chart.actualPace) : MainActivity.format2(chart.actualPace))
                + (audiobook ? "/day" : " pages/day");
        return chart.startDate + " to " + chart.plannedDeadline
                + " | today " + (audiobook
                ? formatDuration(chart.dailyTargetPages.get(chart.todayIndex))
                : chart.dailyTargetPages.get(chart.todayIndex))
                + (audiobook ? "/day" : " pages/day")
                + " | " + projection;
    }
}
