package com.petermolnar.readingplan;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TableLayout;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import static com.petermolnar.readingplan.BookCollections.*;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingPlanBooksView {
    private final MainActivity activity;

    ReadingPlanBooksView(MainActivity activity) {
        this.activity = activity;
    }

    ScrollView build() {
        ScrollView scroll = new ScrollView(activity);
        LinearLayout box = activity.verticalBox();
        scroll.addView(box);

        box.addView(activity.heading("Books"));
        Spinner sectionSpinner = activity.spinner(MainActivity.BOOK_SECTION_LABELS, activity.selectedBookSection);
        box.addView(activity.label("Format"));
        box.addView(sectionSpinner);
        sectionSpinner.setOnItemSelectedListener(new MainActivity.SimpleItemSelectedListener(() -> {
            activity.selectedBookSection = String.valueOf(sectionSpinner.getSelectedItem());
            activity.selectedBookIndex = -1;
            activity.showCurrentTab();
        }));

        BookSection section = activity.sectionByLabel(activity.selectedBookSection);
        box.addView(activity.actionButton("Choose book to edit", v -> showBookPicker(section)));
        Book selected = activity.selectedBook(section);
        boolean audiobookSection = isAudiobookSection(section.label);
        EditText titleInput = activity.editText(selected == null ? "" : selected.title, InputType.TYPE_CLASS_TEXT);
        EditText startPageInput = activity.editText(
                selected == null ? (audiobookSection ? "0:00" : "1") : displayValue(section.label, selected.startPage),
                audiobookSection ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_NUMBER
        );
        EditText endPageInput = activity.editText(
                selected == null ? "" : displayValue(section.label, selected.endPage),
                audiobookSection ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_NUMBER
        );
        EditText startDateInput = activity.editText(
                selected == null || selected.startDateOverride == null ? "" : selected.startDateOverride.toString(),
                InputType.TYPE_CLASS_TEXT
        );
        startDateInput.setFocusable(false);
        startDateInput.setOnClickListener(v -> showDatePicker(startDateInput,
                selected != null && selected.startDateOverride != null ? selected.startDateOverride : LocalDate.now()));
        EditText deadlineInput = activity.editText(
                selected == null || selected.deadlineOverride == null ? "" : selected.deadlineOverride.toString(),
                InputType.TYPE_CLASS_TEXT
        );
        deadlineInput.setFocusable(false);
        deadlineInput.setOnClickListener(v -> showDatePicker(deadlineInput,
                selected != null && selected.deadlineOverride != null ? selected.deadlineOverride : LocalDate.now()));
        box.addView(activity.label("Title"));
        box.addView(titleInput);
        box.addView(activity.label(audiobookSection ? "Start time" : "Start page"));
        box.addView(startPageInput);
        box.addView(activity.label(audiobookSection ? "End time" : "End page"));
        box.addView(endPageInput);
        box.addView(activity.label("Start date override"));
        box.addView(startDateInput);
        box.addView(activity.actionButton("Set start date", v -> {
            try {
                if (selected == null) {
                    throw new IllegalArgumentException("Select a book first");
                }
                String raw = startDateInput.getText().toString().trim();
                LocalDate override = raw.isEmpty() ? null : parseDate(raw);
                activity.applyStartDateOverride(section, selected, override, activity.startDate);
                activity.afterStateChange("Start date override updated");
            } catch (IllegalArgumentException ex) {
                activity.showError(ex.getMessage());
            }
        }));
        box.addView(activity.label("Deadline override"));
        box.addView(deadlineInput);
        box.addView(activity.actionButton("Set deadline", v -> {
            try {
                if (selected == null) {
                    throw new IllegalArgumentException("Select a book first");
                }
                String raw = deadlineInput.getText().toString().trim();
                LocalDate override = raw.isEmpty() ? null : parseDate(raw);
                activity.applyDeadlineOverride(section, selected, override, activity.endDate);
                activity.afterStateChange("Deadline override updated");
            } catch (IllegalArgumentException ex) {
                activity.showError(ex.getMessage());
            }
        }));

        LinearLayout buttons1 = activity.row();
        buttons1.addView(activity.actionButton("Add", v -> {
            BookFields fields = activity.readBookFields(
                    section.label, titleInput, startPageInput, endPageInput,
                    "Book " + (section.books.size() + 1), audiobookSection ? 0 : 1, null
            );
            if (fields == null) {
                return;
            }
            section.books.add(new Book(section.books.size() + 1, fields.title, fields.startPage, fields.endPage));
            renumberBooks(section.books);
            activity.selectedBookIndex = section.books.size() - 1;
            activity.invalidateBaselineSchedules(section);
            activity.afterStateChange("Book added");
        }));
        buttons1.addView(activity.actionButton("Insert Before", v -> {
            if (!activity.hasSelectedBook(section)) {
                activity.showError("Select a book first");
                return;
            }
            int position = activity.selectedBookIndex + 1;
            if (insertionSplitsSimultaneousGroup(position, section.simultaneousGroups) != null) {
                activity.showError("Insert before or after the simultaneous group instead");
                return;
            }
            BookFields fields = activity.readBookFields(
                    section.label, titleInput, startPageInput, endPageInput,
                    "Book " + position, audiobookSection ? 0 : 1, null
            );
            if (fields == null) {
                return;
            }
            section.books.add(activity.selectedBookIndex, new Book(position, fields.title, fields.startPage, fields.endPage));
            renumberBooks(section.books);
            try {
                section.simultaneousGroups = remapGroupsAfterAddition(section.simultaneousGroups, position, section.books);
            } catch (IllegalArgumentException ex) {
                activity.showError(ex.getMessage());
                return;
            }
            activity.invalidateBaselineSchedules(section);
            activity.afterStateChange("Book inserted");
        }));
        box.addView(buttons1);

        LinearLayout buttons2 = activity.row();
        buttons2.addView(activity.actionButton("Replace Selected", v -> {
            if (!activity.hasSelectedBook(section)) {
                activity.showError("Select a book first");
                return;
            }
            Book oldBook = section.books.get(activity.selectedBookIndex);
            BookFields fields = activity.readBookFields(section.label, titleInput, startPageInput, endPageInput, oldBook.title, oldBook.startPage, oldBook.endPage);
            if (fields == null) {
                return;
            }
            Integer currentPage = oldBook.currentPage;
            if (currentPage != null && (currentPage < fields.startPage || currentPage > fields.endPage)) {
                currentPage = null;
            }
            List<ReadingSession> sessions = oldBook.startPage == fields.startPage && oldBook.endPage == fields.endPage
                    ? oldBook.readingSessions : new ArrayList<>();
            section.books.set(activity.selectedBookIndex, new Book(oldBook.number, fields.title, fields.startPage, fields.endPage, currentPage, sessions, oldBook.baselineSchedule, oldBook.deadlineOverride, oldBook.startDateOverride, oldBook.targetCompletedDate, oldBook.id));
            activity.invalidateBaselineSchedules(section);
            activity.afterStateChange("Book replaced");
        }));
        buttons2.addView(activity.actionButton("Delete Selected", v -> {
            if (!activity.hasSelectedBook(section)) {
                activity.showError("Select a book first");
                return;
            }
            int deletedId = activity.selectedBookIndex + 1;
            section.books.remove(activity.selectedBookIndex);
            renumberBooks(section.books);
            try {
                section.simultaneousGroups = remapGroupsAfterDeletion(section.simultaneousGroups, deletedId, section.books);
            } catch (IllegalArgumentException ex) {
                activity.showError(ex.getMessage());
                return;
            }
            activity.selectedBookIndex = Math.min(activity.selectedBookIndex, section.books.size() - 1);
            activity.invalidateBaselineSchedules(section);
            activity.afterStateChange("Book deleted");
        }));
        Button complete = activity.actionButton("Complete Selected", v -> {
            if (!activity.hasSelectedBook(section)) {
                activity.showError("Select a book first");
                return;
            }
            Book book = section.books.get(activity.selectedBookIndex);
            if (completedUnits(book, section.label) >= totalUnits(book, section.label)) {
                activity.showError("Book is already complete");
                return;
            }
            activity.addReadingSession(book, LocalDate.now(), book.endPage, section.label);
            activity.afterStateChange("Book completed");
        });
        box.addView(buttons2);
        box.addView(complete);

        LinearLayout buttons3 = activity.row();
        buttons3.addView(activity.actionButton("Move Up", v -> activity.moveSelectedBook(section, -1)));
        buttons3.addView(activity.actionButton("Move Down", v -> activity.moveSelectedBook(section, 1)));
        box.addView(buttons3);

        box.addView(activity.sectionTitle("Simultaneous groups"));
        LinearLayout groupButtons = activity.row();
        groupButtons.addView(activity.actionButton("Select simultaneous books", v -> showSimultaneousBookPicker(section)));
        groupButtons.addView(activity.secondaryButton("Clear groups", v -> {
            section.simultaneousGroups = new ArrayList<>();
            activity.invalidateBaselineSchedules(section);
            activity.afterStateChange("Groups cleared");
        }));
        box.addView(groupButtons);

        box.addView(activity.sectionTitle("Today's reading"));
        PlanSummary summary = activity.buildRemainingPlans();
        for (String sectionLabel : MainActivity.BOOK_SECTION_LABELS) {
            SectionPlan todayPlan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
            box.addView(activity.sectionTitle(sectionLabel));
            if (todayPlan.deadlines.isEmpty()) {
                box.addView(activity.label("No books in this format."));
                continue;
            }
            HorizontalScrollView todayTableScroll = new HorizontalScrollView(activity);
            TableLayout todayTable = new TableLayout(activity);
            activity.addTableRow(todayTable, true, Arrays.asList("Name", "Pages/time today", "Start", "Deadline"), -1);
            for (BookDeadline deadline : todayPlan.deadlines) {
                activity.addTableRow(todayTable, false, Arrays.asList(
                        deadline.book.title,
                        activity.todayTargetValue(sectionLabel, deadline),
                        deadline.startDate.toString(),
                        deadline.deadline.toString()
                ), -1);
            }
            todayTableScroll.addView(todayTable);
            box.addView(todayTableScroll);
        }

        return scroll;
    }

    private void showDatePicker(EditText input, LocalDate initial) {
        DatePickerDialog picker = new DatePickerDialog(activity, (view, y, m, d) -> {
            input.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
        }, initial.getYear(), initial.getMonthValue() - 1, initial.getDayOfMonth());
        picker.show();
    }

    private void showBookPicker(BookSection section) {
        if (section.books.isEmpty()) {
            activity.showError("Add a book first");
            return;
        }
        String[] choices = Book.bookChoices(section).toArray(new String[0]);
        new AlertDialog.Builder(activity)
                .setTitle("Choose a book to edit")
                .setSingleChoiceItems(choices, activity.selectedBookIndex, (dialog, which) -> {
                    activity.selectedBookIndex = which;
                    dialog.dismiss();
                    activity.showCurrentTab();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showSimultaneousBookPicker(BookSection section) {
        if (section.books.size() < 2) {
            activity.showError("Add at least two books first");
            return;
        }
        String[] choices = Book.bookChoices(section).toArray(new String[0]);
        boolean[] checked = new boolean[section.books.size()];
        int selectedGroup = -1;
        for (int groupIndex = 0; groupIndex < section.simultaneousGroups.size(); groupIndex++) {
            List<Integer> group = section.simultaneousGroups.get(groupIndex);
            if (activity.hasSelectedBook(section) && group.contains(activity.selectedBookIndex + 1)) {
                selectedGroup = groupIndex;
                for (Integer bookId : group) {
                    checked[bookId - 1] = true;
                }
                break;
            }
        }
        final int groupToReplace = selectedGroup;
        new AlertDialog.Builder(activity)
                .setTitle("Select books to read simultaneously")
                .setMultiChoiceItems(choices, checked, (dialog, which, isChecked) -> checked[which] = isChecked)
                .setPositiveButton("Apply", (dialog, which) -> {
                    List<Integer> selectedIds = new ArrayList<>();
                    for (int index = 0; index < checked.length; index++) {
                        if (checked[index]) {
                            selectedIds.add(index + 1);
                        }
                    }
                    applySimultaneousSelection(section, selectedIds, groupToReplace);
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void applySimultaneousSelection(BookSection section, List<Integer> selectedIds, int groupToReplace) {
        if (selectedIds.size() == 1) {
            activity.showError("Choose at least two books, or clear the selection");
            return;
        }
        List<List<Integer>> updated = new ArrayList<>();
        for (int index = 0; index < section.simultaneousGroups.size(); index++) {
            List<Integer> group = section.simultaneousGroups.get(index);
            boolean overlaps = index == groupToReplace;
            for (Integer bookId : selectedIds) {
                overlaps = overlaps || group.contains(bookId);
            }
            if (!overlaps) {
                updated.add(new ArrayList<>(group));
            }
        }
        if (selectedIds.size() >= 2) {
            updated.add(new ArrayList<>(selectedIds));
        }
        try {
            section.simultaneousGroups = validateSimultaneousGroups(section.books, updated);
            activity.invalidateBaselineSchedules(section);
            activity.afterStateChange("Groups updated");
        } catch (IllegalArgumentException ex) {
            activity.showError(ex.getMessage());
        }
    }
}
