package com.petermolnar.readingplan;

import android.app.DatePickerDialog;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.time.LocalDate;
import java.util.Locale;

import static com.petermolnar.readingplan.PlanPrimitives.parseDate;

final class ReadingPlanPlanView {
    private final MainActivity activity;

    ReadingPlanPlanView(MainActivity activity) {
        this.activity = activity;
    }

    ScrollView build() {
        ScrollView scroll = new ScrollView(activity);
        LinearLayout box = activity.verticalBox();
        scroll.addView(box);

        LinearLayout header = activity.row();
        header.addView(activity.heading("Plan"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(activity.secondaryButton("New plan", v -> activity.confirmNewPlan()));
        box.addView(header);

        if (activity.showPlanDateFields) {
            EditText startInput = activity.editText(activity.startDate.toString(), InputType.TYPE_CLASS_TEXT);
            android.widget.CheckBox customTarget = activity.checkBox("Custom finish date", "Target finish date".equals(activity.endLabel));
            EditText endInput = activity.editText(activity.endDate.toString(), InputType.TYPE_CLASS_TEXT);
            box.addView(activity.label("Start date"));
            box.addView(startInput);
            box.addView(customTarget);
            box.addView(activity.label("Finish date"));
            box.addView(endInput);
            box.addView(activity.actionButton("Create plan", v -> {
                try {
                    LocalDate parsedStart = parseDate(startInput.getText().toString().trim());
                    LocalDate parsedEnd = parseDate(endInput.getText().toString().trim());
                    if (parsedEnd.isBefore(parsedStart)) {
                        throw new IllegalArgumentException("finish date must be on or after the start date");
                    }
                    activity.startDate = parsedStart;
                    activity.endDate = customTarget.isChecked() ? parsedEnd : MainActivity.periodEndFromStart(activity.startDate);
                    activity.endLabel = customTarget.isChecked() ? "Target finish date" : "Quarter end";
                    activity.recalculateBaselineSchedules(activity.sections, activity.startDate, activity.endDate);
                    activity.afterStateChange("Plan recalculated");
                } catch (IllegalArgumentException ex) {
                    activity.showError(ex.getMessage());
                }
            }));
        } else {
            TextView hint = activity.label("Your current plan is active. Press New plan to choose start and finish dates.");
            hint.setTextColor(MainActivity.MOCHA);
            box.addView(hint);
            box.addView(activity.actionButton("Recalculate current plan", v -> {
                activity.recalculateBaselineSchedules(activity.sections, activity.startDate, activity.endDate);
                activity.afterStateChange("Plan recalculated");
            }));
        }

        box.addView(activity.sectionTitle("Rest-day ranges"));
        LinearLayout restRangeList = activity.verticalBox();
        renderRestDayRanges(restRangeList);
        box.addView(restRangeList);
        EditText restStartInput = activity.editText("", InputType.TYPE_CLASS_TEXT);
        restStartInput.setFocusable(false);
        restStartInput.setOnClickListener(v -> showDatePicker(restStartInput));
        EditText restEndInput = activity.editText("", InputType.TYPE_CLASS_TEXT);
        restEndInput.setFocusable(false);
        restEndInput.setOnClickListener(v -> showDatePicker(restEndInput));
        box.addView(activity.label("Rest start date"));
        box.addView(restStartInput);
        box.addView(activity.label("Rest end date"));
        box.addView(restEndInput);
        box.addView(activity.actionButton("Add rest-day range", v -> {
            try {
                RestDayRange range = new RestDayRange(
                        parseDate(restStartInput.getText().toString().trim()),
                        parseDate(restEndInput.getText().toString().trim())
                );
                if (range.endDate.isBefore(range.startDate)) {
                    throw new IllegalArgumentException("rest-day end date must be on or after the start date");
                }
                activity.restDays.add(range);
                activity.normalizeRestDayRanges();
                activity.afterStateChange("Rest-day range added");
            } catch (IllegalArgumentException ex) {
                activity.showError(ex.getMessage());
            }
        }));
        return scroll;
    }

    private void showDatePicker(EditText input) {
        DatePickerDialog picker = new DatePickerDialog(activity, (view, y, m, d) -> {
            input.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
        }, LocalDate.now().getYear(), LocalDate.now().getMonthValue() - 1, LocalDate.now().getDayOfMonth());
        picker.show();
    }

    private void renderRestDayRanges(LinearLayout container) {
        container.removeAllViews();
        for (int index = 0; index < activity.restDays.size(); index++) {
            final int rangeIndex = index;
            RestDayRange range = activity.restDays.get(index);
            LinearLayout row = activity.row();
            row.addView(activity.label(range.startDate + " ? " + range.endDate),
                    new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            row.addView(activity.secondaryButton("Remove", v -> {
                activity.restDays.remove(rangeIndex);
                activity.afterStateChange("Rest-day range removed");
            }));
            container.addView(row);
        }
    }
}
