package com.petermolnar.readingplan;

import android.app.AlertDialog;
import android.app.Dialog;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static com.petermolnar.readingplan.PlanPrimitives.formatDuration;
import static com.petermolnar.readingplan.PlanPrimitives.isAudiobookSection;
import static com.petermolnar.readingplan.PlanPrimitives.remainingTimeAt;

final class ReadingSessionEntries {
    private final MainActivity activity;

    ReadingSessionEntries(MainActivity activity) {
        this.activity = activity;
    }

    void show() {
        Dialog sheet = new Dialog(activity);
        LinearLayout panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(activity.dp(20), activity.dp(12), activity.dp(20), activity.dp(20));
        panel.setBackgroundColor(MainActivity.CREAM);

        View handle = new View(activity);
        handle.setBackground(activity.roundedBackground(MainActivity.BORDER, MainActivity.BORDER));
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(activity.dp(44), activity.dp(5));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.setMargins(0, 0, 0, activity.dp(12));
        panel.addView(handle, handleParams);

        LinearLayout header = activity.row();
        header.addView(activity.heading("Entries"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button close = activity.secondaryButton("Close", v -> sheet.dismiss());
        header.addView(close);
        panel.addView(header);

        ScrollView scroll = new ScrollView(activity);
        LinearLayout entriesBox = new LinearLayout(activity);
        entriesBox.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(entriesBox);
        List<SessionEntry> entries = all();
        if (entries.isEmpty()) {
            TextView empty = activity.label("No reading entries yet. Add your first session from the Session tab.");
            empty.setTextColor(MainActivity.MOCHA);
            empty.setPadding(0, activity.dp(24), 0, activity.dp(24));
            entriesBox.addView(empty);
        } else {
            for (SessionEntry entry : entries) {
                LinearLayout card = activity.surfaceCard();
                TextView title = activity.sectionTitle(entry.book.number + ". " + entry.book.title);
                title.setPadding(0, 0, 0, activity.dp(4));
                card.addView(title);
                TextView details = activity.label(entry.session.date + "  •  " + entry.section.label + "\n" + progress(entry));
                details.setTextColor(MainActivity.MOCHA);
                card.addView(details);
                card.addView(activity.secondaryButton("Delete", v -> confirmDelete(sheet, entry)));
                entriesBox.addView(card);
            }
        }
        panel.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        sheet.setContentView(panel);
        Window window = sheet.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(MainActivity.CREAM));
            window.setGravity(Gravity.BOTTOM);
        }
        sheet.show();
        if (sheet.getWindow() != null) {
            sheet.getWindow().setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    (int) (activity.getResources().getDisplayMetrics().heightPixels * 0.86f)
            );
        }
    }

    private List<SessionEntry> all() {
        List<SessionEntry> entries = new ArrayList<>();
        for (int sectionIndex = 0; sectionIndex < activity.sections.size(); sectionIndex++) {
            BookSection section = activity.sections.get(sectionIndex);
            for (int bookIndex = 0; bookIndex < section.books.size(); bookIndex++) {
                Book book = section.books.get(bookIndex);
                for (int sessionIndex = 0; sessionIndex < book.readingSessions.size(); sessionIndex++) {
                    entries.add(new SessionEntry(sectionIndex, bookIndex, sessionIndex, section, book, book.readingSessions.get(sessionIndex)));
                }
            }
        }
        Collections.sort(entries, (left, right) -> right.session.date.compareTo(left.session.date));
        return entries;
    }

    private String progress(SessionEntry entry) {
        if (isAudiobookSection(entry.section.label)) {
            return "Time left " + formatDuration(remainingTimeAt(entry.book, entry.session.currentPage))
                    + "  •  listened " + formatDuration(entry.session.pagesRead);
        }
        return "Current page " + entry.session.currentPage + "  •  read +" + entry.session.pagesRead + " pages";
    }

    private void confirmDelete(Dialog sheet, SessionEntry entry) {
        new AlertDialog.Builder(activity)
                .setTitle("Delete entry?")
                .setMessage("This session will be removed and the book progress recalculated.")
                .setPositiveButton("Delete", (dialog, which) -> {
                    activity.removeReadingSession(activity.sections.get(entry.sectionIndex).books.get(entry.bookIndex), entry.sessionIndex);
                    sheet.dismiss();
                    activity.afterStateChange("Session deleted");
                    show();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
