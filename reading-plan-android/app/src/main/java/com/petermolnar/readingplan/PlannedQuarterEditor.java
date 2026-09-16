package com.petermolnar.readingplan;

import android.app.AlertDialog;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import org.json.JSONException;
import java.time.LocalDate;
import static com.petermolnar.readingplan.BookCollections.*;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class PlannedQuarterEditor {
    private final MainActivity activity;
    private PlannedQuarter draft;
    private BookSection selectedSection;
    private Book selected;

    PlannedQuarterEditor(MainActivity activity) { this.activity = activity; }

    void show() {
        activity.checkQuarterRollover();
        PlannedQuarter original = activity.plannedQuarter;
        try {
            draft = activity.plannedQuarter == null
                    ? new PlannedQuarter(ReadingPlanCalendar.nextQuarterStart(
                            activity.startDate.isAfter(LocalDate.now()) ? activity.startDate : LocalDate.now()), blankSections())
                    : PlannedQuarter.fromJson(activity, activity.plannedQuarter.toJson(activity), activity.sections);
        } catch (JSONException | IllegalArgumentException error) {
            activity.showError(error.getMessage());
            return;
        }
        LinearLayout box = activity.verticalBox();
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(box);
        box.addView(activity.label("Unfinished current books will continue before these books."));
        LinearLayout books = activity.verticalBox();
        box.addView(books);
        Spinner format = activity.spinner(MainActivity.BOOK_SECTION_LABELS, MainActivity.PHYSICAL_BOOKS_LABEL);
        box.addView(activity.label("Format"));
        box.addView(format);
        EditText title = activity.editText("", InputType.TYPE_CLASS_TEXT);
        EditText start = activity.editText("", InputType.TYPE_CLASS_TEXT);
        EditText end = activity.editText("", InputType.TYPE_CLASS_TEXT);
        box.addView(activity.label("Title")); box.addView(title);
        box.addView(activity.label("Start page/time (audio: HH:MM or HH:MM:SS)")); box.addView(start);
        box.addView(activity.label("End page/time")); box.addView(end);
        Runnable refresh = () -> {
            books.removeAllViews();
            for (BookSection section : draft.sections) for (Book book : section.books) {
                books.addView(activity.secondaryButton(section.label + " — " + book.title, v -> {
                    selected = book;
                    selectedSection = section;
                    format.setSelection(MainActivity.BOOK_SECTION_LABELS.indexOf(section.label));
                    title.setText(book.title);
                    start.setText(displayValue(section.label, book.startPage));
                    end.setText(displayValue(section.label, book.endPage));
                }));
            }
        };
        java.util.function.Consumer<Boolean> storeBook = replace -> {
            String label = String.valueOf(format.getSelectedItem());
            BookFields fields = activity.readBookFields(label, title, start, end, "", isAudiobookSection(label) ? 0 : 1, null);
            if (fields == null) return;
            if (fields.title.trim().isEmpty()) { activity.showError("Book title is required"); return; }
            if (replace && selected == null) { activity.showError("Select a planned book first"); return; }
            BookSection section = null;
            for (BookSection candidate : draft.sections) if (candidate.label.equals(label)) section = candidate;
            Book book = new Book(section.books.size() + 1, fields.title, fields.startPage, fields.endPage);
            if (replace && selectedSection == section) {
                section.books.set(section.books.indexOf(selected), book);
            } else {
                if (replace) removeSelected();
                section.books.add(book);
            }
            selected = book;
            selectedSection = section;
            for (BookSection candidate : draft.sections) renumberBooks(candidate.books);
            refresh.run();
        };
        box.addView(activity.actionButton("Add", v -> storeBook.accept(false)));
        box.addView(activity.actionButton("Update selected", v -> storeBook.accept(true)));
        box.addView(activity.secondaryButton("Remove selected", v -> {
            if (selected == null) return;
            removeSelected();
            selected = null;
            refresh.run();
        }));
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Next quarter — " + draft.startDate)
                .setView(scroll)
                .setPositiveButton("Save plan", (ignored, which) -> {
                    if (activity.plannedQuarter != original) {
                        activity.showError("The plan changed while you were editing. Reopen the editor before saving.");
                        return;
                    }
                    activity.plannedQuarter = draft;
                    activity.afterStateChange("Next-quarter plan saved");
                    activity.checkQuarterRollover();
                })
                .setNegativeButton("Cancel", null).create();
        activity.quarterDialog = dialog;
        refresh.run();
        dialog.show();
    }

    private void removeSelected() {
        int number = selected.number;
        selectedSection.books.remove(selected);
        renumberBooks(selectedSection.books);
        selectedSection.simultaneousGroups = remapGroupsAfterDeletion(
                selectedSection.simultaneousGroups, number, selectedSection.books);
    }
}
