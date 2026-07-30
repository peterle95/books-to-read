package com.petermolnar.readingplan;

import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TableLayout;
import android.widget.TextView;

import java.util.Arrays;

import static com.petermolnar.readingplan.BookCollections.sectionPlanByLabel;
import static com.petermolnar.readingplan.PlanPrimitives.formatDuration;

final class ReadingPlanMetricsView {
    private final MainActivity activity;

    ReadingPlanMetricsView(MainActivity activity) {
        this.activity = activity;
    }

    ScrollView build() {
        ScrollView scroll = new ScrollView(activity);
        LinearLayout box = activity.verticalBox();
        scroll.addView(box);

        LinearLayout header = activity.row();
        header.addView(activity.heading(activity.metricDetail == null ? "Metrics" : activity.metricDetail), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (activity.metricDetail == null) {
            header.addView(activity.secondaryButton("Back to charts", v -> {
                activity.metricsSubview = false;
                activity.showCurrentTab();
            }));
        } else {
            header.addView(activity.secondaryButton("Back to metrics", v -> {
                activity.metricDetail = null;
                activity.showCurrentTab();
            }));
        }
        box.addView(header);
        TextView helper = activity.label(activity.metricDetail == null
                ? "Your current book schedules."
                : "Choose Back to metrics to return to the schedules.");
        helper.setTextColor(MainActivity.MOCHA);
        box.addView(helper);
        PlanSummary summary = activity.buildRemainingPlans();
        if (activity.metricDetail == null) {
            for (SectionPlan sectionPlan : summary.sectionPlans) {
                LinearLayout scheduleCard = activity.surfaceCard();
                scheduleCard.addView(activity.sectionTitle(sectionPlan.section.label));
                if (sectionPlan.deadlines.isEmpty()) {
                    scheduleCard.addView(activity.label("No scheduled books."));
                } else {
                    scheduleCard.addView(activity.bookScheduleTable(sectionPlan));
                }
                box.addView(scheduleCard);
            }
            box.addView(activity.secondaryButton("Summary metrics", v -> openDetail("Summary metrics")));
            box.addView(activity.secondaryButton("Schedule information", v -> openDetail("Schedule information")));
            box.addView(activity.secondaryButton("Key metrics", v -> openDetail("Key metrics")));
            return scroll;
        }

        SectionPlan audiobook = sectionPlanByLabel(summary.sectionPlans, MainActivity.AUDIOBOOKS_LABEL);
        TableLayout table = new TableLayout(activity);
        activity.addTableRow(table, true, Arrays.asList("Area", "Metric", "Value", "Details"), -1);
        if ("Key metrics".equals(activity.metricDetail)) {
            activity.addMetricRow(table, "Overview", "Remaining pages", String.valueOf(summary.totalPages), "Physical + digital");
            activity.addMetricRow(table, "Overview", "Audiobook remaining time", formatDuration(audiobook.totalPages), "All audiobook titles");
            activity.addMetricRow(table, "Plan", "Reading days", String.valueOf(activity.availableReadingDaysCount(activity.startDate, activity.endDate)), "Rest days excluded");
            activity.addMetricRow(table, "Plan", "Highest daily pace", MainActivity.format2(summary.highestDailyPace) + " pages/day", "Physical and digital");
            activity.addMetricRow(table, "Plan", "Status", summary.overallStatus, "Current plan");
        } else if ("Summary metrics".equals(activity.metricDetail)) {
            for (String[] metric : activity.allOptionalSummaryRows(summary.sectionPlans, summary.highestDailyPace)) {
                activity.addMetricRow(table, "Summary", metric[0], metric[1], "Optional metric");
            }
        } else if ("Schedule information".equals(activity.metricDetail)) {
            activity.addMetricRow(table, "Schedule", "Plan period", activity.startDate + " to " + activity.endDate, activity.endLabel);
            for (SectionPlan sectionPlan : summary.sectionPlans) {
                String pace = activity.sectionDailyPace(sectionPlan);
                String result = sectionPlan.deadlines.isEmpty()
                        ? "No books"
                        : activity.finalResultMessage(
                                sectionPlan.deadlines.get(sectionPlan.deadlines.size() - 1).deadline,
                                activity.endDate,
                                activity.endName()
                        );
                activity.addMetricRow(table, sectionPlan.section.label, "Daily pace", pace, result);
            }
        }
        HorizontalScrollView tableScroll = new HorizontalScrollView(activity);
        tableScroll.addView(table);
        box.addView(tableScroll);
        return scroll;
    }

    private void openDetail(String detail) {
        activity.metricDetail = detail;
        activity.showCurrentTab();
    }
}
