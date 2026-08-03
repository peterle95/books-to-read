package com.petermolnar.readingplan;

import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.List;

final class ReadingPlanUi {
    private final MainActivity activity;

    ReadingPlanUi(MainActivity activity) {
        this.activity = activity;
    }

    Button actionButton(String label, View.OnClickListener listener) {
        Button button = new Button(activity);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(MainActivity.CREAM);
        button.setTextSize(15);
        button.setBackground(roundedBackground(MainActivity.CARAMEL, MainActivity.CARAMEL_DARK));
        button.setOnClickListener(listener);
        button.setMinHeight(activity.dp(48));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, activity.dp(8), activity.dp(4));
        button.setLayoutParams(params);
        attachButtonAnimation(button, MainActivity.CARAMEL, MainActivity.CARAMEL_DARK);
        return button;
    }

    Button secondaryButton(String label, View.OnClickListener listener) {
        Button button = new Button(activity);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(MainActivity.ESPRESSO);
        button.setTextSize(14);
        button.setBackground(roundedBackground(MainActivity.LIGHT_CREAM, MainActivity.BORDER));
        button.setMinHeight(activity.dp(44));
        button.setOnClickListener(listener);
        attachButtonAnimation(button, MainActivity.LIGHT_CREAM, MainActivity.BORDER);
        return button;
    }

    Button selectionButton(String label, boolean selected) {
        Button button = new Button(activity);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTextColor(selected ? MainActivity.CREAM : MainActivity.ESPRESSO);
        button.setGravity(Gravity.CENTER);
        button.setSingleLine(false);
        button.setMinHeight(activity.dp(48));
        button.setBackground(roundedBackground(
                selected ? MainActivity.MOCHA : MainActivity.LIGHT_CREAM,
                selected ? MainActivity.MOCHA : MainActivity.BORDER
        ));
        attachButtonAnimation(
                button,
                selected ? MainActivity.MOCHA : MainActivity.LIGHT_CREAM,
                selected ? MainActivity.MOCHA : MainActivity.BORDER
        );
        return button;
    }

    void attachButtonAnimation(View view, int normalFill, int normalBorder) {
        view.setOnTouchListener((pressedView, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                pressedView.setBackground(roundedBackground(MainActivity.VIOLET, MainActivity.VIOLET_DARK));
                pressedView.setTranslationY(activity.dp(2));
                pressedView.postDelayed(() -> {
                    if (pressedView.isPressed()) {
                        pressedView.animate().translationY(-activity.dp(2)).setDuration(90).start();
                    }
                }, 70);
            } else if (event.getAction() == MotionEvent.ACTION_UP
                    || event.getAction() == MotionEvent.ACTION_CANCEL) {
                if (pressedView == activity.jsonStatusButton) {
                    activity.updateJsonStatus();
                } else {
                    pressedView.setBackground(roundedBackground(normalFill, normalBorder));
                }
                pressedView.animate().translationY(0).setDuration(90).start();
            }
            return false;
        });
    }

    LinearLayout metricColumn(String label, TextView value) {
        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        TextView caption = new TextView(activity);
        caption.setText(label);
        caption.setTextColor(MainActivity.MOCHA);
        caption.setTextSize(12);
        column.addView(caption);
        column.addView(value);
        return column;
    }

    TextView metricValue() {
        TextView value = new TextView(activity);
        value.setText("-");
        value.setTextColor(MainActivity.ESPRESSO);
        value.setTextSize(21);
        value.setTypeface(null, 1);
        value.setPadding(0, activity.dp(2), 0, 0);
        return value;
    }

    GradientDrawable roundedBackground(int fillColor, int borderColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setColor(fillColor);
        drawable.setCornerRadius(activity.dp(14));
        drawable.setStroke(activity.dp(1), borderColor);
        return drawable;
    }

    LinearLayout surfaceCard() {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(activity.dp(14), activity.dp(12), activity.dp(14), activity.dp(12));
        card.setBackground(roundedBackground(MainActivity.CREAM, MainActivity.BORDER));
        card.setElevation(activity.dp(2));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, activity.dp(12));
        card.setLayoutParams(params);
        return card;
    }

    LinearLayout verticalBox() {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(activity.dp(16), activity.dp(12), activity.dp(16), activity.dp(20));
        return box;
    }

    LinearLayout row() {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, activity.dp(4), 0, activity.dp(4));
        return row;
    }

    TextView heading(String text) {
        TextView view = label(text);
        view.setTextSize(24);
        view.setTypeface(null, 1);
        view.setPadding(0, activity.dp(4), 0, activity.dp(12));
        return view;
    }

    TextView sectionTitle(String text) {
        TextView view = label(text);
        view.setTextSize(16);
        view.setTypeface(null, 1);
        view.setPadding(0, activity.dp(12), 0, activity.dp(8));
        return view;
    }

    TextView label(String text) {
        TextView view = new TextView(activity);
        view.setText(text);
        view.setTextColor(MainActivity.ESPRESSO);
        view.setTextSize(14);
        view.setPadding(0, activity.dp(4), 0, activity.dp(4));
        return view;
    }

    TextView monoText(String text) {
        TextView view = label(text);
        view.setTextSize(13);
        view.setTypeface(Typeface.MONOSPACE);
        view.setPadding(activity.dp(12), activity.dp(12), activity.dp(12), activity.dp(12));
        view.setBackground(roundedBackground(MainActivity.LIGHT_CREAM, MainActivity.BORDER));
        return view;
    }

    EditText editText(String value, int inputType) {
        EditText edit = new EditText(activity);
        edit.setText(value);
        edit.setTextColor(MainActivity.ESPRESSO);
        edit.setTextSize(16);
        edit.setSingleLine(true);
        edit.setInputType(inputType);
        edit.setSelectAllOnFocus(false);
        edit.setPadding(activity.dp(12), 0, activity.dp(12), 0);
        edit.setMinHeight(activity.dp(50));
        edit.setBackground(roundedBackground(MainActivity.CREAM, MainActivity.BORDER));
        return edit;
    }

    CheckBox checkBox(String label, boolean checked) {
        CheckBox box = new CheckBox(activity);
        box.setText(label);
        box.setTextColor(MainActivity.ESPRESSO);
        box.setChecked(checked);
        box.setMinHeight(activity.dp(44));
        return box;
    }

    Spinner spinner(List<String> values, String selected) {
        return spinner(values, selected, -1, MainActivity.ESPRESSO);
    }

    Spinner spinner(List<String> values, String selected, int backgroundColor, int selectedTextColor) {
        Spinner spinner = new Spinner(activity);
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(
                activity,
                android.R.layout.simple_spinner_item,
                values
        ) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                View view = super.getView(position, convertView, parent);
                styleSpinnerText(view, selectedTextColor);
                return view;
            }

            @Override
            public View getDropDownView(int position, View convertView, ViewGroup parent) {
                View view = super.getDropDownView(position, convertView, parent);
                styleSpinnerText(view, MainActivity.ESPRESSO);
                view.setBackgroundColor(MainActivity.CREAM);
                return view;
            }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        spinner.setMinimumHeight(activity.dp(48));
        spinner.setBackground(roundedBackground(
                backgroundColor == -1 ? MainActivity.CREAM : backgroundColor,
                MainActivity.BORDER
        ));
        spinner.setPadding(activity.dp(8), 0, activity.dp(8), 0);
        int index = values.indexOf(selected);
        if (index >= 0) {
            spinner.setSelection(index);
        }
        return spinner;
    }

    private void styleSpinnerText(View view, int color) {
        if (view instanceof TextView) {
            TextView text = (TextView) view;
            text.setTextColor(color);
            text.setTextSize(15);
            text.setPadding(activity.dp(12), activity.dp(8), activity.dp(12), activity.dp(8));
        }
    }
}
