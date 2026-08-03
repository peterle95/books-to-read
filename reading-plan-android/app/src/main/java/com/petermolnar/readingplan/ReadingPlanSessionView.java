package com.petermolnar.readingplan;

import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingPlanSessionView {
    private final MainActivity activity;

    ReadingPlanSessionView(MainActivity activity) {
        this.activity = activity;
    }

    View build() {
        ScrollView scroll = new ScrollView(activity);
        LinearLayout box = activity.verticalBox();
        scroll.addView(box);

        LinearLayout header = activity.row();
        header.addView(activity.heading("Reading session"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(activity.actionButton("Entries", v -> activity.showEntriesSheet()));
        box.addView(header);

        LinearLayout formatCard = activity.surfaceCard();
        formatCard.addView(activity.sectionTitle("Choose a format"));
        LinearLayout formats = activity.row();
        addFormatButton(formats, "Physical", MainActivity.PHYSICAL_BOOKS_LABEL);
        addFormatButton(formats, "Digital", MainActivity.DIGITAL_BOOKS_LABEL);
        addFormatButton(formats, "Audiobooks", MainActivity.AUDIOBOOKS_LABEL);
        formatCard.addView(formats);
        box.addView(formatCard);

        BookSection section = activity.sectionByLabel(activity.selectedBookSection);
        Book selected = selectedSessionBook();
        LinearLayout bookCard = activity.surfaceCard();
        bookCard.addView(activity.sectionTitle("Choose a book"));
        List<Book> sessionBooks = sessionBooks(section);
        if (sessionBooks.isEmpty()) {
            TextView empty = activity.label("No books are available to read today.");
            empty.setTextColor(MainActivity.MOCHA);
            bookCard.addView(empty);
        } else {
            addSessionBookButtons(bookCard, sessionBooks);
        }
        box.addView(bookCard);

        LinearLayout detailsCard = activity.surfaceCard();
        boolean audiobookSection = isAudiobookSection(activity.selectedBookSection);
        EditText dateInput = activity.editText(LocalDate.now().toString(), InputType.TYPE_CLASS_TEXT);
        EditText pageInput = activity.editText("", audiobookSection ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_NUMBER);
        detailsCard.addView(activity.label("Date"));
        detailsCard.addView(dateInput);
        detailsCard.addView(activity.label(audiobookSection ? "Time left" : "Current page"));
        detailsCard.addView(pageInput);

        LinearLayout metrics = activity.row();
        metrics.setPadding(activity.dp(12), activity.dp(10), activity.dp(12), activity.dp(10));
        TextView targetValue = activity.metricValue();
        TextView paceValue = activity.metricValue();
        String targetLabel = audiobookSection ? "Target time left" : "Target page";
        String paceLabel = audiobookSection ? "Time per day" : "Pages per day";
        metrics.addView(activity.metricColumn(targetLabel, targetValue), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        metrics.addView(activity.metricColumn(paceLabel, paceValue), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        detailsCard.addView(metrics);
        Runnable updateTargetCompletion = () -> {
            Book book = selectedSessionBook();
            boolean complete = book != null && activity.isTargetCompleteToday(book)
                    && LocalDate.now().toString().equals(dateInput.getText().toString().trim());
            if (book != null && !complete) {
                complete = activity.markTargetCompletedIfReached(
                        book,
                        activity.selectedBookSection,
                        dateInput.getText().toString().trim(),
                        pageInput.getText().toString().trim()
                );
            }
            metrics.setBackground(activity.roundedBackground(
                    complete ? MainActivity.TARGET_COMPLETE : MainActivity.LIGHT_CREAM,
                    complete ? MainActivity.TARGET_COMPLETE_DARK : MainActivity.BORDER
            ));
            targetValue.setTextColor(complete ? MainActivity.CREAM : MainActivity.ESPRESSO);
            paceValue.setTextColor(complete ? MainActivity.CREAM : MainActivity.ESPRESSO);
        };
        Runnable updateTarget = () -> {
            Book book = selectedSessionBook();
            if (book == null) {
                targetValue.setText("-");
                paceValue.setText("-");
                updateTargetCompletion.run();
                return;
            }
            try {
                SessionTarget target = activity.sessionTarget(activity.selectedBookSection, book, parseDate(dateInput.getText().toString().trim()));
                targetValue.setText(target.value);
                paceValue.setText(target.dailyPace);
            } catch (IllegalArgumentException ex) {
                targetValue.setText("-");
                paceValue.setText("-");
            }
            updateTargetCompletion.run();
        };
        dateInput.addTextChangedListener(new MainActivity.SimpleTextWatcher(updateTarget));
        pageInput.addTextChangedListener(new MainActivity.SimpleTextWatcher(updateTargetCompletion));
        updateTarget.run();

        Button add = activity.actionButton("Add session", v -> {
            Book book = selectedSessionBook();
            if (book == null) {
                activity.showError("Select a book first");
                return;
            }
            try {
                LocalDate sessionDate = parseDate(dateInput.getText().toString().trim());
                int currentPage = isAudiobookSection(activity.selectedBookSection)
                        ? currentTimeFromRemaining(book, parseDuration(pageInput.getText().toString().trim()))
                        : Integer.parseInt(pageInput.getText().toString().trim());
                boolean targetReached = activity.targetReached(book, activity.selectedBookSection, sessionDate, currentPage);
                activity.addReadingSession(book, sessionDate, currentPage, activity.selectedBookSection);
                if (targetReached && sessionDate.equals(LocalDate.now())) {
                    book.targetCompletedDate = sessionDate.toString();
                }
                activity.selectedSessionBookNumber = book.number;
                activity.afterStateChange("Session added");
            } catch (IllegalArgumentException ex) {
                activity.showError(ex.getMessage());
            }
        });
        add.setEnabled(selected != null);
        detailsCard.addView(add);
        box.addView(detailsCard);
        return scroll;
    }

    private void addFormatButton(LinearLayout container, String label, String sectionLabel) {
        Button button = activity.selectionButton(label, sectionLabel.equals(activity.selectedBookSection));
        button.setOnClickListener(v -> {
            activity.selectedBookSection = sectionLabel;
            activity.selectedSessionBookNumber = -1;
            activity.showCurrentTab();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, activity.dp(48), 1);
        params.setMargins(0, 0, activity.dp(6), 0);
        container.addView(button, params);
    }

    private void addSessionBookButtons(LinearLayout container, List<Book> books) {
        for (int start = 0; start < books.size(); start += 2) {
            LinearLayout bookRow = activity.row();
            for (int index = start; index < Math.min(start + 2, books.size()); index++) {
                Book book = books.get(index);
                Button button = activity.selectionButton(book.number + ". " + book.title, book.number == activity.selectedSessionBookNumber);
                int bookNumber = book.number;
                button.setOnClickListener(v -> {
                    activity.selectedSessionBookNumber = bookNumber;
                    activity.showCurrentTab();
                });
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
                params.setMargins(0, 0, index + 1 < books.size() ? activity.dp(6) : 0, activity.dp(6));
                bookRow.addView(button, params);
            }
            container.addView(bookRow);
        }
    }

    private Book selectedSessionBook() {
        BookSection section = activity.sectionByLabel(activity.selectedBookSection);
        List<Book> books = sessionBooks(section);
        for (Book book : books) {
            if (book.number == activity.selectedSessionBookNumber) {
                return book;
            }
        }
        if (books.isEmpty()) {
            activity.selectedSessionBookNumber = -1;
            return null;
        }
        Book first = books.get(0);
        activity.selectedSessionBookNumber = first.number;
        return first;
    }

    private List<Book> sessionBooks(BookSection section) {
        List<Book> available = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (Book book : section.books) {
            if (unitsRemaining(book, section.label) > 0
                    && (book.baselineSchedule == null || !book.baselineSchedule.startDate.isAfter(today))) {
                available.add(book);
            }
        }
        return available;
    }
}
