package com.petermolnar.readingplan;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static com.petermolnar.readingplan.BookCollections.sectionPlanByLabel;
import static com.petermolnar.readingplan.CsvSupport.csvHeaders;
import static com.petermolnar.readingplan.CsvSupport.csvRow;
import static com.petermolnar.readingplan.PlanPrimitives.format15;
import static com.petermolnar.readingplan.PlanPrimitives.formatDuration;
import static com.petermolnar.readingplan.PlanPrimitives.isAudiobookSection;

final class ReadingPlanCsvReport {
    private final MainActivity activity;

    ReadingPlanCsvReport(MainActivity activity) {
        this.activity = activity;
    }

    String csvText(PlanSummary summary) {
        StringBuilder out = new StringBuilder();
        writeCsvRow(out, Collections.singletonList("Reading plan"));
        writeCsvRow(out, Arrays.asList("Start date", activity.startDate.toString()));
        writeCsvRow(out, Arrays.asList(activity.endLabel, activity.endDate.toString()));
        if (!activity.restDays.isEmpty()) {
            StringBuilder rawRestDays = new StringBuilder();
            for (RestDayRange range : activity.restDays) {
                if (rawRestDays.length() > 0) {
                    rawRestDays.append(';');
                }
                rawRestDays.append(range.startDate).append('/').append(range.endDate);
            }
            writeCsvRow(out, Arrays.asList("Rest days", rawRestDays.toString()));
        }
        SectionPlan physical = sectionPlanByLabel(summary.sectionPlans, MainActivity.PHYSICAL_BOOKS_LABEL);
        SectionPlan digital = sectionPlanByLabel(summary.sectionPlans, MainActivity.DIGITAL_BOOKS_LABEL);
        SectionPlan audiobook = sectionPlanByLabel(summary.sectionPlans, MainActivity.AUDIOBOOKS_LABEL);
        writeCsvRow(out, Arrays.asList("Total remaining pages", String.valueOf(summary.totalPages)));
        writeCsvRow(out, Arrays.asList("Physical remaining pages", String.valueOf(physical.totalPages)));
        writeCsvRow(out, Arrays.asList("Digital remaining pages", String.valueOf(digital.totalPages)));
        writeCsvRow(out, Arrays.asList("Audiobook remaining time", formatDuration(audiobook.totalPages)));
        writeCsvRow(out, Arrays.asList("Highest daily pace", format15(summary.highestDailyPace) + " pages/day"));
        writeCsvRow(out, Arrays.asList("Audiobook daily time", formatDuration(audiobook.dailyPace) + "/day"));
        writeCsvRow(out, Arrays.asList("Status", summary.overallStatus));
        for (String[] row : activity.optionalSummaryRows(summary.sectionPlans, summary.highestDailyPace)) {
            writeCsvRow(out, Arrays.asList(row[0], row[1]));
        }

        for (SectionPlan sectionPlan : summary.sectionPlans) {
            writeCsvRow(out, Collections.emptyList());
            writeCsvRow(out, Collections.singletonList(sectionPlan.section.label));
            writeCsvRow(out, Arrays.asList("Daily pace", SectionPlan.csvDailyPace(sectionPlan)));
            if (!sectionPlan.section.simultaneousGroups.isEmpty()) {
                writeCsvRow(out, Arrays.asList("Simultaneous groups", groupsCompact(sectionPlan.section.simultaneousGroups)));
            }
            writeCsvRow(out, csvHeaders(sectionPlan.section.label));
            for (BookDeadline deadline : sectionPlan.deadlines) {
                writeCsvRow(out, csvRow(deadline, sectionPlan.section.label));
            }
        }
        return out.toString();
    }

    static String sectionDailyPace(SectionPlan sectionPlan) {
        if (isAudiobookSection(sectionPlan.section.label)) {
            return formatDuration(sectionPlan.dailyPace) + "/day";
        }
        return MainActivity.format2(sectionPlan.dailyPace) + " pages/day";
    }

    private static String groupsCompact(List<List<Integer>> groups) {
        List<String> groupTexts = new java.util.ArrayList<>();
        for (List<Integer> group : groups) {
            List<String> ids = new java.util.ArrayList<>();
            for (Integer id : group) {
                ids.add(String.valueOf(id));
            }
            groupTexts.add(String.join(",", ids));
        }
        return String.join(";", groupTexts);
    }

    private static void writeCsvRow(StringBuilder out, List<String> row) {
        for (int i = 0; i < row.size(); i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append(escapeCsv(row.get(i)));
        }
        out.append('\n');
    }

    private static String escapeCsv(String value) {
        if (value == null) {
            return "";
        }
        boolean needsQuotes = value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r");
        String escaped = value.replace("\"", "\"\"");
        return needsQuotes ? "\"" + escaped + "\"" : escaped;
    }
}
