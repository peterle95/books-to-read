package com.petermolnar.readingplan;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String PREFS = "reading_plan_prefs";
    private static final String PREF_JSON_URI = "json_uri";
    private static final int REQUEST_OPEN_JSON = 100;
    private static final int REQUEST_OPEN_CSV = 101;
    private static final int REQUEST_CREATE_CSV = 102;
    private static final String PHYSICAL_BOOKS_LABEL = "Physical books";
    private static final String DIGITAL_BOOKS_LABEL = "Digital books";
    private static final String AUDIOBOOKS_LABEL = "Audiobooks";
    private static final List<String> BOOK_SECTION_LABELS = Arrays.asList(
            PHYSICAL_BOOKS_LABEL,
            DIGITAL_BOOKS_LABEL,
            AUDIOBOOKS_LABEL
    );
    private static final int LATTE = 0xfff1e4d4;
    private static final int CREAM = 0xfffff8f0;
    private static final int LIGHT_CREAM = 0xfff7ede2;
    private static final int ESPRESSO = 0xff3a241a;
    private static final int MOCHA = 0xff6f4e37;
    private static final int CARAMEL = 0xffb56b3c;
    private static final int CARAMEL_DARK = 0xff87421e;
    private static final int BORDER = 0xffd6baa1;
    private static final int SUCCESS = 0xff3d6b4f;
    private static final int SUCCESS_DARK = 0xff28513a;
    private static final int ERROR = 0xff9f3a2b;
    private static final int ERROR_DARK = 0xff6f231a;

    private LinearLayout root;
    private LinearLayout tabBar;
    private FrameLayout content;
    private Button jsonStatusButton;
    private boolean jsonLoaded;

    private final List<BookSection> sections = blankSections();
    private StatsOptions statsOptions = new StatsOptions(true, true, true, true, true);
    private LocalDate startDate;
    private LocalDate endDate;
    private String endLabel = "Quarter end";
    private Uri jsonUri;
    private String currentTab = "Session";
    private String previousTabBeforeSettings = "Session";
    private String selectedBookSection = PHYSICAL_BOOKS_LABEL;
    private int selectedBookIndex = -1;
    private int selectedSessionBookNumber = -1;
    private boolean summaryGenerated = false;
    private boolean restoring = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startDate = nextQuarterStart(LocalDate.now());
        endDate = periodEndFromStart(startDate);
        buildRoot();
        loadSavedJsonUri();
        showCurrentTab();
    }

    private void buildRoot() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(LATTE);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), dp(10), dp(12), dp(8));
        root.addView(header, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView title = new TextView(this);
        title.setText("Reading Plan");
        title.setTextColor(ESPRESSO);
        title.setTextSize(22);
        title.setTypeface(null, 1);
        header.addView(title, new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1
        ));

        jsonStatusButton = new Button(this);
        jsonStatusButton.setText("JSON");
        jsonStatusButton.setAllCaps(false);
        jsonStatusButton.setTextColor(CREAM);
        jsonStatusButton.setTextSize(13);
        jsonStatusButton.setMinHeight(dp(44));
        jsonStatusButton.setOnClickListener(v -> openSettings());
        LinearLayout.LayoutParams jsonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(48)
        );
        jsonParams.setMargins(0, 0, dp(8), 0);
        header.addView(jsonStatusButton, jsonParams);
        updateJsonStatus();

        ImageButton settings = new ImageButton(this);
        settings.setImageResource(android.R.drawable.ic_menu_manage);
        settings.setColorFilter(CREAM);
        settings.setBackground(roundedBackground(CARAMEL, CARAMEL_DARK));
        settings.setContentDescription("Settings");
        settings.setOnClickListener(v -> openSettings());
        header.addView(settings, new LinearLayout.LayoutParams(dp(48), dp(48)));

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
        ));


        View tabDivider = new View(this);
        tabDivider.setBackgroundColor(BORDER);
        root.addView(tabDivider, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(2)
        ));

        tabBar = new LinearLayout(this);
        tabBar.setOrientation(LinearLayout.HORIZONTAL);
        tabBar.setBackgroundColor(LIGHT_CREAM);
        tabBar.setPadding(dp(8), dp(4), dp(8), dp(8));
        root.addView(tabBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            header.setPadding(dp(12), insets.getSystemWindowInsetTop() + dp(12), dp(12), dp(8));
            tabBar.setPadding(dp(8), dp(4), dp(8), insets.getSystemWindowInsetBottom() + dp(8));
            return insets;
        });
        root.requestApplyInsets();
    }

    private Button actionButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(CREAM);
        button.setTextSize(15);
        button.setBackground(roundedBackground(CARAMEL, CARAMEL_DARK));
        button.setOnClickListener(listener);
        button.setMinHeight(dp(48));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, dp(8), dp(4));
        button.setLayoutParams(params);
        return button;
    }

    private Button secondaryButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(ESPRESSO);
        button.setTextSize(14);
        button.setBackground(roundedBackground(LIGHT_CREAM, BORDER));
        button.setMinHeight(dp(44));
        button.setOnClickListener(listener);
        return button;
    }

    private Button selectionButton(String label, boolean selected) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTextColor(selected ? CREAM : ESPRESSO);
        button.setGravity(Gravity.CENTER);
        button.setSingleLine(false);
        button.setMinHeight(dp(48));
        button.setBackground(roundedBackground(selected ? MOCHA : LIGHT_CREAM, selected ? MOCHA : BORDER));
        return button;
    }

    private LinearLayout metricColumn(String label, TextView value) {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        TextView caption = new TextView(this);
        caption.setText(label);
        caption.setTextColor(MOCHA);
        caption.setTextSize(12);
        column.addView(caption);
        column.addView(value);
        return column;
    }

    private TextView metricValue() {
        TextView value = new TextView(this);
        value.setText("-");
        value.setTextColor(ESPRESSO);
        value.setTextSize(21);
        value.setTypeface(null, 1);
        value.setPadding(0, dp(2), 0, 0);
        return value;
    }
    private GradientDrawable roundedBackground(int fillColor, int borderColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setColor(fillColor);
        drawable.setCornerRadius(dp(14));
        drawable.setStroke(dp(1), borderColor);
        return drawable;
    }

    private LinearLayout surfaceCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(12));
        card.setBackground(roundedBackground(CREAM, BORDER));
        card.setElevation(dp(2));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(12));
        card.setLayoutParams(params);
        return card;
    }
    private void renderTabBar() {
        tabBar.removeAllViews();
        for (String tab : Arrays.asList("Session", "Plan", "Books", "Summary")) {
            boolean selected = tab.equals(currentTab);
            Button button = new Button(this);
            button.setText(tab);
            button.setAllCaps(false);
            button.setTextSize(13);
            button.setTextColor(selected ? CREAM : ESPRESSO);
            button.setBackground(roundedBackground(selected ? ESPRESSO : CREAM, selected ? ESPRESSO : BORDER));
            button.setOnClickListener(v -> {
                currentTab = tab;
                showCurrentTab();
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(46), 1);
            params.setMargins(dp(3), 0, dp(3), 0);
            tabBar.addView(button, params);
        }
    }
    private void showCurrentTab() {
        refreshHeader();
        renderTabBar();
        content.removeAllViews();
        if ("Session".equals(currentTab)) {
            content.addView(buildSessionView());
        } else if ("Plan".equals(currentTab)) {
            content.addView(buildPlanView());
        } else if ("Books".equals(currentTab)) {
            content.addView(buildBooksView());
        } else if ("Settings".equals(currentTab)) {
            content.addView(buildSettingsView());
        } else {
            content.addView(buildSummaryView());
        }
    }

    private void openSettings() {
        if (!"Settings".equals(currentTab)) {
            previousTabBeforeSettings = currentTab;
        }
        currentTab = "Settings";
        showCurrentTab();
    }

    private void closeSettings() {
        currentTab = previousTabBeforeSettings;
        showCurrentTab();
    }

    private View buildSessionView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        LinearLayout header = row();
        header.addView(heading("Reading session"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(secondaryButton("New plan", v -> confirmNewPlan()));
        header.addView(actionButton("Entries", v -> showEntriesSheet()));
        box.addView(header);

        LinearLayout formatCard = surfaceCard();
        formatCard.addView(sectionTitle("Choose a format"));
        LinearLayout formats = row();
        addFormatButton(formats, "Physical", PHYSICAL_BOOKS_LABEL);
        addFormatButton(formats, "Digital", DIGITAL_BOOKS_LABEL);
        addFormatButton(formats, "Audiobooks", AUDIOBOOKS_LABEL);
        formatCard.addView(formats);
        box.addView(formatCard);

        BookSection section = sectionByLabel(selectedBookSection);
        Book selected = selectedSessionBook();
        LinearLayout bookCard = surfaceCard();
        bookCard.addView(sectionTitle("Choose a book"));
        if (section.books.isEmpty()) {
            TextView empty = label("Add a book in the Books tab before logging a session.");
            empty.setTextColor(MOCHA);
            bookCard.addView(empty);
        } else {
            addSessionBookButtons(bookCard, section);
        }
        box.addView(bookCard);

        LinearLayout detailsCard = surfaceCard();
        boolean audiobookSection = isAudiobookSection(selectedBookSection);
        EditText dateInput = editText(LocalDate.now().toString(), InputType.TYPE_CLASS_TEXT);
        EditText pageInput = editText("", audiobookSection ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_NUMBER);
        detailsCard.addView(label("Date"));
        detailsCard.addView(dateInput);
        detailsCard.addView(label(audiobookSection ? "Time left" : "Current page"));
        detailsCard.addView(pageInput);

        LinearLayout metrics = row();
        metrics.setPadding(dp(12), dp(10), dp(12), dp(10));
        metrics.setBackground(roundedBackground(LIGHT_CREAM, BORDER));
        TextView targetValue = metricValue();
        TextView paceValue = metricValue();
        String targetLabel = audiobookSection ? "Target time left" : "Target page";
        String paceLabel = audiobookSection ? "Time per day" : "Pages per day";
        metrics.addView(metricColumn(targetLabel, targetValue), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        metrics.addView(metricColumn(paceLabel, paceValue), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        detailsCard.addView(metrics);
        Runnable updateTarget = () -> {
            Book book = selectedSessionBook();
            if (book == null) {
                targetValue.setText("-");
                paceValue.setText("-");
                return;
            }
            try {
                SessionTarget target = sessionTarget(selectedBookSection, book, parseDate(dateInput.getText().toString().trim()));
                targetValue.setText(target.value);
                paceValue.setText(target.dailyPace);
            } catch (IllegalArgumentException ex) {
                targetValue.setText("-");
                paceValue.setText("-");
            }
        };
        dateInput.addTextChangedListener(new SimpleTextWatcher(updateTarget));
        updateTarget.run();

        Button add = actionButton("Add session", v -> {
            Book book = selectedSessionBook();
            if (book == null) {
                showError("Select a book first");
                return;
            }
            try {
                LocalDate sessionDate = parseDate(dateInput.getText().toString().trim());
                int currentPage = isAudiobookSection(selectedBookSection)
                        ? currentTimeFromRemaining(book, parseDuration(pageInput.getText().toString().trim()))
                        : Integer.parseInt(pageInput.getText().toString().trim());
                addReadingSession(book, sessionDate, currentPage, selectedBookSection);
                selectedSessionBookNumber = book.number;
                afterStateChange("Session added");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        });
        add.setEnabled(selected != null);
        detailsCard.addView(add);
        box.addView(detailsCard);
        return scroll;
    }

    private void addFormatButton(LinearLayout container, String label, String sectionLabel) {
        Button button = selectionButton(label, sectionLabel.equals(selectedBookSection));
        button.setOnClickListener(v -> {
            selectedBookSection = sectionLabel;
            selectedSessionBookNumber = -1;
            showCurrentTab();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1);
        params.setMargins(0, 0, dp(6), 0);
        container.addView(button, params);
    }

    private void addSessionBookButtons(LinearLayout container, BookSection section) {
        for (int start = 0; start < section.books.size(); start += 2) {
            LinearLayout bookRow = row();
            for (int index = start; index < Math.min(start + 2, section.books.size()); index++) {
                Book book = section.books.get(index);
                Button button = selectionButton(book.number + ". " + book.title, book.number == selectedSessionBookNumber);
                int bookNumber = book.number;
                button.setOnClickListener(v -> {
                    selectedSessionBookNumber = bookNumber;
                    showCurrentTab();
                });
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
                params.setMargins(0, 0, index + 1 < section.books.size() ? dp(6) : 0, dp(6));
                bookRow.addView(button, params);
            }
            container.addView(bookRow);
        }
    }

    private Book selectedSessionBook() {
        BookSection section = sectionByLabel(selectedBookSection);
        for (Book book : section.books) {
            if (book.number == selectedSessionBookNumber) {
                return book;
            }
        }
        if (section.books.isEmpty()) {
            selectedSessionBookNumber = -1;
            return null;
        }
        Book first = section.books.get(0);
        selectedSessionBookNumber = first.number;
        return first;
    }

    private void showEntriesSheet() {
        Dialog sheet = new Dialog(this);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20), dp(12), dp(20), dp(20));
        panel.setBackgroundColor(CREAM);

        View handle = new View(this);
        handle.setBackground(roundedBackground(BORDER, BORDER));
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(44), dp(5));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.setMargins(0, 0, 0, dp(12));
        panel.addView(handle, handleParams);

        LinearLayout header = row();
        header.addView(heading("Entries"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button close = secondaryButton("Close", v -> sheet.dismiss());
        header.addView(close);
        panel.addView(header);

        ScrollView scroll = new ScrollView(this);
        LinearLayout entriesBox = new LinearLayout(this);
        entriesBox.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(entriesBox);
        List<SessionEntry> entries = allSessionEntries();
        if (entries.isEmpty()) {
            TextView empty = label("No reading entries yet. Add your first session from the Session tab.");
            empty.setTextColor(MOCHA);
            empty.setPadding(0, dp(24), 0, dp(24));
            entriesBox.addView(empty);
        } else {
            for (SessionEntry entry : entries) {
                LinearLayout card = surfaceCard();
                TextView title = sectionTitle(entry.book.number + ". " + entry.book.title);
                title.setPadding(0, 0, 0, dp(4));
                card.addView(title);
                TextView details = label(entry.session.date + "  •  " + entry.section.label + "\n" + sessionEntryProgress(entry));
                details.setTextColor(MOCHA);
                card.addView(details);
                Button delete = secondaryButton("Delete", v -> confirmDeleteEntry(sheet, entry));
                card.addView(delete);
                entriesBox.addView(card);
            }
        }
        panel.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        sheet.setContentView(panel);
        Window window = sheet.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(CREAM));
            window.setGravity(Gravity.BOTTOM);
        }
        sheet.show();
        if (sheet.getWindow() != null) {
            sheet.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, (int) (getResources().getDisplayMetrics().heightPixels * 0.86f));
        }
    }

    private List<SessionEntry> allSessionEntries() {
        List<SessionEntry> entries = new ArrayList<>();
        for (int sectionIndex = 0; sectionIndex < sections.size(); sectionIndex++) {
            BookSection section = sections.get(sectionIndex);
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

    private String sessionEntryProgress(SessionEntry entry) {
        if (isAudiobookSection(entry.section.label)) {
            return "Time left " + formatDuration(remainingTimeAt(entry.book, entry.session.currentPage)) + "  •  listened " + formatDuration(entry.session.pagesRead);
        }
        return "Current page " + entry.session.currentPage + "  •  read +" + entry.session.pagesRead + " pages";
    }

    private void confirmDeleteEntry(Dialog sheet, SessionEntry entry) {
        new AlertDialog.Builder(this)
                .setTitle("Delete entry?")
                .setMessage("This session will be removed and the book progress recalculated.")
                .setPositiveButton("Delete", (dialog, which) -> {
                    removeReadingSession(sections.get(entry.sectionIndex).books.get(entry.bookIndex), entry.sessionIndex);
                    sheet.dismiss();
                    afterStateChange("Session deleted");
                    showEntriesSheet();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
    private View buildSettingsView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        LinearLayout settingsHeader = row();
        settingsHeader.setPadding(0, 0, 0, dp(8));
        TextView heading = heading("Settings");
        heading.setPadding(0, dp(4), 0, 0);
        settingsHeader.addView(heading, new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1
        ));
        settingsHeader.addView(actionButton("Done", v -> closeSettings()));
        box.addView(settingsHeader);

        box.addView(sectionTitle("Synced file"));
        box.addView(label("Loaded from"));
        box.addView(monoText(fileLocationText()));
        box.addView(actionButton("Connect synced reading_plan.json", v -> openJsonPicker()));
        box.addView(actionButton("Reload from synced file", v -> reloadFromJson()));

        box.addView(sectionTitle("CSV files"));
        box.addView(actionButton("Import CSV", v -> openCsvPicker()));
        box.addView(actionButton("Export CSV", v -> createCsv()));
        return scroll;
    }

    private View buildPlanView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        box.addView(heading("Plan"));
        EditText startInput = editText(startDate.toString(), InputType.TYPE_CLASS_TEXT);
        CheckBox customTarget = checkBox("Custom finish date", "Target finish date".equals(endLabel));
        EditText endInput = editText(endDate.toString(), InputType.TYPE_CLASS_TEXT);

        box.addView(label("Start date"));
        box.addView(startInput);
        box.addView(customTarget);
        box.addView(label("Finish date"));
        box.addView(endInput);

        box.addView(sectionTitle("Optional summary stats"));
        CheckBox bookCounts = checkBox("Book counts", statsOptions.bookCounts);
        CheckBox pageShare = checkBox("Page share", statsOptions.pageShare);
        CheckBox averagePages = checkBox("Average pages/time", statsOptions.averagePages);
        CheckBox readingPeriod = checkBox("Reading period", statsOptions.readingPeriod);
        CheckBox paceDriver = checkBox("Pace driver", statsOptions.paceDriver);
        box.addView(bookCounts);
        box.addView(pageShare);
        box.addView(averagePages);
        box.addView(readingPeriod);
        box.addView(paceDriver);

        Button recalculate = actionButton("Recalculate", v -> {
            try {
                LocalDate parsedStart = parseDate(startInput.getText().toString().trim());
                LocalDate parsedEnd = parseDate(endInput.getText().toString().trim());
                if (parsedEnd.isBefore(parsedStart)) {
                    throw new IllegalArgumentException("finish date must be on or after the start date");
                }
                startDate = parsedStart;
                endDate = customTarget.isChecked() ? parsedEnd : periodEndFromStart(startDate);
                endLabel = customTarget.isChecked() ? "Target finish date" : "Quarter end";
                statsOptions = new StatsOptions(
                        bookCounts.isChecked(),
                        pageShare.isChecked(),
                        averagePages.isChecked(),
                        readingPeriod.isChecked(),
                        paceDriver.isChecked()
                );
                for (BookSection section : sections) {
                    invalidateBaselineSchedules(section);
                }
                afterStateChange("Plan recalculated");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        });
        box.addView(recalculate);

        PlanSummary summary = buildRemainingPlans();
        box.addView(sectionTitle("Current summary"));
        box.addView(monoText(summaryText(summary, false)));
        return scroll;
    }

    private View buildBooksView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        box.addView(heading("Books"));
        Spinner sectionSpinner = spinner(BOOK_SECTION_LABELS, selectedBookSection);
        box.addView(label("Format"));
        box.addView(sectionSpinner);
        sectionSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(() -> {
            selectedBookSection = String.valueOf(sectionSpinner.getSelectedItem());
            selectedBookIndex = -1;
            showCurrentTab();
        }));

        BookSection section = sectionByLabel(selectedBookSection);
        Book selected = selectedBook(section);
        boolean audiobookSection = isAudiobookSection(section.label);
        EditText titleInput = editText(selected == null ? "" : selected.title, InputType.TYPE_CLASS_TEXT);
        EditText startPageInput = editText(
                selected == null ? (audiobookSection ? "0:00" : "1") : displayValue(section.label, selected.startPage),
                audiobookSection ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_NUMBER
        );
        EditText endPageInput = editText(
                selected == null ? "" : displayValue(section.label, selected.endPage),
                audiobookSection ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_NUMBER
        );

        box.addView(label("Title"));
        box.addView(titleInput);
        box.addView(label(audiobookSection ? "Start time" : "Start page"));
        box.addView(startPageInput);
        box.addView(label(audiobookSection ? "End time" : "End page"));
        box.addView(endPageInput);

        LinearLayout buttons1 = row();
        buttons1.addView(actionButton("Add", v -> {
            BookFields fields = readBookFields(
                    section.label,
                    titleInput,
                    startPageInput,
                    endPageInput,
                    "Book " + (section.books.size() + 1),
                    audiobookSection ? 0 : 1,
                    null
            );
            if (fields == null) {
                return;
            }
            section.books.add(new Book(section.books.size() + 1, fields.title, fields.startPage, fields.endPage));
            renumberBooks(section.books);
            selectedBookIndex = section.books.size() - 1;
            invalidateBaselineSchedules(section);
            afterStateChange("Book added");
        }));
        buttons1.addView(actionButton("Insert Before", v -> {
            if (!hasSelectedBook(section)) {
                showError("Select a book first");
                return;
            }
            int position = selectedBookIndex + 1;
            if (insertionSplitsSimultaneousGroup(position, section.simultaneousGroups) != null) {
                showError("Insert before or after the simultaneous group instead");
                return;
            }
            BookFields fields = readBookFields(
                    section.label,
                    titleInput,
                    startPageInput,
                    endPageInput,
                    "Book " + position,
                    audiobookSection ? 0 : 1,
                    null
            );
            if (fields == null) {
                return;
            }
            section.books.add(selectedBookIndex, new Book(position, fields.title, fields.startPage, fields.endPage));
            renumberBooks(section.books);
            try {
                section.simultaneousGroups = remapGroupsAfterAddition(section.simultaneousGroups, position, section.books);
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
                return;
            }
            invalidateBaselineSchedules(section);
            afterStateChange("Book inserted");
        }));
        box.addView(buttons1);

        LinearLayout buttons2 = row();
        buttons2.addView(actionButton("Replace Selected", v -> {
            if (!hasSelectedBook(section)) {
                showError("Select a book first");
                return;
            }
            Book oldBook = section.books.get(selectedBookIndex);
            BookFields fields = readBookFields(section.label, titleInput, startPageInput, endPageInput, oldBook.title, oldBook.startPage, oldBook.endPage);
            if (fields == null) {
                return;
            }
            Integer currentPage = oldBook.currentPage;
            if (currentPage != null && (currentPage < fields.startPage || currentPage > fields.endPage)) {
                currentPage = null;
            }
            List<ReadingSession> sessions = oldBook.startPage == fields.startPage && oldBook.endPage == fields.endPage
                    ? oldBook.readingSessions
                    : new ArrayList<>();
            section.books.set(selectedBookIndex, new Book(oldBook.number, fields.title, fields.startPage, fields.endPage, currentPage, sessions));
            invalidateBaselineSchedules(section);
            afterStateChange("Book replaced");
        }));
        buttons2.addView(actionButton("Delete Selected", v -> {
            if (!hasSelectedBook(section)) {
                showError("Select a book first");
                return;
            }
            int deletedId = selectedBookIndex + 1;
            section.books.remove(selectedBookIndex);
            renumberBooks(section.books);
            try {
                section.simultaneousGroups = remapGroupsAfterDeletion(section.simultaneousGroups, deletedId, section.books);
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
                return;
            }
            selectedBookIndex = Math.min(selectedBookIndex, section.books.size() - 1);
            invalidateBaselineSchedules(section);
            afterStateChange("Book deleted");
        }));
        box.addView(buttons2);

        LinearLayout buttons3 = row();
        buttons3.addView(actionButton("Move Up", v -> moveSelectedBook(section, -1)));
        buttons3.addView(actionButton("Move Down", v -> moveSelectedBook(section, 1)));
        box.addView(buttons3);

        EditText groupsInput = editText(groupsToText(section.simultaneousGroups), InputType.TYPE_CLASS_TEXT);
        box.addView(sectionTitle("Simultaneous groups"));
        box.addView(groupsInput);
        LinearLayout groupButtons = row();
        groupButtons.addView(actionButton("Apply", v -> {
            try {
                section.simultaneousGroups = validateSimultaneousGroups(section.books, parseGroupText(groupsInput.getText().toString()));
                invalidateBaselineSchedules(section);
                afterStateChange("Groups updated");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        }));
        groupButtons.addView(actionButton("Clear", v -> {
            section.simultaneousGroups = new ArrayList<>();
            invalidateBaselineSchedules(section);
            afterStateChange("Groups cleared");
        }));
        box.addView(groupButtons);

        box.addView(sectionTitle(selectedBookSection));
        box.addView(bookTable(section));
        return scroll;
    }

    private View buildSummaryView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        PlanSummary summary = buildRemainingPlans();
        box.addView(heading("Summary"));
        LinearLayout summaryCard = surfaceCard();
        TextView helper = label(summaryGenerated
                ? "Your current reading-plan summary is shown below. Generate again after reviewing changes."
                : "Generate a clear overview when you are ready to review your reading plan.");
        helper.setTextColor(MOCHA);
        summaryCard.addView(helper);
        summaryCard.addView(actionButton(summaryGenerated ? "Regenerate summary" : "Generate summary", v -> {
            summaryGenerated = true;
            showCurrentTab();
        }));
        if (summaryGenerated) {
            summaryCard.addView(monoText(summaryText(summary, true)));
        }
        box.addView(summaryCard);

        for (SectionPlan sectionPlan : summary.sectionPlans) {
            box.addView(sectionTitle(sectionPlan.section.label));
            if (sectionPlan.deadlines.isEmpty()) {
                LinearLayout emptyCard = surfaceCard();
                TextView empty = label("No books yet. Add one in the Books tab to create a reading plan.");
                empty.setTextColor(MOCHA);
                emptyCard.addView(empty);
                box.addView(emptyCard);
            } else {
                box.addView(planTable(sectionPlan));
            }
        }
        return scroll;
    }
    private HorizontalScrollView bookTable(BookSection section) {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        TableLayout table = new TableLayout(this);
        scroll.addView(table);
        boolean audiobookSection = isAudiobookSection(section.label);
        addTableRow(
                table,
                true,
                audiobookSection
                        ? Arrays.asList("Book", "Title", "Start time", "End time", "Remaining time", "Duration")
                        : Arrays.asList("Book", "Title", "Start page", "End page", "Current page", "Pages", "Remaining"),
                -1
        );
        for (int i = 0; i < section.books.size(); i++) {
            Book book = section.books.get(i);
            List<String> row = audiobookSection
                    ? Arrays.asList(
                            String.valueOf(book.number),
                            book.title,
                            formatDuration(book.startPage),
                            formatDuration(book.endPage),
                            formatDuration(unitsRemaining(book, section.label)),
                            formatDuration(totalUnits(book, section.label))
                    )
                    : Arrays.asList(
                            String.valueOf(book.number),
                            book.title,
                            String.valueOf(book.startPage),
                            String.valueOf(book.endPage),
                            book.currentPage == null ? "" : String.valueOf(book.currentPage),
                            String.valueOf(book.pages()),
                            String.valueOf(pagesRemaining(book))
                    );
            int index = i;
            TableRow tableRow = addTableRow(table, false, row, i == selectedBookIndex ? CARAMEL : -1);
            tableRow.setOnClickListener(v -> {
                selectedBookIndex = index;
                showCurrentTab();
            });
        }
        return scroll;
    }

    private HorizontalScrollView planTable(SectionPlan sectionPlan) {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        TableLayout table = new TableLayout(this);
        scroll.addView(table);
        boolean audiobookSection = isAudiobookSection(sectionPlan.section.label);
        List<String> headers = audiobookSection
                ? Arrays.asList(
                        "Book", "Title", "Daily time", "Remaining time", "Start time", "End time",
                        "Duration", "Start date", "Deadline", "Days allocated", "Status"
                )
                : Arrays.asList(
                        "Book", "Title", "Daily pages", "Remaining", "Start page", "End page",
                        "Current page", "Pages", "Start date",
                        "Deadline", "Days allocated", "Status"
                );
        addTableRow(table, true, headers, -1);
        for (BookDeadline deadline : sectionPlan.deadlines) {
            Book book = deadline.book;
            List<String> row = audiobookSection
                    ? Arrays.asList(
                            String.valueOf(book.number),
                            book.title,
                            formatDuration(deadline.dailyPages),
                            formatDuration(unitsRemaining(book, sectionPlan.section.label)),
                            formatDuration(book.startPage),
                            formatDuration(book.endPage),
                            formatDuration(totalUnits(book, sectionPlan.section.label)),
                            deadline.startDate.toString(),
                            deadline.deadline.toString(),
                            String.valueOf(deadline.daysAllocated),
                            deadline.status
                    )
                    : Arrays.asList(
                            String.valueOf(book.number),
                            book.title,
                            format2(deadline.dailyPages),
                            String.valueOf(pagesRemaining(book)),
                            String.valueOf(book.startPage),
                            String.valueOf(book.endPage),
                            book.currentPage == null ? "" : String.valueOf(book.currentPage),
                            String.valueOf(book.pages()),
                            deadline.startDate.toString(),
                            deadline.deadline.toString(),
                            String.valueOf(deadline.daysAllocated),
                            deadline.status
                    );
            addTableRow(table, false, row, -1);
        }
        return scroll;
    }

    private TableRow addTableRow(TableLayout table, boolean header, List<String> values, int rowColor) {
        TableRow row = new TableRow(this);
        table.addView(row);
        for (String value : values) {
            TextView cell = new TextView(this);
            cell.setText(value);
            cell.setTextSize(13);
            cell.setTextColor(rowColor == CARAMEL ? CREAM : ESPRESSO);
            cell.setPadding(dp(10), dp(8), dp(10), dp(8));
            cell.setGravity(Gravity.CENTER_VERTICAL);
            cell.setSingleLine(false);
            cell.setMinWidth(dp(96));
            if (header) {
                cell.setTypeface(null, 1);
                cell.setBackgroundColor(LIGHT_CREAM);
            } else if (rowColor != -1) {
                cell.setBackgroundColor(rowColor);
            } else {
                cell.setBackgroundColor(CREAM);
            }
            row.addView(cell);
        }
        return row;
    }

    private LinearLayout verticalBox() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(12), dp(16), dp(20));
        return box;
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(4), 0, dp(4));
        return row;
    }

    private TextView heading(String text) {
        TextView view = label(text);
        view.setTextSize(24);
        view.setTypeface(null, 1);
        view.setPadding(0, dp(4), 0, dp(12));
        return view;
    }

    private TextView sectionTitle(String text) {
        TextView view = label(text);
        view.setTextSize(16);
        view.setTypeface(null, 1);
        view.setPadding(0, dp(12), 0, dp(8));
        return view;
    }

    private TextView label(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(ESPRESSO);
        view.setTextSize(14);
        view.setPadding(0, dp(4), 0, dp(4));
        return view;
    }

    private TextView monoText(String text) {
        TextView view = label(text);
        view.setTextSize(13);
        view.setTypeface(android.graphics.Typeface.MONOSPACE);
        view.setPadding(dp(12), dp(12), dp(12), dp(12));
        view.setBackground(roundedBackground(LIGHT_CREAM, BORDER));
        return view;
    }

    private EditText editText(String value, int inputType) {
        EditText edit = new EditText(this);
        edit.setText(value);
        edit.setTextColor(ESPRESSO);
        edit.setTextSize(16);
        edit.setSingleLine(true);
        edit.setInputType(inputType);
        edit.setSelectAllOnFocus(false);
        edit.setPadding(dp(12), 0, dp(12), 0);
        edit.setMinHeight(dp(50));
        edit.setBackground(roundedBackground(CREAM, BORDER));
        return edit;
    }

    private CheckBox checkBox(String label, boolean checked) {
        CheckBox box = new CheckBox(this);
        box.setText(label);
        box.setTextColor(ESPRESSO);
        box.setChecked(checked);
        box.setMinHeight(dp(44));
        return box;
    }
    private Spinner spinner(List<String> values, String selected) {
        return spinner(values, selected, -1, ESPRESSO);
    }

    private Spinner spinner(List<String> values, String selected, int backgroundColor, int selectedTextColor) {
        Spinner spinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(
                this,
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
                styleSpinnerText(view, ESPRESSO);
                view.setBackgroundColor(CREAM);
                return view;
            }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        spinner.setMinimumHeight(dp(48));
        spinner.setBackground(roundedBackground(backgroundColor == -1 ? CREAM : backgroundColor, BORDER));
        spinner.setPadding(dp(8), 0, dp(8), 0);
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
            text.setPadding(dp(12), dp(8), dp(12), dp(8));
        }
    }

    private String fileLocationText() {
        return jsonUri == null ? "Not connected" : jsonUri.toString();
    }

    private void updateJsonStatus() {
        boolean healthy = jsonLoaded && jsonUri != null;
        if (jsonStatusButton == null) {
            return;
        }
        jsonStatusButton.setText("JSON");
        jsonStatusButton.setTextColor(CREAM);
        jsonStatusButton.setBackground(roundedBackground(healthy ? SUCCESS : ERROR, healthy ? SUCCESS_DARK : ERROR_DARK));
        jsonStatusButton.setContentDescription(healthy ? "JSON loaded" : "JSON not loaded");
    }

    private void setJsonLoaded(boolean loaded) {
        jsonLoaded = loaded && jsonUri != null;
        updateJsonStatus();
    }

    private void refreshHeader() {
        updateJsonStatus();
    }

    private void afterStateChange(String message) {
        summaryGenerated = false;
        autosaveJson(message);
        showCurrentTab();
    }

    private void setStatus(String message, boolean error) {
        // Success and sync details are intentionally represented by the JSON indicator.
    }

    private void showError(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
    @Override
    public void onBackPressed() {
        if ("Settings".equals(currentTab)) {
            closeSettings();
            return;
        }
        super.onBackPressed();
    }

    private void confirmNewPlan() {
        new AlertDialog.Builder(this)
                .setTitle("Reading Plan")
                .setMessage("Replace the current plan?")
                .setPositiveButton("Replace", (dialog, which) -> {
                    startDate = nextQuarterStart(LocalDate.now());
                    endDate = periodEndFromStart(startDate);
                    endLabel = "Quarter end";
                    statsOptions = new StatsOptions(true, true, true, true, true);
                    sections.clear();
                    sections.addAll(blankSections());
                    selectedBookIndex = -1;
                    afterStateChange("New plan saved");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void loadSavedJsonUri() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String savedUri = prefs.getString(PREF_JSON_URI, null);
        if (savedUri == null) {
            setJsonLoaded(false);
            return;
        }
        jsonUri = Uri.parse(savedUri);
        reloadFromJson();
    }

    private void openJsonPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/json", "text/plain"});
        startActivityForResult(intent, REQUEST_OPEN_JSON);
    }

    private void openCsvPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/csv", "text/plain", "application/vnd.ms-excel"});
        startActivityForResult(intent, REQUEST_OPEN_CSV);
    }

    private void createCsv() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/csv");
        intent.putExtra(Intent.EXTRA_TITLE, "reading_plan.csv");
        startActivityForResult(intent, REQUEST_CREATE_CSV);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }
        Uri uri = data.getData();
        if (requestCode == REQUEST_OPEN_JSON) {
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                getContentResolver().takePersistableUriPermission(uri, flags);
            } catch (SecurityException ignored) {
            }
            jsonUri = uri;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(PREF_JSON_URI, uri.toString()).apply();
            reloadFromJson();
        } else if (requestCode == REQUEST_OPEN_CSV) {
            try {
                CsvPlan plan = loadCsv(readText(uri));
                applyPlan(plan);
                autosaveJson("Imported CSV and saved JSON");
                showCurrentTab();
            } catch (IOException | IllegalArgumentException ex) {
                showError("CSV import failed: " + ex.getMessage());
            }
        } else if (requestCode == REQUEST_CREATE_CSV) {
            try {
                writeText(uri, csvText(buildRemainingPlans()));
                setStatus("Exported CSV", false);
            } catch (IOException | IllegalArgumentException ex) {
                showError("CSV export failed: " + ex.getMessage());
            }
        }
    }

    private void reloadFromJson() {
        if (jsonUri == null) {
            setJsonLoaded(false);
            showError("Connect a JSON file first");
            return;
        }
        try {
            CsvPlan plan = loadJson(readText(jsonUri));
            applyPlan(plan);
            setJsonLoaded(true);
            autosaveJson("Migrated baseline schedule");
            showCurrentTab();
        } catch (IOException | JSONException | IllegalArgumentException ex) {
            setJsonLoaded(false);
            showError("Could not load JSON: " + ex.getMessage());
        }
    }

    private void autosaveJson(String successMessage) {
        if (restoring) {
            return;
        }
        if (jsonUri == null) {
            setJsonLoaded(false);
            return;
        }
        try {
            writeText(jsonUri, jsonText());
            setJsonLoaded(true);
        } catch (IOException | JSONException ex) {
            setJsonLoaded(false);
            showError("Autosave failed: " + ex.getMessage());
        }
    }

    private String readText(Uri uri) throws IOException {
        ContentResolver resolver = getContentResolver();
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) {
                throw new IOException("could not open file");
            }
            BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
            return builder.toString();
        }
    }

    private void writeText(Uri uri, String text) throws IOException {
        ContentResolver resolver = getContentResolver();
        try (OutputStream output = resolver.openOutputStream(uri, "wt")) {
            if (output == null) {
                throw new IOException("could not write file");
            }
            output.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private void applyPlan(CsvPlan plan) {
        restoring = true;
        try {
            sections.clear();
            sections.addAll(plan.sections);
            startDate = plan.startDate;
            endDate = plan.endDate;
            endLabel = plan.endLabel;
            statsOptions = plan.statsOptions;
            selectedBookIndex = -1;
            selectedBookSection = PHYSICAL_BOOKS_LABEL;
        } finally {
            restoring = false;
        }
    }

    private CsvPlan loadJson(String raw) throws JSONException {
        JSONObject payload = new JSONObject(raw);
        LocalDate loadedStart = parseDate(payload.getString("start_date"));
        LocalDate loadedEnd = parseDate(payload.getString("end_date"));
        if (loadedEnd.isBefore(loadedStart)) {
            throw new IllegalArgumentException("finish date must be on or after the start date");
        }
        String loadedEndLabel = payload.optString("end_label", "");
        if (!"Target finish date".equals(loadedEndLabel) && !"Quarter end".equals(loadedEndLabel)) {
            loadedEndLabel = loadedEnd.equals(periodEndFromStart(loadedStart)) ? "Quarter end" : "Target finish date";
        }

        Map<String, BookSection> byLabel = new HashMap<>();
        for (String label : BOOK_SECTION_LABELS) {
            byLabel.put(label, new BookSection(label));
        }
        JSONArray rawSections = payload.optJSONArray("sections");
        if (rawSections != null) {
            for (int i = 0; i < rawSections.length(); i++) {
                String defaultLabel = i < BOOK_SECTION_LABELS.size() ? BOOK_SECTION_LABELS.get(i) : "Section " + (i + 1);
                BookSection section = bookSectionFromJson(rawSections.getJSONObject(i), defaultLabel);
                if (BOOK_SECTION_LABELS.contains(section.label)) {
                    byLabel.put(section.label, section);
                }
            }
        }
        List<BookSection> loadedSections = new ArrayList<>();
        for (String label : BOOK_SECTION_LABELS) {
            loadedSections.add(byLabel.get(label));
        }
        ensureBaselineSchedules(loadedSections, loadedStart, loadedEnd);
        return new CsvPlan(
                loadedSections,
                loadedStart,
                loadedEnd,
                loadedEndLabel,
                statsOptionsFromJson(payload.optJSONObject("stats_options"))
        );
    }

    private String jsonText() throws JSONException {
        ensureBaselineSchedules(sections, startDate, endDate);
        JSONObject payload = new JSONObject();
        payload.put("schema_version", 5);
        payload.put("start_date", startDate.toString());
        payload.put("end_date", endDate.toString());
        payload.put("end_label", endLabel);
        JSONObject stats = new JSONObject();
        stats.put("book_counts", statsOptions.bookCounts);
        stats.put("page_share", statsOptions.pageShare);
        stats.put("average_pages", statsOptions.averagePages);
        stats.put("reading_period", statsOptions.readingPeriod);
        stats.put("pace_driver", statsOptions.paceDriver);
        payload.put("stats_options", stats);
        JSONArray jsonSections = new JSONArray();
        for (BookSection section : sections) {
            jsonSections.put(bookSectionToJson(section));
        }
        payload.put("sections", jsonSections);
        return payload.toString(2) + "\n";
    }

    private JSONObject bookSectionToJson(BookSection section) throws JSONException {
        JSONObject object = new JSONObject();
        object.put("label", section.label);
        JSONArray books = new JSONArray();
        for (Book book : section.books) {
            books.put(bookToJson(book, section.label));
        }
        object.put("books", books);
        JSONArray groups = new JSONArray();
        for (List<Integer> group : section.simultaneousGroups) {
            JSONArray jsonGroup = new JSONArray();
            for (Integer id : group) {
                jsonGroup.put(id);
            }
            groups.put(jsonGroup);
        }
        object.put("simultaneous_groups", groups);
        return object;
    }

    private JSONObject bookToJson(Book book, String sectionLabel) throws JSONException {
        JSONObject object = new JSONObject();
        object.put("number", book.number);
        object.put("title", book.title);
        object.put("baseline_schedule", baselineScheduleToJson(book.baselineSchedule));
        if (isAudiobookSection(sectionLabel)) {
            object.put("start_time_seconds", book.startPage);
            object.put("end_time_seconds", book.endPage);
            object.put("current_time_seconds", book.currentPage == null ? JSONObject.NULL : book.currentPage);
            object.put("duration_seconds", totalUnits(book, sectionLabel));
            object.put("time_listened_seconds", completedUnits(book, sectionLabel));
            object.put(
                    "remaining_time_seconds",
                    book.currentPage == null ? JSONObject.NULL : unitsRemaining(book, sectionLabel)
            );
            JSONArray sessions = new JSONArray();
            for (ReadingSession session : book.readingSessions) {
                JSONObject item = new JSONObject();
                item.put("date", session.date.toString());
                item.put("current_time_seconds", session.currentPage);
                item.put("time_listened_seconds", session.pagesRead);
                item.put("remaining_time_seconds", remainingTimeAt(book, session.currentPage));
                sessions.put(item);
            }
            object.put("reading_sessions", sessions);
            return object;
        }
        object.put("start_page", book.startPage);
        object.put("end_page", book.endPage);
        object.put("current_page", book.currentPage == null ? JSONObject.NULL : book.currentPage);
        object.put("pages", book.pages());
        object.put("pages_read", book.pagesRead());
        JSONArray sessions = new JSONArray();
        for (ReadingSession session : book.readingSessions) {
            JSONObject item = new JSONObject();
            item.put("date", session.date.toString());
            item.put("current_page", session.currentPage);
            item.put("pages_read", session.pagesRead);
            sessions.put(item);
        }
        object.put("reading_sessions", sessions);
        return object;
    }

    private BookSection bookSectionFromJson(JSONObject object, String defaultLabel) throws JSONException {
        String label = canonicalSectionLabel(object.optString("label", defaultLabel), defaultLabel);
        BookSection section = new BookSection(label);
        if (!BOOK_SECTION_LABELS.contains(label)) {
            return section;
        }
        JSONArray rawBooks = object.optJSONArray("books");
        if (rawBooks != null) {
            for (int i = 0; i < rawBooks.length(); i++) {
                section.books.add(bookFromJson(rawBooks.getJSONObject(i), i + 1, label));
            }
        }
        renumberBooks(section.books);
        JSONArray rawGroups = object.optJSONArray("simultaneous_groups");
        List<List<Integer>> groups = new ArrayList<>();
        if (rawGroups != null) {
            for (int i = 0; i < rawGroups.length(); i++) {
                JSONArray rawGroup = rawGroups.getJSONArray(i);
                List<Integer> group = new ArrayList<>();
                for (int j = 0; j < rawGroup.length(); j++) {
                    group.add(rawGroup.getInt(j));
                }
                groups.add(group);
            }
        }
        section.simultaneousGroups = validateSimultaneousGroups(section.books, groups);
        return section;
    }

    private Book bookFromJson(JSONObject object, int fallbackNumber, String sectionLabel) throws JSONException {
        String title = object.optString("title", "").trim();
        if (title.isEmpty()) {
            throw new IllegalArgumentException("each book needs a title");
        }
        int startPage;
        int endPage;
        if (isAudiobookSection(sectionLabel)) {
            if (object.has("start_time_seconds") && object.has("end_time_seconds")) {
                startPage = object.getInt("start_time_seconds");
                endPage = object.getInt("end_time_seconds");
            } else {
                int duration = object.optInt("duration_seconds", object.optInt("pages", 0));
                startPage = 0;
                endPage = duration;
            }
        } else if (object.has("start_page") && object.has("end_page")) {
            startPage = object.getInt("start_page");
            endPage = object.getInt("end_page");
        } else {
            int pages = object.optInt("pages", 0);
            startPage = 1;
            endPage = pages;
        }
        validateBookRange(sectionLabel, startPage, endPage);

        Integer currentPage = null;
        if (isAudiobookSection(sectionLabel) && object.has("remaining_time_seconds") && !object.isNull("remaining_time_seconds")) {
            currentPage = currentTimeFromRemaining(startPage, endPage, object.getInt("remaining_time_seconds"));
        } else if (isAudiobookSection(sectionLabel) && object.has("current_time_seconds") && !object.isNull("current_time_seconds")) {
            currentPage = object.getInt("current_time_seconds");
        } else if (object.has("current_page") && !object.isNull("current_page")) {
            currentPage = object.getInt("current_page");
        }
        int pagesRead = isAudiobookSection(sectionLabel)
                ? object.optInt("time_listened_seconds", 0)
                : object.optInt("pages_read", 0);
        if (pagesRead < 0) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time listened cannot be negative"
                    : "pages read cannot be negative");
        }

        List<ReadingSession> sessions = new ArrayList<>();
        JSONArray rawSessions = object.optJSONArray("reading_sessions");
        Integer previousCurrentPage = null;
        if (rawSessions != null) {
            for (int i = 0; i < rawSessions.length(); i++) {
                JSONObject rawSession = rawSessions.getJSONObject(i);
                LocalDate sessionDate = parseDate(rawSession.getString("date"));
                int sessionCurrentPage;
                int sessionPagesRead;
                if (isAudiobookSection(sectionLabel)) {
                    if (rawSession.has("remaining_time_seconds") && !rawSession.isNull("remaining_time_seconds")) {
                        sessionCurrentPage = currentTimeFromRemaining(
                                startPage,
                                endPage,
                                rawSession.getInt("remaining_time_seconds")
                        );
                        int previousTotal = previousCurrentPage == null ? 0 : previousCurrentPage - startPage;
                        sessionPagesRead = rawSession.optInt("time_listened_seconds", sessionCurrentPage - startPage - previousTotal);
                    } else if (rawSession.has("current_time_seconds")) {
                        sessionCurrentPage = rawSession.getInt("current_time_seconds");
                        int previousTotal = previousCurrentPage == null ? 0 : previousCurrentPage - startPage;
                        sessionPagesRead = rawSession.optInt("time_listened_seconds", sessionCurrentPage - startPage - previousTotal);
                    } else {
                        sessionPagesRead = rawSession.has("pages")
                                ? rawSession.getInt("pages")
                                : rawSession.getInt("pages_read");
                        sessionCurrentPage = previousCurrentPage == null
                                ? startPage + sessionPagesRead
                                : previousCurrentPage + sessionPagesRead;
                    }
                } else if (rawSession.has("current_page")) {
                    sessionCurrentPage = rawSession.getInt("current_page");
                    int previousTotal = previousCurrentPage == null ? 0 : previousCurrentPage - startPage + 1;
                    sessionPagesRead = rawSession.optInt("pages_read", sessionCurrentPage - startPage + 1 - previousTotal);
                } else {
                    sessionPagesRead = rawSession.getInt("pages");
                    sessionCurrentPage = previousCurrentPage == null
                            ? startPage + sessionPagesRead - 1
                            : previousCurrentPage + sessionPagesRead;
                }
                if (sessionPagesRead <= 0) {
                    throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                            ? "reading session time must be positive"
                            : "reading session pages must be positive");
                }
                sessionCurrentPage = clamp(sessionCurrentPage, startPage, endPage);
                sessions.add(new ReadingSession(sessionDate, sessionCurrentPage, sessionPagesRead));
                previousCurrentPage = previousCurrentPage == null
                        ? sessionCurrentPage
                        : Math.max(previousCurrentPage, sessionCurrentPage);
            }
        }
        if (currentPage == null && !sessions.isEmpty()) {
            int max = sessions.get(0).currentPage;
            for (ReadingSession session : sessions) {
                max = Math.max(max, session.currentPage);
            }
            currentPage = max;
        } else if (currentPage == null && pagesRead > 0) {
            currentPage = isAudiobookSection(sectionLabel)
                    ? startPage + pagesRead
                    : startPage + pagesRead - 1;
        }
        if (currentPage != null) {
            currentPage = clamp(currentPage, startPage, endPage);
        }
        BaselineSchedule baselineSchedule = null;
        if (object.has("baseline_schedule") && !object.isNull("baseline_schedule")) {
            baselineSchedule = baselineScheduleFromJson(object.getJSONObject("baseline_schedule"));
        }
        return new Book(fallbackNumber, title, startPage, endPage, currentPage, sessions, baselineSchedule);
    }

    private static Object baselineScheduleToJson(BaselineSchedule schedule) throws JSONException {
        if (schedule == null) {
            return JSONObject.NULL;
        }
        JSONObject object = new JSONObject();
        object.put("start_date", schedule.startDate.toString());
        object.put("deadline", schedule.deadline.toString());
        object.put("daily_target", schedule.dailyTarget);
        return object;
    }

    private static BaselineSchedule baselineScheduleFromJson(JSONObject object) throws JSONException {
        try {
            return new BaselineSchedule(
                    parseDate(object.getString("start_date")),
                    parseDate(object.getString("deadline")),
                    object.getDouble("daily_target")
            );
        } catch (JSONException | IllegalArgumentException ex) {
            throw new IllegalArgumentException("invalid baseline_schedule", ex);
        }
    }

    private StatsOptions statsOptionsFromJson(JSONObject object) {
        if (object == null) {
            return new StatsOptions(true, true, true, true, true);
        }
        return new StatsOptions(
                object.optBoolean("book_counts", true),
                object.optBoolean("page_share", true),
                object.optBoolean("average_pages", true),
                object.optBoolean("reading_period", true),
                object.optBoolean("pace_driver", true)
        );
    }

    private CsvPlan loadCsv(String raw) {
        List<List<String>> rows = parseCsv(raw);
        int firstPlanRow = rows.size();
        for (int i = 0; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            if (row.isEmpty()) {
                continue;
            }
            if (BOOK_SECTION_LABELS.contains(row.get(0))
                    || startsWith(row, "Book", "Title", "Pages")
                    || startsWith(row, "Book", "Title", "Start page")
                    || startsWith(row, "Book", "Title", "Start time")) {
                firstPlanRow = i;
                break;
            }
        }
        Map<String, String> metadata = new HashMap<>();
        for (int i = 0; i < firstPlanRow; i++) {
            List<String> row = rows.get(i);
            if (row.size() >= 2 && !row.get(0).isEmpty() && !"Book".equals(row.get(0))) {
                metadata.put(row.get(0), row.get(1));
            }
        }
        if (!metadata.containsKey("Start date")) {
            throw new IllegalArgumentException("missing required field: Start date");
        }
        String loadedEndLabel;
        if (metadata.containsKey("Target finish date")) {
            loadedEndLabel = "Target finish date";
        } else if (metadata.containsKey("Quarter end")) {
            loadedEndLabel = "Quarter end";
        } else {
            throw new IllegalArgumentException("missing Target finish date or Quarter end");
        }
        LocalDate loadedStart = parseDate(metadata.get("Start date"));
        LocalDate loadedEnd = parseDate(metadata.get(loadedEndLabel));
        if (loadedEnd.isBefore(loadedStart)) {
            throw new IllegalArgumentException("finish date must be on or after the start date");
        }

        boolean hasSectionLabels = false;
        for (List<String> row : rows) {
            if (!row.isEmpty() && BOOK_SECTION_LABELS.contains(row.get(0))) {
                hasSectionLabels = true;
                break;
            }
        }

        List<BookSection> loadedSections = blankSections();
        if (hasSectionLabels) {
            Map<String, BookSection> byLabel = new HashMap<>();
            for (BookSection section : loadedSections) {
                byLabel.put(section.label, section);
            }
            int index = 0;
            while (index < rows.size()) {
                List<String> row = rows.get(index);
                if (row.isEmpty() || !BOOK_SECTION_LABELS.contains(row.get(0))) {
                    index++;
                    continue;
                }
                String label = row.get(0);
                index++;
                String rawGroups = "";
                while (index < rows.size() && isBlankRow(rows.get(index))) {
                    index++;
                }
                if (index < rows.size() && rows.get(index).size() >= 2 && "Daily pace".equals(rows.get(index).get(0))) {
                    index++;
                }
                if (index < rows.size() && rows.get(index).size() >= 2 && "Simultaneous groups".equals(rows.get(index).get(0))) {
                    rawGroups = rows.get(index).get(1).trim();
                    index++;
                }
                while (index < rows.size() && isBlankRow(rows.get(index))) {
                    index++;
                }
                if (index >= rows.size() || !startsWith(rows.get(index), "Book", "Title")) {
                    throw new IllegalArgumentException("missing " + label + " book table header");
                }
                ParseTableResult result = parseCsvBookTable(rows, index, true, label);
                BookSection section = new BookSection(label);
                section.books.addAll(result.books);
                section.simultaneousGroups = parseCsvGroups(section.books, rawGroups, label);
                byLabel.put(label, section);
                index = result.nextIndex;
            }
            loadedSections = new ArrayList<>();
            for (String label : BOOK_SECTION_LABELS) {
                loadedSections.add(byLabel.get(label));
            }
        } else {
            int headerIndex = -1;
            for (int i = 0; i < rows.size(); i++) {
                if (startsWith(rows.get(i), "Book", "Title", "Pages")
                        || startsWith(rows.get(i), "Book", "Title", "Start page")
                        || startsWith(rows.get(i), "Book", "Title", "Start time")) {
                    headerIndex = i;
                    break;
                }
            }
            if (headerIndex < 0) {
                throw new IllegalArgumentException("missing book table header");
            }
            ParseTableResult result = parseCsvBookTable(rows, headerIndex, false, PHYSICAL_BOOKS_LABEL);
            BookSection physical = sectionByLabelFromList(loadedSections, PHYSICAL_BOOKS_LABEL);
            physical.books.addAll(result.books);
            physical.simultaneousGroups = parseCsvGroups(physical.books, metadata.getOrDefault("Simultaneous groups", ""), PHYSICAL_BOOKS_LABEL);
        }
        boolean anyBooks = false;
        for (BookSection section : loadedSections) {
            anyBooks = anyBooks || !section.books.isEmpty();
        }
        if (!anyBooks) {
            throw new IllegalArgumentException("no books found");
        }
        return new CsvPlan(loadedSections, loadedStart, loadedEnd, loadedEndLabel, statsOptions);
    }

    private ParseTableResult parseCsvBookTable(List<List<String>> rows, int headerIndex, boolean stopAtBlank, String sectionLabel) {
        List<String> headers = rows.get(headerIndex);
        Map<String, Integer> headerIndexes = new HashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            headerIndexes.put(headers.get(i), i);
        }
        Integer startPageIndex = headerIndexes.get("Start page");
        Integer endPageIndex = headerIndexes.get("End page");
        Integer currentPageIndex = headerIndexes.get("Current page");
        Integer startTimeIndex = headerIndexes.get("Start time");
        Integer endTimeIndex = headerIndexes.get("End time");
        Integer currentTimeIndex = headerIndexes.get("Current time");
        Integer remainingTimeIndex = headerIndexes.get("Remaining time");
        Integer pagesIndex = headerIndexes.containsKey("Pages") ? headerIndexes.get("Pages") : 2;
        Integer pagesReadIndex = headerIndexes.containsKey("Read pages")
                ? headerIndexes.get("Read pages")
                : headerIndexes.get("Pages read");
        Integer durationIndex = headerIndexes.get("Duration");
        Integer timeListenedIndex = headerIndexes.get("Time listened");
        List<Book> books = new ArrayList<>();
        int index = headerIndex + 1;
        while (index < rows.size()) {
            List<String> row = rows.get(index);
            if (!row.isEmpty() && BOOK_SECTION_LABELS.contains(row.get(0))) {
                break;
            }
            if (isBlankRow(row)) {
                if (stopAtBlank) {
                    break;
                }
                index++;
                continue;
            }
            if (row.size() < 3) {
                throw new IllegalArgumentException("a book row is incomplete");
            }
            int startPage;
            int endPage;
            if (isAudiobookSection(sectionLabel)) {
                if (startTimeIndex != null && endTimeIndex != null) {
                    startPage = parseDuration(cell(row, startTimeIndex));
                    endPage = parseDuration(cell(row, endTimeIndex));
                } else {
                    int duration = durationIndex != null
                            ? parseDuration(cell(row, durationIndex))
                            : parseDuration(cell(row, pagesIndex));
                    startPage = 0;
                    endPage = duration;
                }
            } else if (startPageIndex != null && endPageIndex != null) {
                startPage = intCell(row, startPageIndex);
                endPage = intCell(row, endPageIndex);
            } else {
                int pages = intCell(row, pagesIndex);
                startPage = 1;
                endPage = pages;
            }
            int pagesRead;
            if (isAudiobookSection(sectionLabel)) {
                pagesRead = timeListenedIndex == null || cell(row, timeListenedIndex).trim().isEmpty()
                        ? 0
                        : parseDuration(cell(row, timeListenedIndex));
            } else {
                pagesRead = pagesReadIndex == null ? 0 : intCell(row, pagesReadIndex);
            }
            Integer currentPage = null;
            if (isAudiobookSection(sectionLabel) && remainingTimeIndex != null && remainingTimeIndex < row.size() && !row.get(remainingTimeIndex).trim().isEmpty()) {
                currentPage = currentTimeFromRemaining(
                        startPage,
                        endPage,
                        parseDuration(cell(row, remainingTimeIndex))
                );
            } else if (isAudiobookSection(sectionLabel) && currentTimeIndex != null && currentTimeIndex < row.size() && !row.get(currentTimeIndex).trim().isEmpty()) {
                currentPage = parseDuration(cell(row, currentTimeIndex));
            } else if (currentPageIndex != null && currentPageIndex < row.size() && !row.get(currentPageIndex).trim().isEmpty()) {
                currentPage = Integer.parseInt(row.get(currentPageIndex).trim());
            }
            String title = row.get(1).trim();
            validateBookRange(sectionLabel, startPage, endPage);
            if (pagesRead < 0 || title.isEmpty()) {
                throw new IllegalArgumentException("each book needs a title and valid range");
            }
            if (currentPage == null && pagesRead > 0) {
                currentPage = isAudiobookSection(sectionLabel)
                        ? startPage + pagesRead
                        : startPage + pagesRead - 1;
            }
            if (currentPage != null) {
                currentPage = clamp(currentPage, startPage, endPage);
            }
            books.add(new Book(books.size() + 1, title, startPage, endPage, currentPage, new ArrayList<>()));
            index++;
        }
        renumberBooks(books);
        return new ParseTableResult(books, index);
    }

    private String csvText(PlanSummary summary) {
        StringBuilder out = new StringBuilder();
        writeCsvRow(out, Collections.singletonList("Reading plan"));
        writeCsvRow(out, Arrays.asList("Start date", startDate.toString()));
        writeCsvRow(out, Arrays.asList(endLabel, endDate.toString()));
        SectionPlan physical = sectionPlanByLabel(summary.sectionPlans, PHYSICAL_BOOKS_LABEL);
        SectionPlan digital = sectionPlanByLabel(summary.sectionPlans, DIGITAL_BOOKS_LABEL);
        SectionPlan audiobook = sectionPlanByLabel(summary.sectionPlans, AUDIOBOOKS_LABEL);
        writeCsvRow(out, Arrays.asList("Total remaining pages", String.valueOf(summary.totalPages)));
        writeCsvRow(out, Arrays.asList("Physical remaining pages", String.valueOf(physical.totalPages)));
        writeCsvRow(out, Arrays.asList("Digital remaining pages", String.valueOf(digital.totalPages)));
        writeCsvRow(out, Arrays.asList("Audiobook remaining time", formatDuration(audiobook.totalPages)));
        writeCsvRow(out, Arrays.asList("Highest daily pace", format15(summary.highestDailyPace) + " pages/day"));
        writeCsvRow(out, Arrays.asList("Audiobook daily time", formatDuration(audiobook.dailyPace) + "/day"));
        writeCsvRow(out, Arrays.asList("Status", summary.overallStatus));
        for (String[] row : optionalSummaryRows(summary.sectionPlans, summary.highestDailyPace)) {
            writeCsvRow(out, Arrays.asList(row[0], row[1]));
        }

        for (SectionPlan sectionPlan : summary.sectionPlans) {
            writeCsvRow(out, Collections.emptyList());
            writeCsvRow(out, Collections.singletonList(sectionPlan.section.label));
            writeCsvRow(out, Arrays.asList("Daily pace", csvDailyPace(sectionPlan)));
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

    private static String csvDailyPace(SectionPlan sectionPlan) {
        if (isAudiobookSection(sectionPlan.section.label)) {
            return formatDuration(sectionPlan.dailyPace) + "/day";
        }
        return format15(sectionPlan.dailyPace) + " pages/day";
    }

    private static List<String> csvHeaders(String sectionLabel) {
        if (isAudiobookSection(sectionLabel)) {
            return Arrays.asList(
                    "Book", "Title", "Start time", "End time", "Remaining time", "Duration",
                    "Daily time", "Cumulative remaining time",
                    "Start date", "Deadline", "Days allocated", "Status"
            );
        }
        return Arrays.asList(
                "Book", "Title", "Start page", "End page", "Current page", "Pages",
                "Read pages", "Remaining pages", "Daily pages", "Cumulative remaining pages",
                "Start date", "Deadline", "Days allocated", "Status"
        );
    }

    private static List<String> csvRow(BookDeadline deadline, String sectionLabel) {
        Book book = deadline.book;
        if (isAudiobookSection(sectionLabel)) {
            return Arrays.asList(
                    String.valueOf(book.number),
                    book.title,
                    formatDuration(book.startPage),
                    formatDuration(book.endPage),
                    formatDuration(unitsRemaining(book, sectionLabel)),
                    formatDuration(totalUnits(book, sectionLabel)),
                    formatDuration(deadline.dailyPages),
                    formatDuration(deadline.cumulativePages),
                    deadline.startDate.toString(),
                    deadline.deadline.toString(),
                    String.valueOf(deadline.daysAllocated),
                    deadline.status
            );
        }
        return Arrays.asList(
                String.valueOf(book.number),
                book.title,
                String.valueOf(book.startPage),
                String.valueOf(book.endPage),
                book.currentPage == null ? "" : String.valueOf(book.currentPage),
                String.valueOf(book.pages()),
                String.valueOf(book.pagesRead()),
                String.valueOf(pagesRemaining(book)),
                format15(deadline.dailyPages),
                String.valueOf(deadline.cumulativePages),
                deadline.startDate.toString(),
                deadline.deadline.toString(),
                String.valueOf(deadline.daysAllocated),
                deadline.status
        );
    }

    private static String sectionDailyPace(SectionPlan sectionPlan) {
        if (isAudiobookSection(sectionPlan.section.label)) {
            return formatDuration(sectionPlan.dailyPace) + "/day";
        }
        return format2(sectionPlan.dailyPace) + " pages/day";
    }

    private SessionTarget sessionTarget(String sectionLabel, Book book, LocalDate targetDate) {
        PlanSummary summary = buildRemainingPlans();
        SectionPlan sectionPlan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
        BookDeadline deadline = deadlineForBook(sectionPlan, book);
        if (deadline == null) {
            throw new IllegalArgumentException("no target available");
        }
        String target = targetDisplayValue(
                sectionLabel,
                book,
                targetUnitsForDate(book, sectionLabel, deadline, targetDate)
        );
        return new SessionTarget(target, sessionDailyPaceValue(sectionLabel, deadline.dailyPages));
    }
    private static BookDeadline deadlineForBook(SectionPlan sectionPlan, Book book) {
        for (BookDeadline deadline : sectionPlan.deadlines) {
            if (deadline.book == book) {
                return deadline;
            }
        }
        return null;
    }

    private static int targetUnitsForDate(Book book, String sectionLabel, BookDeadline deadline, LocalDate targetDate) {
        int total = totalUnits(book, sectionLabel);
        int completed = completedUnits(book, sectionLabel);
        if (unitsRemaining(book, sectionLabel) <= 0 || targetDate.isAfter(deadline.deadline)) {
            return total;
        }
        if (targetDate.isBefore(deadline.startDate) || deadline.dailyPages <= 0) {
            return completed;
        }

        LocalDate activeDate = targetDate.isAfter(deadline.deadline) ? deadline.deadline : targetDate;
        long elapsedDays = ChronoUnit.DAYS.between(deadline.startDate, activeDate) + 1;
        int scheduledUnits = (int) Math.ceil(deadline.dailyPages * elapsedDays - 1e-9);
        return Math.min(Math.max(completed + scheduledUnits, completed), total);
    }

    private static String targetDisplayValue(String sectionLabel, Book book, int targetUnits) {
        if (isAudiobookSection(sectionLabel)) {
            return formatDuration(Math.max(totalUnits(book, sectionLabel) - targetUnits, 0));
        }
        if (targetUnits <= 0) {
            return String.valueOf(book.startPage);
        }
        return String.valueOf(book.startPage + targetUnits - 1);
    }

    private static String sessionDailyPaceValue(String sectionLabel, double dailyPages) {
        return isAudiobookSection(sectionLabel) ? formatDuration(dailyPages) : format2(dailyPages);
    }

    private static String sessionText(String sectionLabel, Book book, ReadingSession session) {
        if (isAudiobookSection(sectionLabel)) {
            return session.date + " | " + sectionLabel + " | "
                    + book.number + ". " + book.title + " | time left "
                    + formatDuration(remainingTimeAt(book, session.currentPage)) + " | +"
                    + formatDuration(session.pagesRead);
        }
        return session.date + " | " + sectionLabel + " | "
                + book.number + ". " + book.title + " | page "
                + session.currentPage + " | +" + session.pagesRead;
    }

    private String summaryText(PlanSummary summary, boolean includeSectionDetails) {
        SectionPlan physical = sectionPlanByLabel(summary.sectionPlans, PHYSICAL_BOOKS_LABEL);
        SectionPlan digital = sectionPlanByLabel(summary.sectionPlans, DIGITAL_BOOKS_LABEL);
        SectionPlan audiobook = sectionPlanByLabel(summary.sectionPlans, AUDIOBOOKS_LABEL);
        StringBuilder text = new StringBuilder();
        text.append("Reading plan\n");
        text.append("Start date: ").append(startDate).append('\n');
        text.append(endLabel).append(": ").append(endDate).append('\n');
        text.append("Remaining pages: ").append(summary.totalPages).append('\n');
        text.append("Physical remaining pages: ").append(physical.totalPages).append('\n');
        text.append("Digital remaining pages: ").append(digital.totalPages).append('\n');
        text.append("Audiobook remaining time: ").append(formatDuration(audiobook.totalPages)).append('\n');
        text.append("Highest remaining daily pace: ").append(format2(summary.highestDailyPace)).append(" pages/day\n");
        text.append("Audiobook remaining daily time: ").append(formatDuration(audiobook.dailyPace)).append("/day\n");
        text.append("Status: ").append(summary.overallStatus).append('\n');
        for (String[] row : optionalSummaryRows(summary.sectionPlans, summary.highestDailyPace)) {
            text.append(row[0]).append(": ").append(row[1]).append('\n');
        }
        if (includeSectionDetails) {
            for (SectionPlan sectionPlan : summary.sectionPlans) {
                text.append('\n').append(sectionPlan.section.label).append('\n');
                if (sectionPlan.deadlines.isEmpty()) {
                    text.append("No books.\n");
                    continue;
                }
                text.append("Remaining daily pace: ").append(sectionDailyPace(sectionPlan)).append('\n');
                text.append(finalResultMessage(sectionPlan.deadlines.get(sectionPlan.deadlines.size() - 1).deadline, endDate, endName())).append('\n');
            }
        }
        return text.toString();
    }

    private void ensureBaselineSchedules(
            List<BookSection> planSections, LocalDate planStart, LocalDate planEnd
    ) {
        for (BookSection section : planSections) {
            for (Book book : section.books) {
                if (book.baselineSchedule == null) {
                    calculateBaselineSchedules(planSections, planStart, planEnd);
                    return;
                }
            }
        }
    }

    private void calculateBaselineSchedules(
            List<BookSection> planSections, LocalDate planStart, LocalDate planEnd
    ) {
        for (BookSection section : planSections) {
            int sectionUnits = 0;
            for (Book book : section.books) {
                sectionUnits += totalUnits(book, section.label);
            }
            double dailyPace = section.books.isEmpty()
                    ? 0.0
                    : (double) sectionUnits / inclusiveDaysBetween(planStart, planEnd);
            SectionPlan plan = buildPlan(
                    section,
                    planStart,
                    planEnd,
                    dailyPace,
                    book -> totalUnits(book, section.label)
            );
            for (BookDeadline deadline : plan.deadlines) {
                deadline.book.baselineSchedule = new BaselineSchedule(
                        deadline.startDate, deadline.deadline, deadline.dailyPages
                );
            }
        }
    }

    private void invalidateBaselineSchedules(BookSection section) {
        for (Book book : section.books) {
            book.baselineSchedule = null;
        }
    }

    private PlanSummary buildRemainingPlans() {
        List<SectionPlan> plans = new ArrayList<>();
        for (BookSection section : sections) {
            plans.add(buildRemainingSectionPlan(section, startDate, endDate, LocalDate.now()));
        }
        int totalPages = 0;
        double highestPace = 0.0;
        boolean achievable = true;
        for (SectionPlan plan : plans) {
            if (!isAudiobookSection(plan.section.label)) {
                totalPages += plan.totalPages;
                highestPace = Math.max(highestPace, plan.dailyPace);
            }
            achievable = achievable && "achievable".equals(plan.overallStatus);
        }
        return new PlanSummary(plans, totalPages, highestPace, achievable ? "achievable" : "not achievable");
    }

    private SectionPlan buildRemainingSectionPlan(BookSection section, LocalDate start, LocalDate end, LocalDate today) {
        if (section.books.isEmpty()) {
            return new SectionPlan(section, new ArrayList<>(), 0.0, 0, 0.0, "achievable");
        }
        LocalDate remainingStart = effectiveRemainingStartDate(start, end, today);
        int periodDays = inclusiveDaysBetween(remainingStart, end);
        int remainingPages = 0;
        for (Book book : section.books) {
            remainingPages += unitsRemaining(book, section.label);
        }
        double dailyPace = remainingPages == 0 ? 0.0 : (double) remainingPages / periodDays;
        SectionPlan plan = buildPlan(
                section,
                remainingStart,
                end,
                dailyPace,
                book -> unitsRemaining(book, section.label)
        );
        return withPersistedBaselineDeadlines(plan, end, today);
    }

    private SectionPlan withPersistedBaselineDeadlines(SectionPlan plan, LocalDate end, LocalDate today) {
        for (Book book : plan.section.books) {
            if (book.baselineSchedule == null) {
                return plan;
            }
        }
        List<BookDeadline> deadlines = new ArrayList<>();
        for (BookDeadline deadline : plan.deadlines) {
            BaselineSchedule baseline = deadline.book.baselineSchedule;
            String status = baseline.deadline.isBefore(end)
                    ? "before end"
                    : baseline.deadline.equals(end) ? "on end date" : "after end";

            deadlines.add(new BookDeadline(
                    deadline.book,
                    deadline.cumulativePages,
                    baseline.startDate,
                    baseline.deadline,
                    inclusiveDaysBetween(baseline.startDate, baseline.deadline),
                    baseline.dailyTarget,
                    status
            ));
        }
        return new SectionPlan(
                plan.section,
                deadlines,
                currentRequiredSectionPace(plan.section, today),
                plan.totalPages,
                plan.requiredPace,
                plan.overallStatus
        );
    }

    private double currentRequiredSectionPace(BookSection section, LocalDate today) {
        Set<Integer> groupedBookIds = new HashSet<>();
        double highestPace = 0.0;
        for (List<Integer> group : section.simultaneousGroups) {
            double groupPace = 0.0;
            for (Integer bookId : group) {
                Book book = section.books.get(bookId - 1);
                groupPace += currentRequiredPace(book, section.label, book.baselineSchedule, today);
                groupedBookIds.add(bookId);
            }
            highestPace = Math.max(highestPace, groupPace);
        }
        for (Book book : section.books) {
            if (!groupedBookIds.contains(book.number)) {
                highestPace = Math.max(
                        highestPace,
                        currentRequiredPace(book, section.label, book.baselineSchedule, today)
                );
            }
        }
        return highestPace;
    }

    private static double currentRequiredPace(
            Book book, String sectionLabel, BaselineSchedule baseline, LocalDate today
    ) {
        LocalDate requiredStart = effectiveRemainingStartDate(
                baseline.startDate, baseline.deadline, today
        );
        return (double) unitsRemaining(book, sectionLabel)
                / inclusiveDaysBetween(requiredStart, baseline.deadline);
    }

    private SectionPlan buildPlan(BookSection section, LocalDate start, LocalDate end, double dailyPace, PageCounter counter) {
        int totalPages = 0;
        for (Book book : section.books) {
            totalPages += counter.pages(book);
        }
        int periodDays = inclusiveDaysBetween(start, end);
        double requiredPace = periodDays == 0 ? 0.0 : (double) totalPages / periodDays;
        List<BookDeadline> deadlines = calculateDeadlines(section.books, start, end, dailyPace, section.simultaneousGroups, counter);
        String overallStatus = deadlines.isEmpty() || !deadlines.get(deadlines.size() - 1).deadline.isAfter(end)
                ? "achievable"
                : "not achievable";
        return new SectionPlan(section, deadlines, dailyPace, totalPages, requiredPace, overallStatus);
    }

    private List<BookDeadline> calculateDeadlines(
            List<Book> books,
            LocalDate start,
            LocalDate end,
            double dailyPace,
            List<List<Integer>> simultaneousGroups,
            PageCounter counter
    ) {
        List<List<Integer>> groups = validateSimultaneousGroups(books, simultaneousGroups);
        Map<Integer, List<Integer>> groupByFirst = new HashMap<>();
        Set<Integer> groupedIds = new HashSet<>();
        for (List<Integer> group : groups) {
            groupByFirst.put(group.get(0), group);
            groupedIds.addAll(group);
        }

        List<BookDeadline> deadlines = new ArrayList<>();
        int cumulativePages = 0;
        int previousCumulativeDays = 0;
        int bookIndex = 0;
        while (bookIndex < books.size()) {
            Book book = books.get(bookIndex);
            if (groupedIds.contains(book.number) && !groupByFirst.containsKey(book.number)) {
                bookIndex++;
                continue;
            }
            List<Integer> groupIds = groupByFirst.containsKey(book.number)
                    ? groupByFirst.get(book.number)
                    : Collections.singletonList(book.number);
            List<Book> groupBooks = books.subList(bookIndex, Math.min(bookIndex + groupIds.size(), books.size()));
            int groupPages = 0;
            for (Book groupBook : groupBooks) {
                groupPages += counter.pages(groupBook);
            }
            cumulativePages += groupPages;
            int cumulativeDays;
            if (dailyPace <= 0 || cumulativePages == 0) {
                cumulativeDays = previousCumulativeDays;
            } else {
                cumulativeDays = Math.max(1, (int) Math.ceil(cumulativePages / dailyPace - 1e-9));
            }
            int daysAllocated = cumulativeDays - previousCumulativeDays;
            LocalDate deadline = start.plusDays(Math.max(cumulativeDays - 1, 0));
            LocalDate groupStart = daysAllocated == 0 ? deadline : start.plusDays(previousCumulativeDays);
            String status;
            if (deadline.isBefore(end)) {
                status = "before end";
            } else if (deadline.equals(end)) {
                status = "on end date";
            } else {
                status = "after end";
            }
            int individualCumulativePages = cumulativePages - groupPages;
            for (Book groupBook : groupBooks) {
                int bookPages = counter.pages(groupBook);
                individualCumulativePages += bookPages;
                double dailyPages;
                if (bookPages == 0) {
                    dailyPages = 0.0;
                } else if (groupBooks.size() == 1) {
                    dailyPages = dailyPace;
                } else if (groupPages == 0) {
                    dailyPages = 0.0;
                } else {
                    dailyPages = dailyPace * bookPages / groupPages;
                }
                deadlines.add(new BookDeadline(
                        groupBook,
                        individualCumulativePages,
                        groupStart,
                        deadline,
                        daysAllocated,
                        dailyPages,
                        status
                ));
            }
            previousCumulativeDays = cumulativeDays;
            bookIndex += groupBooks.size();
        }
        return deadlines;
    }

    private List<String[]> optionalSummaryRows(List<SectionPlan> sectionPlans, double highestDailyPace) {
        SectionPlan physical = sectionPlanByLabel(sectionPlans, PHYSICAL_BOOKS_LABEL);
        SectionPlan digital = sectionPlanByLabel(sectionPlans, DIGITAL_BOOKS_LABEL);
        SectionPlan audiobook = sectionPlanByLabel(sectionPlans, AUDIOBOOKS_LABEL);
        List<String[]> rows = new ArrayList<>();
        if (statsOptions.bookCounts) {
            rows.add(new String[]{"Physical book count", String.valueOf(physical.section.books.size())});
            rows.add(new String[]{"Digital book count", String.valueOf(digital.section.books.size())});
            rows.add(new String[]{"Audiobook count", String.valueOf(audiobook.section.books.size())});
        }
        if (statsOptions.pageShare) {
            int totalPages = physical.totalPages + digital.totalPages;
            double physicalShare = totalPages == 0 ? 0.0 : (double) physical.totalPages / totalPages * 100.0;
            double digitalShare = totalPages == 0 ? 0.0 : (double) digital.totalPages / totalPages * 100.0;
            rows.add(new String[]{"Physical page share", format1(physicalShare) + "%"});
            rows.add(new String[]{"Digital page share", format1(digitalShare) + "%"});
        }
        if (statsOptions.averagePages) {
            rows.add(new String[]{"Physical average pages/book", format1(averagePages(physical))});
            rows.add(new String[]{"Digital average pages/book", format1(averagePages(digital))});
            rows.add(new String[]{"Audiobook average duration", formatDuration(averagePages(audiobook))});
        }
        if (statsOptions.readingPeriod) {
            rows.add(new String[]{"Reading period", inclusiveDaysBetween(startDate, endDate) + " days"});
        }
        if (statsOptions.paceDriver) {
            List<String> drivers = new ArrayList<>();
            for (SectionPlan plan : sectionPlans) {
                if (!isAudiobookSection(plan.section.label)
                        && plan.totalPages > 0
                        && Math.abs(plan.dailyPace - highestDailyPace) < 1e-9) {
                    drivers.add(plan.section.label);
                }
            }
            String driverLabel = drivers.isEmpty() ? "None" : String.join(", ", drivers);
            rows.add(new String[]{"Pace driver", driverLabel + " (" + format2(highestDailyPace) + " pages/day)"});
        }
        return rows;
    }

    private void addReadingSession(Book book, LocalDate sessionDate, int currentPage, String sectionLabel) {
        int previousPagesRead = completedUnits(book, sectionLabel);
        setBookProgress(book, currentPage, sectionLabel);
        int pagesRead = completedUnits(book, sectionLabel) - previousPagesRead;
        if (pagesRead <= 0) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time left must be less than the previously recorded time left"
                    : "current page must be after the previously recorded page");
        }
        book.readingSessions.add(new ReadingSession(sessionDate, currentPage, pagesRead));
    }

    private void removeReadingSession(Book book, int index) {
        if (index < 0 || index >= book.readingSessions.size()) {
            throw new IllegalArgumentException("reading session not found");
        }
        book.readingSessions.remove(index);
        if (book.readingSessions.isEmpty()) {
            book.currentPage = null;
            return;
        }
        int max = book.readingSessions.get(0).currentPage;
        for (ReadingSession session : book.readingSessions) {
            max = Math.max(max, session.currentPage);
        }
        book.currentPage = max;
    }

    private void setBookProgress(Book book, int currentPage, String sectionLabel) {
        if (currentPage < book.startPage) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time left cannot be greater than the audiobook duration"
                    : "current page cannot be before the book's start page");
        }
        if (currentPage > book.endPage) {
            throw new IllegalArgumentException(isAudiobookSection(sectionLabel)
                    ? "time left cannot be negative"
                    : "current page cannot be after the book's end page");
        }
        book.currentPage = currentPage;
    }

    private void moveSelectedBook(BookSection section, int offset) {
        if (!hasSelectedBook(section)) {
            showError("Select a book first");
            return;
        }
        Book selected = section.books.get(selectedBookIndex);
        List<List<Book>> oldGroupBooks = new ArrayList<>();
        for (List<Integer> group : section.simultaneousGroups) {
            List<Book> groupBooks = new ArrayList<>();
            for (Integer id : group) {
                groupBooks.add(section.books.get(id - 1));
            }
            oldGroupBooks.add(groupBooks);
        }
        int[] block = moveBlockRange(section, selectedBookIndex);
        if (offset < 0) {
            if (block[0] == 0) {
                return;
            }
            int[] adjacent = moveBlockRange(section, block[0] - 1);
            List<Book> moving = new ArrayList<>(section.books.subList(block[0], block[1] + 1));
            List<Book> adjacentBooks = new ArrayList<>(section.books.subList(adjacent[0], adjacent[1] + 1));
            section.books.subList(adjacent[0], block[1] + 1).clear();
            section.books.addAll(adjacent[0], moving);
            section.books.addAll(adjacent[0] + moving.size(), adjacentBooks);
        } else {
            if (block[1] == section.books.size() - 1) {
                return;
            }
            int[] adjacent = moveBlockRange(section, block[1] + 1);
            List<Book> moving = new ArrayList<>(section.books.subList(block[0], block[1] + 1));
            List<Book> adjacentBooks = new ArrayList<>(section.books.subList(adjacent[0], adjacent[1] + 1));
            section.books.subList(block[0], adjacent[1] + 1).clear();
            section.books.addAll(block[0], adjacentBooks);
            section.books.addAll(block[0] + adjacentBooks.size(), moving);
        }
        renumberBooks(section.books);
        section.simultaneousGroups = remapGroupsByBookIdentity(section.books, oldGroupBooks);
        selectedBookIndex = section.books.indexOf(selected);
        invalidateBaselineSchedules(section);
        afterStateChange("Book moved");
    }

    private int[] moveBlockRange(BookSection section, int index) {
        int bookId = index + 1;
        for (List<Integer> group : section.simultaneousGroups) {
            if (group.contains(bookId)) {
                return new int[]{group.get(0) - 1, group.get(group.size() - 1) - 1};
            }
        }
        return new int[]{index, index};
    }

    private List<List<Integer>> remapGroupsByBookIdentity(List<Book> books, List<List<Book>> oldGroups) {
        IdentityHashMap<Book, Integer> ids = new IdentityHashMap<>();
        for (Book book : books) {
            ids.put(book, book.number);
        }
        List<List<Integer>> groups = new ArrayList<>();
        for (List<Book> oldGroup : oldGroups) {
            List<Integer> group = new ArrayList<>();
            for (Book book : oldGroup) {
                group.add(ids.get(book));
            }
            Collections.sort(group);
            groups.add(group);
        }
        return validateSimultaneousGroups(books, groups);
    }

    private static List<List<Integer>> validateSimultaneousGroups(List<Book> books, List<List<Integer>> groups) {
        Set<Integer> usedIds = new HashSet<>();
        List<List<Integer>> valid = new ArrayList<>();
        for (List<Integer> rawGroup : groups) {
            List<Integer> group = new ArrayList<>(rawGroup);
            Collections.sort(group);
            if (group.size() < 2) {
                throw new IllegalArgumentException("choose at least two Book IDs");
            }
            Set<Integer> unique = new HashSet<>(group);
            if (unique.size() != group.size()) {
                throw new IllegalArgumentException("each Book ID can appear only once in a group");
            }
            if (group.get(0) < 1 || group.get(group.size() - 1) > books.size()) {
                throw new IllegalArgumentException("Book IDs must be from 1 to " + books.size());
            }
            for (int i = 0; i < group.size(); i++) {
                if (group.get(i) != group.get(0) + i) {
                    throw new IllegalArgumentException("Book IDs read together must be consecutive");
                }
            }
            for (Integer id : group) {
                if (usedIds.contains(id)) {
                    throw new IllegalArgumentException("a book can belong to only one simultaneous group");
                }
            }
            usedIds.addAll(group);
            valid.add(group);
        }
        return valid;
    }

    private List<List<Integer>> remapGroupsAfterDeletion(List<List<Integer>> groups, int deletedBookId, List<Book> books) {
        List<List<Integer>> remapped = new ArrayList<>();
        for (List<Integer> group : groups) {
            List<Integer> newGroup = new ArrayList<>();
            for (Integer id : group) {
                if (id == deletedBookId) {
                    continue;
                }
                newGroup.add(id > deletedBookId ? id - 1 : id);
            }
            if (newGroup.size() >= 2) {
                remapped.add(newGroup);
            }
        }
        return validateSimultaneousGroups(books, remapped);
    }

    private List<List<Integer>> remapGroupsAfterAddition(List<List<Integer>> groups, int newBookPosition, List<Book> books) {
        List<List<Integer>> remapped = new ArrayList<>();
        for (List<Integer> group : groups) {
            List<Integer> newGroup = new ArrayList<>();
            for (Integer id : group) {
                newGroup.add(id >= newBookPosition ? id + 1 : id);
            }
            remapped.add(newGroup);
        }
        return validateSimultaneousGroups(books, remapped);
    }

    private List<Integer> insertionSplitsSimultaneousGroup(int position, List<List<Integer>> groups) {
        for (List<Integer> group : groups) {
            if (group.get(0) < position && position <= group.get(group.size() - 1)) {
                return group;
            }
        }
        return null;
    }

    private List<List<Integer>> parseGroupText(String rawText) {
        List<List<Integer>> groups = new ArrayList<>();
        for (String rawGroup : rawText.split(";")) {
            rawGroup = rawGroup.trim();
            if (rawGroup.isEmpty()) {
                continue;
            }
            List<Integer> group = new ArrayList<>();
            for (String rawId : rawGroup.split(",")) {
                rawId = rawId.trim();
                if (!rawId.isEmpty()) {
                    group.add(Integer.parseInt(rawId));
                }
            }
            groups.add(group);
        }
        return groups;
    }

    private List<List<Integer>> parseCsvGroups(List<Book> books, String rawGroups, String label) {
        try {
            return validateSimultaneousGroups(books, parseGroupText(rawGroups));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("invalid " + label + " simultaneous groups: " + ex.getMessage());
        }
    }

    private BookFields readBookFields(String sectionLabel, EditText titleInput, EditText startPageInput, EditText endPageInput, String defaultTitle, Integer defaultStart, Integer defaultEnd) {
        try {
            String title = titleInput.getText().toString().trim();
            if (title.isEmpty()) {
                title = defaultTitle == null ? "" : defaultTitle;
            }
            if (title.isEmpty()) {
                throw new IllegalArgumentException("Book title is required");
            }
            String rawStart = startPageInput.getText().toString().trim();
            String rawEnd = endPageInput.getText().toString().trim();
            int start = rawStart.isEmpty() && defaultStart != null
                    ? defaultStart
                    : parseBookUnit(sectionLabel, rawStart);
            int end = rawEnd.isEmpty() && defaultEnd != null
                    ? defaultEnd
                    : parseBookUnit(sectionLabel, rawEnd);
            validateBookRange(sectionLabel, start, end);
            return new BookFields(title, start, end);
        } catch (NumberFormatException ex) {
            showError(isAudiobookSection(sectionLabel)
                    ? "Start time and end time must be HH:MM or HH:MM:SS"
                    : "Start page and end page must be whole numbers");
            return null;
        } catch (IllegalArgumentException ex) {
            showError(ex.getMessage());
            return null;
        }
    }

    private List<String> bookChoices(BookSection section) {
        List<String> choices = new ArrayList<>();
        for (Book book : section.books) {
            choices.add(book.number + ". " + book.title);
        }
        return choices;
    }

    private Book selectedBookFromSpinner(String sectionLabel, Spinner spinner) {
        Object selected = spinner.getSelectedItem();
        if (selected == null) {
            return null;
        }
        String value = String.valueOf(selected);
        int dot = value.indexOf('.');
        if (dot < 0) {
            return null;
        }
        int number = Integer.parseInt(value.substring(0, dot));
        for (Book book : sectionByLabel(sectionLabel).books) {
            if (book.number == number) {
                return book;
            }
        }
        return null;
    }

    private Book selectedBook(BookSection section) {
        if (!hasSelectedBook(section)) {
            return null;
        }
        return section.books.get(selectedBookIndex);
    }

    private boolean hasSelectedBook(BookSection section) {
        return selectedBookIndex >= 0 && selectedBookIndex < section.books.size();
    }

    private BookSection sectionByLabel(String label) {
        return sectionByLabelFromList(sections, label);
    }

    private static BookSection sectionByLabelFromList(List<BookSection> list, String label) {
        for (BookSection section : list) {
            if (section.label.equals(label)) {
                return section;
            }
        }
        throw new IllegalArgumentException("unknown section: " + label);
    }

    private static SectionPlan sectionPlanByLabel(List<SectionPlan> plans, String label) {
        for (SectionPlan plan : plans) {
            if (plan.section.label.equals(label)) {
                return plan;
            }
        }
        throw new IllegalArgumentException("unknown section: " + label);
    }

    private static List<BookSection> blankSections() {
        List<BookSection> list = new ArrayList<>();
        list.add(new BookSection(PHYSICAL_BOOKS_LABEL));
        list.add(new BookSection(DIGITAL_BOOKS_LABEL));
        list.add(new BookSection(AUDIOBOOKS_LABEL));
        return list;
    }

    private static void renumberBooks(List<Book> books) {
        for (int i = 0; i < books.size(); i++) {
            books.get(i).number = i + 1;
        }
    }

    private static int pagesRemaining(Book book) {
        return Math.max(book.pages() - book.pagesRead(), 0);
    }

    private static boolean isAudiobookSection(String label) {
        return AUDIOBOOKS_LABEL.equals(label);
    }

    private static String canonicalSectionLabel(String rawLabel, String defaultLabel) {
        String label = rawLabel == null ? "" : rawLabel.trim();
        if (label.isEmpty()) {
            label = defaultLabel;
        }
        String normalized = label.toLowerCase(Locale.US).replaceAll("[^a-z0-9]", "");
        switch (normalized) {
            case "physical":
            case "physicalbook":
            case "physicalbooks":
            case "paperbook":
            case "paperbooks":
            case "printbook":
            case "printbooks":
                return PHYSICAL_BOOKS_LABEL;
            case "digital":
            case "digitalbook":
            case "digitalbooks":
            case "ebook":
            case "ebooks":
            case "kindlebook":
            case "kindlebooks":
                return DIGITAL_BOOKS_LABEL;
            case "audio":
            case "audiobook":
            case "audiobooks":
                return AUDIOBOOKS_LABEL;
            default:
                if (BOOK_SECTION_LABELS.contains(defaultLabel) && !BOOK_SECTION_LABELS.contains(label)) {
                    return defaultLabel;
                }
                return label;
        }
    }

    private static int parseBookUnit(String sectionLabel, String value) {
        return isAudiobookSection(sectionLabel)
                ? parseDuration(value)
                : Integer.parseInt(value);
    }

    private static int parseDuration(String value) {
        String[] parts = value.trim().split(":");
        if (parts.length != 2 && parts.length != 3) {
            throw new IllegalArgumentException("time must be HH:MM or HH:MM:SS");
        }
        int hours = Integer.parseInt(parts[0]);
        int minutes = Integer.parseInt(parts[1]);
        int seconds = parts.length == 3 ? Integer.parseInt(parts[2]) : 0;
        if (hours < 0 || minutes < 0 || seconds < 0) {
            throw new IllegalArgumentException("time cannot be negative");
        }
        if (minutes >= 60 || seconds >= 60) {
            throw new IllegalArgumentException("minutes and seconds must be below 60");
        }
        return hours * 3600 + minutes * 60 + seconds;
    }

    private static String formatDuration(double rawSeconds) {
        int totalSeconds = Math.max(0, (int) Math.round(rawSeconds));
        int hours = totalSeconds / 3600;
        int remainder = totalSeconds % 3600;
        int minutes = remainder / 60;
        int seconds = remainder % 60;
        if (seconds == 0) {
            return String.format(Locale.US, "%d:%02d", hours, minutes);
        }
        return String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
    }

    private static String displayValue(String sectionLabel, Integer value) {
        if (value == null) {
            return "";
        }
        return isAudiobookSection(sectionLabel) ? formatDuration(value) : String.valueOf(value);
    }

    private static int totalUnits(Book book, String sectionLabel) {
        return isAudiobookSection(sectionLabel) ? book.endPage - book.startPage : book.pages();
    }

    private static int completedUnits(Book book, String sectionLabel) {
        if (book.currentPage == null) {
            return 0;
        }
        if (isAudiobookSection(sectionLabel)) {
            return Math.min(Math.max(book.currentPage - book.startPage, 0), totalUnits(book, sectionLabel));
        }
        return book.pagesRead();
    }

    private static int unitsRemaining(Book book, String sectionLabel) {
        return Math.max(totalUnits(book, sectionLabel) - completedUnits(book, sectionLabel), 0);
    }

    private static int remainingTimeAt(Book book, int currentTime) {
        return Math.max(book.endPage - currentTime, 0);
    }

    private static int currentTimeFromRemaining(Book book, int remainingTime) {
        return currentTimeFromRemaining(book.startPage, book.endPage, remainingTime);
    }

    private static int currentTimeFromRemaining(int startTime, int endTime, int remainingTime) {
        int duration = endTime - startTime;
        if (remainingTime < 0) {
            throw new IllegalArgumentException("remaining time cannot be negative");
        }
        if (remainingTime > duration) {
            throw new IllegalArgumentException("remaining time cannot be greater than the audiobook duration");
        }
        return endTime - remainingTime;
    }

    private static LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("invalid date");
        }
    }

    private static LocalDate nextQuarterStart(LocalDate today) {
        for (int month : new int[]{1, 4, 7, 10}) {
            LocalDate candidate = LocalDate.of(today.getYear(), month, 1);
            if (candidate.isAfter(today)) {
                return candidate;
            }
        }
        return LocalDate.of(today.getYear() + 1, 1, 1);
    }

    private static LocalDate periodEndFromStart(LocalDate start) {
        return start.plusMonths(3).minusDays(1);
    }

    private static int inclusiveDaysBetween(LocalDate start, LocalDate end) {
        return (int) ChronoUnit.DAYS.between(start, end) + 1;
    }

    private static LocalDate effectiveRemainingStartDate(LocalDate start, LocalDate end, LocalDate today) {
        if (today.isBefore(start)) {
            return start;
        }
        if (today.isAfter(end)) {
            return end;
        }
        return today;
    }

    private static void validatePageRange(int startPage, int endPage) {
        if (startPage < 0) {
            throw new IllegalArgumentException("start page cannot be negative");
        }
        if (endPage < startPage) {
            throw new IllegalArgumentException("end page must be on or after the start page");
        }
    }

    private static void validateBookRange(String sectionLabel, int start, int end) {
        if (!isAudiobookSection(sectionLabel)) {
            validatePageRange(start, end);
            return;
        }
        if (start < 0) {
            throw new IllegalArgumentException("start time cannot be negative");
        }
        if (end < start) {
            throw new IllegalArgumentException("end time must be on or after the start time");
        }
    }

    private static double averagePages(SectionPlan plan) {
        int count = plan.section.books.size();
        return count == 0 ? 0.0 : (double) plan.totalPages / count;
    }

    private String endName() {
        return "Target finish date".equals(endLabel) ? "target finish date" : "quarter end date";
    }

    private static String finalResultMessage(LocalDate finalDeadline, LocalDate endDate, String endName) {
        long difference = ChronoUnit.DAYS.between(finalDeadline, endDate);
        if (difference > 0) {
            return "You finish " + difference + " day" + (difference == 1 ? "" : "s") + " before the " + endName + ".";
        }
        if (difference == 0) {
            return "You finish exactly on the " + endName + ".";
        }
        long lateDays = Math.abs(difference);
        return "You finish " + lateDays + " day" + (lateDays == 1 ? "" : "s") + " after the " + endName + ".";
    }

    private static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private static String format1(double value) {
        return String.format(Locale.US, "%.1f", value);
    }

    private static String format2(double value) {
        return String.format(Locale.US, "%.2f", value);
    }

    private static String format15(double value) {
        return String.format(Locale.US, "%.15g", value);
    }

    private static String groupsToText(List<List<Integer>> groups) {
        List<String> groupTexts = new ArrayList<>();
        for (List<Integer> group : groups) {
            List<String> ids = new ArrayList<>();
            for (Integer id : group) {
                ids.add(String.valueOf(id));
            }
            groupTexts.add(String.join(",", ids));
        }
        return String.join("; ", groupTexts);
    }

    private static String groupsCompact(List<List<Integer>> groups) {
        return groupsToText(groups).replace("; ", ";");
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

    private static List<List<String>> parseCsv(String raw) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (inQuotes) {
                if (ch == '"') {
                    if (i + 1 < raw.length() && raw.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                inQuotes = true;
            } else if (ch == ',') {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (ch == '\n') {
                row.add(cell.toString());
                rows.add(row);
                row = new ArrayList<>();
                cell.setLength(0);
            } else if (ch != '\r') {
                cell.append(ch);
            }
        }
        if (cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }

    private static boolean isBlankRow(List<String> row) {
        if (row.isEmpty()) {
            return true;
        }
        for (String cell : row) {
            if (!cell.trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private static boolean startsWith(List<String> row, String... values) {
        if (row.size() < values.length) {
            return false;
        }
        for (int i = 0; i < values.length; i++) {
            if (!values[i].equals(row.get(i))) {
                return false;
            }
        }
        return true;
    }

    private static int intCell(List<String> row, int index) {
        if (index >= row.size()) {
            throw new IllegalArgumentException("book page fields must be whole numbers");
        }
        try {
            return Integer.parseInt(row.get(index).trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("book page fields must be whole numbers");
        }
    }

    private static String cell(List<String> row, int index) {
        return index < row.size() ? row.get(index).trim() : "";
    }

    private static class SimpleTextWatcher implements TextWatcher {
        private final Runnable callback;

        SimpleTextWatcher(Runnable callback) {
            this.callback = callback;
        }

        @Override
        public void beforeTextChanged(CharSequence s, int start, int count, int after) {
        }

        @Override
        public void onTextChanged(CharSequence s, int start, int before, int count) {
        }

        @Override
        public void afterTextChanged(Editable s) {
            callback.run();
        }
    }

    private static class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
        private final Runnable callback;
        private boolean firstSelection = true;

        SimpleItemSelectedListener(Runnable callback) {
            this.callback = callback;
        }

        @Override
        public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
            if (firstSelection) {
                firstSelection = false;
                return;
            }
            callback.run();
        }

        @Override
        public void onNothingSelected(android.widget.AdapterView<?> parent) {
        }
    }

    private interface PageCounter {
        int pages(Book book);
    }

    private static class SessionTarget {
        final String value;
        final String dailyPace;

        SessionTarget(String value, String dailyPace) {
            this.value = value;
            this.dailyPace = dailyPace;
        }
    }
    private static class SessionEntry {
        final int sectionIndex;
        final int bookIndex;
        final int sessionIndex;
        final BookSection section;
        final Book book;
        final ReadingSession session;

        SessionEntry(int sectionIndex, int bookIndex, int sessionIndex, BookSection section, Book book, ReadingSession session) {
            this.sectionIndex = sectionIndex;
            this.bookIndex = bookIndex;
            this.sessionIndex = sessionIndex;
            this.section = section;
            this.book = book;
            this.session = session;
        }
    }
    private static class ReadingSession {
        final LocalDate date;
        final int currentPage;
        final int pagesRead;

        ReadingSession(LocalDate date, int currentPage, int pagesRead) {
            this.date = date;
            this.currentPage = currentPage;
            this.pagesRead = pagesRead;
        }
    }

    private static class BaselineSchedule {
        final LocalDate startDate;
        final LocalDate deadline;
        final double dailyTarget;

        BaselineSchedule(LocalDate startDate, LocalDate deadline, double dailyTarget) {
            this.startDate = startDate;
            this.deadline = deadline;
            this.dailyTarget = dailyTarget;
        }
    }

    private static class Book {
        int number;
        final String title;
        final int startPage;
        final int endPage;
        Integer currentPage;
        final List<ReadingSession> readingSessions;
        BaselineSchedule baselineSchedule;

        Book(int number, String title, int startPage, int endPage) {
            this(number, title, startPage, endPage, null, new ArrayList<>(), null);
        }

        Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions) {
            this(number, title, startPage, endPage, currentPage, readingSessions, null);
        }

        Book(
                int number,
                String title,
                int startPage,
                int endPage,
                Integer currentPage,
                List<ReadingSession> readingSessions,
                BaselineSchedule baselineSchedule
        ) {
            this.number = number;
            this.title = title;
            this.startPage = startPage;
            this.endPage = endPage;
            this.currentPage = currentPage;
            this.readingSessions = readingSessions;
            this.baselineSchedule = baselineSchedule;
        }

        int pages() {
            return endPage - startPage + 1;
        }

        int pagesRead() {
            if (currentPage == null) {
                return 0;
            }
            return Math.min(Math.max(currentPage - startPage + 1, 0), pages());
        }
    }

    private static class BookSection {
        final String label;
        final List<Book> books = new ArrayList<>();
        List<List<Integer>> simultaneousGroups = new ArrayList<>();

        BookSection(String label) {
            this.label = label;
        }
    }

    private static class BookDeadline {
        final Book book;
        final int cumulativePages;
        final LocalDate startDate;
        final LocalDate deadline;
        final int daysAllocated;
        final double dailyPages;
        final String status;

        BookDeadline(Book book, int cumulativePages, LocalDate startDate, LocalDate deadline, int daysAllocated, double dailyPages, String status) {
            this.book = book;
            this.cumulativePages = cumulativePages;
            this.startDate = startDate;
            this.deadline = deadline;
            this.daysAllocated = daysAllocated;
            this.dailyPages = dailyPages;
            this.status = status;
        }
    }

    private static class SectionPlan {
        final BookSection section;
        final List<BookDeadline> deadlines;
        final double dailyPace;
        final int totalPages;
        final double requiredPace;
        final String overallStatus;

        SectionPlan(BookSection section, List<BookDeadline> deadlines, double dailyPace, int totalPages, double requiredPace, String overallStatus) {
            this.section = section;
            this.deadlines = deadlines;
            this.dailyPace = dailyPace;
            this.totalPages = totalPages;
            this.requiredPace = requiredPace;
            this.overallStatus = overallStatus;
        }
    }

    private static class PlanSummary {
        final List<SectionPlan> sectionPlans;
        final int totalPages;
        final double highestDailyPace;
        final String overallStatus;

        PlanSummary(List<SectionPlan> sectionPlans, int totalPages, double highestDailyPace, String overallStatus) {
            this.sectionPlans = sectionPlans;
            this.totalPages = totalPages;
            this.highestDailyPace = highestDailyPace;
            this.overallStatus = overallStatus;
        }
    }

    private static class StatsOptions {
        final boolean bookCounts;
        final boolean pageShare;
        final boolean averagePages;
        final boolean readingPeriod;
        final boolean paceDriver;

        StatsOptions(boolean bookCounts, boolean pageShare, boolean averagePages, boolean readingPeriod, boolean paceDriver) {
            this.bookCounts = bookCounts;
            this.pageShare = pageShare;
            this.averagePages = averagePages;
            this.readingPeriod = readingPeriod;
            this.paceDriver = paceDriver;
        }
    }

    private static class CsvPlan {
        final List<BookSection> sections;
        final LocalDate startDate;
        final LocalDate endDate;
        final String endLabel;
        final StatsOptions statsOptions;

        CsvPlan(List<BookSection> sections, LocalDate startDate, LocalDate endDate, String endLabel, StatsOptions statsOptions) {
            this.sections = sections;
            this.startDate = startDate;
            this.endDate = endDate;
            this.endLabel = endLabel;
            this.statsOptions = statsOptions;
        }
    }

    private static class ParseTableResult {
        final List<Book> books;
        final int nextIndex;

        ParseTableResult(List<Book> books, int nextIndex) {
            this.books = books;
            this.nextIndex = nextIndex;
        }
    }

    private static class BookFields {
        final String title;
        final int startPage;
        final int endPage;

        BookFields(String title, int startPage, int endPage) {
            this.title = title;
            this.startPage = startPage;
            this.endPage = endPage;
        }
    }
}
