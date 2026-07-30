package com.petermolnar.readingplan;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
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

import static com.petermolnar.readingplan.BookCollections.*;
import static com.petermolnar.readingplan.CsvSupport.*;
import static com.petermolnar.readingplan.PlanPrimitives.*;

public class MainActivity extends Activity {
    private static final String PREFS = "reading_plan_prefs";
    private static final String PREF_JSON_URI = "json_uri";
    private static final int REQUEST_OPEN_JSON = 100;
    private static final int REQUEST_OPEN_CSV = 101;
    private static final int REQUEST_CREATE_CSV = 102;
    static final String PHYSICAL_BOOKS_LABEL = "Physical books";
    static final String DIGITAL_BOOKS_LABEL = "Digital books";
    static final String AUDIOBOOKS_LABEL = "Audiobooks";
    static final List<String> BOOK_SECTION_LABELS = Arrays.asList(
            PHYSICAL_BOOKS_LABEL,
            DIGITAL_BOOKS_LABEL,
            AUDIOBOOKS_LABEL
    );
    static final int LATTE = 0xfff1e4d4;
    static final int CREAM = 0xfffff8f0;
    static final int LIGHT_CREAM = 0xfff7ede2;
    static final int ESPRESSO = 0xff3a241a;
    static final int MOCHA = 0xff6f4e37;
    static final int CARAMEL = 0xffb56b3c;
    static final int CARAMEL_DARK = 0xff87421e;
    static final int BORDER = 0xffd6baa1;
    static final int SUCCESS = 0xff3d6b4f;
    static final int SUCCESS_DARK = 0xff28513a;
    static final int ERROR = 0xff9f3a2b;
    static final int ERROR_DARK = 0xff6f231a;
    static final int VIOLET = 0xff7c3aed;
    static final int VIOLET_DARK = 0xff5b21b6;
    private static final int TARGET_COMPLETE = 0xff00ba40;
    private static final int TARGET_COMPLETE_DARK = 0xff00832d;

    private LinearLayout root;
    private LinearLayout tabBar;
    private FrameLayout content;
    Button jsonStatusButton;
    private boolean jsonLoaded;

    final List<BookSection> sections = blankSections();
    private final ReadingPlanUi ui = new ReadingPlanUi(this);
    private final ReadingPlanTables tables = new ReadingPlanTables(this);
    private final ReadingSessionEntries sessionEntries = new ReadingSessionEntries(this);
    private StatsOptions statsOptions = new StatsOptions(true, true, true, true, true);
    private LocalDate startDate;
    private LocalDate endDate;
    private String endLabel = "Quarter end";
    private final List<RestDayRange> restDays = new ArrayList<>();
    private Uri jsonUri;
    private String currentTab = "Session";
    private boolean metricsSubview = false;
    private String metricDetail = null;
    private String previousTabBeforeSettings = "Session";
    private String selectedBookSection = PHYSICAL_BOOKS_LABEL;
    private int selectedBookIndex = -1;
    private int selectedSessionBookNumber = -1;
    private boolean showPlanDateFields = false;
    private boolean showActualPaceProjection = true;
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
        attachButtonAnimation(jsonStatusButton, SUCCESS, SUCCESS_DARK);
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
        attachButtonAnimation(settings, CARAMEL, CARAMEL_DARK);
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

    private Button actionButton(String label, View.OnClickListener listener) { return ui.actionButton(label, listener); }
    Button secondaryButton(String label, View.OnClickListener listener) { return ui.secondaryButton(label, listener); }
    private Button selectionButton(String label, boolean selected) { return ui.selectionButton(label, selected); }
    private void attachButtonAnimation(View view, int normalFill, int normalBorder) { ui.attachButtonAnimation(view, normalFill, normalBorder); }
    private LinearLayout metricColumn(String label, TextView value) { return ui.metricColumn(label, value); }
    private TextView metricValue() { return ui.metricValue(); }
    GradientDrawable roundedBackground(int fillColor, int borderColor) { return ui.roundedBackground(fillColor, borderColor); }
    LinearLayout surfaceCard() { return ui.surfaceCard(); }
    private void renderTabBar() {
        tabBar.removeAllViews();
        for (String tab : Arrays.asList("Session", "Plan", "Books", "Charts")) {
            boolean selected = tab.equals(currentTab);
            Button button = new Button(this);
            button.setText(tab);
            button.setAllCaps(false);
            button.setTextSize(13);
            button.setTextColor(selected ? CREAM : ESPRESSO);
            button.setBackground(roundedBackground(selected ? ESPRESSO : CREAM, selected ? ESPRESSO : BORDER));
            button.setOnClickListener(v -> {
                currentTab = tab;
                if ("Charts".equals(tab)) {
                    metricsSubview = false;
                    metricDetail = null;
                }
                showCurrentTab();
            });
            attachButtonAnimation(button, selected ? ESPRESSO : CREAM, selected ? ESPRESSO : BORDER);
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
        } else if ("Charts".equals(currentTab)) {
            content.addView(metricsSubview ? buildMetricsView() : buildChartsTab());
        } else if ("Settings".equals(currentTab)) {
            content.addView(buildSettingsView());
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
        List<Book> sessionBooks = sessionBooks(section);
        if (sessionBooks.isEmpty()) {
            TextView empty = label("No books are available to read today.");
            empty.setTextColor(MOCHA);
            bookCard.addView(empty);
        } else {
            addSessionBookButtons(bookCard, sessionBooks);
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
        TextView targetValue = metricValue();
        TextView paceValue = metricValue();
        String targetLabel = audiobookSection ? "Target time left" : "Target page";
        String paceLabel = audiobookSection ? "Time per day" : "Pages per day";
        metrics.addView(metricColumn(targetLabel, targetValue), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        metrics.addView(metricColumn(paceLabel, paceValue), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        detailsCard.addView(metrics);
        Runnable updateTargetCompletion = () -> {
            Book book = selectedSessionBook();
            boolean complete = book != null && isTargetCompleteToday(book)
                    && LocalDate.now().toString().equals(dateInput.getText().toString().trim());
            if (book != null && !complete) {
                complete = markTargetCompletedIfReached(
                        book,
                        selectedBookSection,
                        dateInput.getText().toString().trim(),
                        pageInput.getText().toString().trim()
                );
            }
            metrics.setBackground(roundedBackground(
                    complete ? TARGET_COMPLETE : LIGHT_CREAM,
                    complete ? TARGET_COMPLETE_DARK : BORDER
            ));
            targetValue.setTextColor(complete ? CREAM : ESPRESSO);
            paceValue.setTextColor(complete ? CREAM : ESPRESSO);
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
                SessionTarget target = sessionTarget(selectedBookSection, book, parseDate(dateInput.getText().toString().trim()));
                targetValue.setText(target.value);
                paceValue.setText(target.dailyPace);
            } catch (IllegalArgumentException ex) {
                targetValue.setText("-");
                paceValue.setText("-");
            }
            updateTargetCompletion.run();
        };
        dateInput.addTextChangedListener(new SimpleTextWatcher(updateTarget));
        pageInput.addTextChangedListener(new SimpleTextWatcher(updateTargetCompletion));
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
                boolean targetReached = targetReached(
                        book, selectedBookSection, sessionDate, currentPage
                );
                addReadingSession(book, sessionDate, currentPage, selectedBookSection);
                if (targetReached && sessionDate.equals(LocalDate.now())) {
                    book.targetCompletedDate = sessionDate.toString();
                }
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

    private void addSessionBookButtons(LinearLayout container, List<Book> books) {
        for (int start = 0; start < books.size(); start += 2) {
            LinearLayout bookRow = row();
            for (int index = start; index < Math.min(start + 2, books.size()); index++) {
                Book book = books.get(index);
                Button button = selectionButton(book.number + ". " + book.title, book.number == selectedSessionBookNumber);
                int bookNumber = book.number;
                button.setOnClickListener(v -> {
                    selectedSessionBookNumber = bookNumber;
                    showCurrentTab();
                });
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
                params.setMargins(0, 0, index + 1 < books.size() ? dp(6) : 0, dp(6));
                bookRow.addView(button, params);
            }
            container.addView(bookRow);
        }
    }

    private Book selectedSessionBook() {
        BookSection section = sectionByLabel(selectedBookSection);
        List<Book> books = sessionBooks(section);
        for (Book book : books) {
            if (book.number == selectedSessionBookNumber) {
                return book;
            }
        }
        if (books.isEmpty()) {
            selectedSessionBookNumber = -1;
            return null;
        }
        Book first = books.get(0);
        selectedSessionBookNumber = first.number;
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

    private void showEntriesSheet() {
        sessionEntries.show();
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

        LinearLayout header = row();
        header.addView(heading("Plan"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(secondaryButton("New plan", v -> confirmNewPlan()));
        box.addView(header);

        if (showPlanDateFields) {
            EditText startInput = editText(startDate.toString(), InputType.TYPE_CLASS_TEXT);
            CheckBox customTarget = checkBox("Custom finish date", "Target finish date".equals(endLabel));
            EditText endInput = editText(endDate.toString(), InputType.TYPE_CLASS_TEXT);
            box.addView(label("Start date"));
            box.addView(startInput);
            box.addView(customTarget);
            box.addView(label("Finish date"));
            box.addView(endInput);
            box.addView(actionButton("Create plan", v -> {
                try {
                    LocalDate parsedStart = parseDate(startInput.getText().toString().trim());
                    LocalDate parsedEnd = parseDate(endInput.getText().toString().trim());
                    if (parsedEnd.isBefore(parsedStart)) {
                        throw new IllegalArgumentException("finish date must be on or after the start date");
                    }
                    startDate = parsedStart;
                    endDate = customTarget.isChecked() ? parsedEnd : periodEndFromStart(startDate);
                    endLabel = customTarget.isChecked() ? "Target finish date" : "Quarter end";
                    recalculateBaselineSchedules(sections, startDate, endDate);
                    afterStateChange("Plan recalculated");
                } catch (IllegalArgumentException ex) {
                    showError(ex.getMessage());
                }
            }));
        } else {
            TextView hint = label("Your current plan is active. Press New plan to choose start and finish dates.");
            hint.setTextColor(MOCHA);
            box.addView(hint);
            box.addView(actionButton("Recalculate current plan", v -> {
                recalculateBaselineSchedules(sections, startDate, endDate);
                afterStateChange("Plan recalculated");
            }));
        }

        box.addView(sectionTitle("Rest-day ranges"));
        LinearLayout restRangeList = verticalBox();
        renderRestDayRanges(restRangeList);
        box.addView(restRangeList);
        EditText restStartInput = editText("", InputType.TYPE_CLASS_TEXT);
        restStartInput.setFocusable(false);
        restStartInput.setOnClickListener(v -> {
            DatePickerDialog picker = new DatePickerDialog(this, (view, y, m, d) -> {
                restStartInput.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
            }, LocalDate.now().getYear(), LocalDate.now().getMonthValue() - 1, LocalDate.now().getDayOfMonth());
            picker.show();
        });
        EditText restEndInput = editText("", InputType.TYPE_CLASS_TEXT);
        restEndInput.setFocusable(false);
        restEndInput.setOnClickListener(v -> {
            DatePickerDialog picker = new DatePickerDialog(this, (view, y, m, d) -> {
                restEndInput.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
            }, LocalDate.now().getYear(), LocalDate.now().getMonthValue() - 1, LocalDate.now().getDayOfMonth());
            picker.show();
        });
        box.addView(label("Rest start date"));
        box.addView(restStartInput);
        box.addView(label("Rest end date"));
        box.addView(restEndInput);
        box.addView(actionButton("Add rest-day range", v -> {
            try {
                RestDayRange range = new RestDayRange(
                        parseDate(restStartInput.getText().toString().trim()),
                        parseDate(restEndInput.getText().toString().trim())
                );
                if (range.endDate.isBefore(range.startDate)) {
                    throw new IllegalArgumentException("rest-day end date must be on or after the start date");
                }
                restDays.add(range);
                normalizeRestDayRanges();
                afterStateChange("Rest-day range added");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        }));
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
        box.addView(actionButton("Choose book to edit", v -> showBookPicker(section)));
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
        EditText startDateInput = editText(
                selected == null || selected.startDateOverride == null ? "" : selected.startDateOverride.toString(),
                InputType.TYPE_CLASS_TEXT
        );
        startDateInput.setFocusable(false);
        startDateInput.setOnClickListener(v -> {
            LocalDate initial = selected != null && selected.startDateOverride != null
                    ? selected.startDateOverride : LocalDate.now();
            DatePickerDialog picker = new DatePickerDialog(this, (view, y, m, d) -> {
                startDateInput.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
            }, initial.getYear(), initial.getMonthValue() - 1, initial.getDayOfMonth());
            picker.show();
        });
        EditText deadlineInput = editText(
                selected == null || selected.deadlineOverride == null ? "" : selected.deadlineOverride.toString(),
                InputType.TYPE_CLASS_TEXT
        );
        deadlineInput.setFocusable(false);
        deadlineInput.setOnClickListener(v -> {
            LocalDate initial = selected != null && selected.deadlineOverride != null
                    ? selected.deadlineOverride : LocalDate.now();
            DatePickerDialog picker = new DatePickerDialog(this, (view, y, m, d) -> {
                deadlineInput.setText(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d));
            }, initial.getYear(), initial.getMonthValue() - 1, initial.getDayOfMonth());
            picker.show();
        });
        box.addView(label("Title"));
        box.addView(titleInput);
        box.addView(label(audiobookSection ? "Start time" : "Start page"));
        box.addView(startPageInput);
        box.addView(label(audiobookSection ? "End time" : "End page"));
        box.addView(endPageInput);
        box.addView(label("Start date override"));
        box.addView(startDateInput);
        box.addView(actionButton("Set start date", v -> {
            try {
                if (selected == null) {
                    throw new IllegalArgumentException("Select a book first");
                }
                String raw = startDateInput.getText().toString().trim();
                LocalDate override = raw.isEmpty() ? null : parseDate(raw);
                applyStartDateOverride(section, selected, override, startDate);
                afterStateChange("Start date override updated");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        }));
        box.addView(label("Deadline override"));
        box.addView(deadlineInput);
        box.addView(actionButton("Set deadline", v -> {
            try {
                if (selected == null) {
                    throw new IllegalArgumentException("Select a book first");
                }
                String raw = deadlineInput.getText().toString().trim();
                LocalDate override = raw.isEmpty() ? null : parseDate(raw);
                applyDeadlineOverride(section, selected, override, endDate);
                afterStateChange("Deadline override updated");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        }));

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
            section.books.set(selectedBookIndex, new Book(oldBook.number, fields.title, fields.startPage, fields.endPage, currentPage, sessions, oldBook.baselineSchedule, oldBook.deadlineOverride, oldBook.startDateOverride, oldBook.targetCompletedDate));
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
        Button complete = actionButton("Complete Selected", v -> {
            if (!hasSelectedBook(section)) {
                showError("Select a book first");
                return;
            }
            Book book = section.books.get(selectedBookIndex);
            if (completedUnits(book, section.label) >= totalUnits(book, section.label)) {
                showError("Book is already complete");
                return;
            }
            book.currentPage = book.endPage;
            afterStateChange("Book completed");
        });
        box.addView(buttons2);
        box.addView(complete);

        LinearLayout buttons3 = row();
        buttons3.addView(actionButton("Move Up", v -> moveSelectedBook(section, -1)));
        buttons3.addView(actionButton("Move Down", v -> moveSelectedBook(section, 1)));
        box.addView(buttons3);

        box.addView(sectionTitle("Simultaneous groups"));
        LinearLayout groupButtons = row();
        groupButtons.addView(actionButton("Select simultaneous books", v -> showSimultaneousBookPicker(section)));
        groupButtons.addView(secondaryButton("Clear groups", v -> {
            section.simultaneousGroups = new ArrayList<>();
            invalidateBaselineSchedules(section);
            afterStateChange("Groups cleared");
        }));
        box.addView(groupButtons);

        box.addView(sectionTitle("Today's reading"));
        PlanSummary summary = buildRemainingPlans();
        for (String sectionLabel : BOOK_SECTION_LABELS) {
            SectionPlan todayPlan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
            box.addView(sectionTitle(sectionLabel));
            if (todayPlan.deadlines.isEmpty()) {
                box.addView(label("No books in this format."));
                continue;
            }
            HorizontalScrollView todayTableScroll = new HorizontalScrollView(this);
            TableLayout todayTable = new TableLayout(this);
            addTableRow(todayTable, true, Arrays.asList("Name", "Pages/time today", "Start", "Deadline"), -1);
            for (BookDeadline deadline : todayPlan.deadlines) {
                addTableRow(todayTable, false, Arrays.asList(
                        deadline.book.title,
                        todayTargetValue(sectionLabel, deadline),
                        deadline.startDate.toString(),
                        deadline.deadline.toString()
                ), -1);
            }
            todayTableScroll.addView(todayTable);
            box.addView(todayTableScroll);
        }

        return scroll;
    }

    private View buildMetricsView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        LinearLayout header = row();
        header.addView(heading(metricDetail == null ? "Metrics" : metricDetail), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (metricDetail == null) {
            header.addView(secondaryButton("Back to charts", v -> {
                metricsSubview = false;
                showCurrentTab();
            }));
        } else {
            header.addView(secondaryButton("Back to metrics", v -> {
                metricDetail = null;
                showCurrentTab();
            }));
        }
        box.addView(header);
        TextView helper = label(metricDetail == null
                ? "Your current book schedules."
                : "Choose Back to metrics to return to the schedules.");
        helper.setTextColor(MOCHA);
        box.addView(helper);
        PlanSummary summary = buildRemainingPlans();
        if (metricDetail == null) {
            for (SectionPlan sectionPlan : summary.sectionPlans) {
                LinearLayout scheduleCard = surfaceCard();
                scheduleCard.addView(sectionTitle(sectionPlan.section.label));
                if (sectionPlan.deadlines.isEmpty()) {
                    scheduleCard.addView(label("No scheduled books."));
                } else {
                    scheduleCard.addView(bookScheduleTable(sectionPlan));
                }
                box.addView(scheduleCard);
            }
            box.addView(secondaryButton("Summary metrics", v -> openMetricDetail("Summary metrics")));
            box.addView(secondaryButton("Schedule information", v -> openMetricDetail("Schedule information")));
            box.addView(secondaryButton("Key metrics", v -> openMetricDetail("Key metrics")));
            return scroll;
        }

        SectionPlan audiobook = sectionPlanByLabel(summary.sectionPlans, AUDIOBOOKS_LABEL);
        TableLayout table = new TableLayout(this);
        addTableRow(table, true, Arrays.asList("Area", "Metric", "Value", "Details"), -1);
        if ("Key metrics".equals(metricDetail)) {
            addMetricRow(table, "Overview", "Remaining pages", String.valueOf(summary.totalPages), "Physical + digital");
            addMetricRow(table, "Overview", "Audiobook remaining time", formatDuration(audiobook.totalPages), "All audiobook titles");
            addMetricRow(table, "Plan", "Reading days", String.valueOf(availableReadingDaysCount(startDate, endDate)), "Rest days excluded");
            addMetricRow(table, "Plan", "Highest daily pace", format2(summary.highestDailyPace) + " pages/day", "Physical and digital");
            addMetricRow(table, "Plan", "Status", summary.overallStatus, "Current plan");
        } else if ("Summary metrics".equals(metricDetail)) {
            for (String[] metric : allOptionalSummaryRows(summary.sectionPlans, summary.highestDailyPace)) {
                addMetricRow(table, "Summary", metric[0], metric[1], "Optional metric");
            }
        } else if ("Schedule information".equals(metricDetail)) {
            addMetricRow(table, "Schedule", "Plan period", startDate + " to " + endDate, endLabel);
            for (SectionPlan sectionPlan : summary.sectionPlans) {
                String pace = sectionDailyPace(sectionPlan);
                String result = sectionPlan.deadlines.isEmpty()
                        ? "No books"
                        : finalResultMessage(
                                sectionPlan.deadlines.get(sectionPlan.deadlines.size() - 1).deadline,
                                endDate,
                                endName()
                );
                addMetricRow(table, sectionPlan.section.label, "Daily pace", pace, result);
            }
        }
        HorizontalScrollView tableScroll = new HorizontalScrollView(this);
        tableScroll.addView(table);
        box.addView(tableScroll);
        return scroll;
    }

    private void openMetricDetail(String detail) {
        metricDetail = detail;
        showCurrentTab();
    }

    private View buildChartsTab() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);
        LinearLayout header = row();
        header.addView(heading("Charts"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(secondaryButton("Metrics", v -> {
            metricsSubview = true;
            metricDetail = null;
            showCurrentTab();
        }));
        box.addView(header);

        List<ReadingPlanChartData> charts = chartData();
        if (charts.isEmpty()) {
            box.addView(label("Add a book to see its chart."));
            return scroll;
        }

        List<String> choices = new ArrayList<>();
        for (ReadingPlanChartData chart : charts) {
            choices.add(chart.sectionLabel + " - " + chart.book.number + ". " + chart.book.title);
        }
        box.addView(label("Book"));
        Spinner bookSpinner = spinner(choices, choices.get(0));
        box.addView(bookSpinner);

        ReadingPlanChartView chartView = new ReadingPlanChartView(this, charts.get(0));
        chartView.setProjectionVisible(showActualPaceProjection);
        CheckBox projectionToggle = checkBox(
                "Show projection based on actual reading pace",
                showActualPaceProjection
        );
        projectionToggle.setOnCheckedChangeListener((button, checked) -> {
            showActualPaceProjection = checked;
            chartView.setProjectionVisible(checked);
        });
        box.addView(projectionToggle);
        box.addView(chartView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(420)
        ));

        TextView chartDetails = label(chartDetails(charts.get(0)));
        chartDetails.setTextColor(MOCHA);
        box.addView(chartDetails);
        bookSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(() -> {
            int index = bookSpinner.getSelectedItemPosition();
            if (index >= 0 && index < charts.size()) {
                chartView.setChartData(charts.get(index));
                chartDetails.setText(chartDetails(charts.get(index)));
            }
        }));
        return scroll;
    }

    private List<ReadingPlanChartData> chartData() {
        PlanSummary summary = buildRemainingPlans();
        List<ReadingPlanChartData> charts = new ArrayList<>();
        for (String sectionLabel : BOOK_SECTION_LABELS) {
            SectionPlan plan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
            for (BookDeadline deadline : plan.deadlines) {
                if (totalUnits(deadline.book, sectionLabel) > 0) {
                    charts.add(new ReadingPlanChartData(this, sectionLabel, deadline.book, deadline));
                }
            }
        }
        return charts;
    }

    private String chartDetails(ReadingPlanChartData chart) {
        boolean audiobook = isAudiobookSection(chart.sectionLabel);
        String projection = chart.actualPace <= 0.0
                ? "no actual pace yet"
                : "actual pace " + (audiobook ? formatDuration(chart.actualPace) : format2(chart.actualPace))
                + (audiobook ? "/day" : " pages/day");
        return chart.startDate + " to " + chart.plannedDeadline
                + " | today " + (audiobook
                ? formatDuration(chart.dailyTargetPages.get(chart.todayIndex))
                : chart.dailyTargetPages.get(chart.todayIndex))
                + (audiobook ? "/day" : " pages/day")
                + " | " + projection;
    }

    private void addMetricRow(TableLayout table, String area, String metric, String value, String details) {
        tables.addMetricRow(table, area, metric, value, details);
    }

    private HorizontalScrollView bookScheduleTable(SectionPlan sectionPlan) {
        return tables.bookScheduleTable(sectionPlan);
    }

    private void showBookPicker(BookSection section) {
        if (section.books.isEmpty()) {
            showError("Add a book first");
            return;
        }
            String[] choices = Book.bookChoices(section).toArray(new String[0]);
        new AlertDialog.Builder(this)
                .setTitle("Choose a book to edit")
                .setSingleChoiceItems(choices, selectedBookIndex, (dialog, which) -> {
                    selectedBookIndex = which;
                    dialog.dismiss();
                    showCurrentTab();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showSimultaneousBookPicker(BookSection section) {
        if (section.books.size() < 2) {
            showError("Add at least two books first");
            return;
        }
        String[] choices = Book.bookChoices(section).toArray(new String[0]);
        boolean[] checked = new boolean[section.books.size()];
        int selectedGroup = -1;
        for (int groupIndex = 0; groupIndex < section.simultaneousGroups.size(); groupIndex++) {
            List<Integer> group = section.simultaneousGroups.get(groupIndex);
            if (hasSelectedBook(section) && group.contains(selectedBookIndex + 1)) {
                selectedGroup = groupIndex;
                for (Integer bookId : group) {
                    checked[bookId - 1] = true;
                }
                break;
            }
        }
        final int groupToReplace = selectedGroup;
        new AlertDialog.Builder(this)
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
            showError("Choose at least two books, or clear the selection");
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
            invalidateBaselineSchedules(section);
            afterStateChange("Groups updated");
        } catch (IllegalArgumentException ex) {
            showError(ex.getMessage());
        }
    }

    private HorizontalScrollView planTable(SectionPlan sectionPlan) {
        return tables.planTable(sectionPlan);
    }

    private TableRow addTableRow(TableLayout table, boolean header, List<String> values, int rowColor) {
        return tables.addTableRow(table, header, values, rowColor);
    }

    LinearLayout verticalBox() { return ui.verticalBox(); }
    LinearLayout row() { return ui.row(); }
    TextView heading(String text) { return ui.heading(text); }
    TextView sectionTitle(String text) { return ui.sectionTitle(text); }
    TextView label(String text) { return ui.label(text); }
    private TextView monoText(String text) { return ui.monoText(text); }
    private EditText editText(String value, int inputType) { return ui.editText(value, inputType); }
    private CheckBox checkBox(String label, boolean checked) { return ui.checkBox(label, checked); }
    private Spinner spinner(List<String> values, String selected) { return ui.spinner(values, selected); }
    private Spinner spinner(List<String> values, String selected, int backgroundColor, int selectedTextColor) { return ui.spinner(values, selected, backgroundColor, selectedTextColor); }

    private String fileLocationText() {
        return jsonUri == null ? "Not connected" : jsonUri.toString();
    }

    void updateJsonStatus() {
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

    void afterStateChange(String message) {
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
        if ("Charts".equals(currentTab) && metricsSubview) {
            if (metricDetail != null) {
                metricDetail = null;
                showCurrentTab();
                return;
            }
            metricsSubview = false;
            showCurrentTab();
            return;
        }
        if ("Settings".equals(currentTab)) {
            closeSettings();
            return;
        }
        super.onBackPressed();
    }

    private void confirmNewPlan() {
        showPlanDateFields = true;
        showCurrentTab();
        new AlertDialog.Builder(this)
                .setTitle("Reading Plan")
                .setMessage("Replace the current plan?")
                .setPositiveButton("Replace", (dialog, which) -> {
                    startDate = nextQuarterStart(LocalDate.now());
                    endDate = periodEndFromStart(startDate);
                    endLabel = "Quarter end";
                    restDays.clear();
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
            restDays.clear();
            restDays.addAll(plan.restDays);
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
        List<RestDayRange> loadedRestDays = restDayRangesFromJson(payload.optJSONArray("rest_days"));
        List<BookSection> loadedSections = new ArrayList<>();
        for (String label : BOOK_SECTION_LABELS) {
            loadedSections.add(byLabel.get(label));
        }
        if (payload.optInt("schema_version", 4) < 5) {
            restDays.clear();
            restDays.addAll(loadedRestDays);
            calculateBaselineSchedules(loadedSections, loadedStart, loadedEnd);
        }
        return new CsvPlan(
                loadedSections,
                loadedStart,
                loadedEnd,
                loadedEndLabel,
                statsOptionsFromJson(payload.optJSONObject("stats_options")),
                loadedRestDays
        );
    }

    private String jsonText() throws JSONException {
        initializeMissingBaselineSchedules();
        JSONObject payload = new JSONObject();
        payload.put("schema_version", 7);
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
        JSONArray jsonRestDays = new JSONArray();
        for (RestDayRange range : restDays) {
            JSONObject object = new JSONObject();
            object.put("start_date", range.startDate.toString());
            object.put("end_date", range.endDate.toString());
            jsonRestDays.put(object);
        }
        payload.put("rest_days", jsonRestDays);
        JSONArray jsonSections = new JSONArray();
        for (BookSection section : sections) {
            jsonSections.put(bookSectionToJson(section));
        }
        payload.put("sections", jsonSections);
        return payload.toString(2) + "\n";
    }

    private void initializeMissingBaselineSchedules() {
        boolean dirty = false;
        boolean missing = false;
        for (BookSection section : sections) {
            dirty = dirty || section.baselineNeedsRecalculation;
            for (Book book : section.books) {
                missing = missing || book.baselineSchedule == null;
            }
        }
        if (!dirty && missing) {
            calculateBaselineSchedules(sections, startDate, endDate);
        }
    }
    private JSONObject bookSectionToJson(BookSection section) throws JSONException {
        JSONObject object = new JSONObject();
        object.put("label", section.label);
        object.put("baseline_needs_recalculation", section.baselineNeedsRecalculation);
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
        object.put("deadline_override", book.deadlineOverride == null ? JSONObject.NULL : book.deadlineOverride.toString());
        object.put("start_date_override", book.startDateOverride == null ? JSONObject.NULL : book.startDateOverride.toString());
        object.put("target_completed_date", book.targetCompletedDate == null ? JSONObject.NULL : book.targetCompletedDate);
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
        section.baselineNeedsRecalculation = object.optBoolean("baseline_needs_recalculation", false);
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
        LocalDate deadlineOverride = null;
        if (object.has("deadline_override") && !object.isNull("deadline_override")) {
            deadlineOverride = parseDate(object.getString("deadline_override"));
        }
        LocalDate startDateOverride = null;
        if (object.has("start_date_override") && !object.isNull("start_date_override")) {
            startDateOverride = parseDate(object.getString("start_date_override"));
        }
        String targetCompletedDate = null;
        if (object.has("target_completed_date") && !object.isNull("target_completed_date")) {
            targetCompletedDate = parseDate(object.getString("target_completed_date")).toString();
        }
        return new Book(fallbackNumber, title, startPage, endPage, currentPage, sessions, baselineSchedule, deadlineOverride, startDateOverride, targetCompletedDate);
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

    private static List<RestDayRange> restDayRangesFromJson(JSONArray raw) throws JSONException {
        List<RestDayRange> ranges = new ArrayList<>();
        if (raw == null) {
            return ranges;
        }
        for (int index = 0; index < raw.length(); index++) {
            JSONObject object = raw.getJSONObject(index);
            LocalDate start = parseDate(object.getString("start_date"));
            LocalDate end = parseDate(object.getString("end_date"));
            if (end.isBefore(start)) {
                throw new IllegalArgumentException("rest-day end date must be on or after the start date");
            }
            ranges.add(new RestDayRange(start, end));
        }
        return ranges;
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
        return new CsvPlan(
                loadedSections,
                loadedStart,
                loadedEnd,
                loadedEndLabel,
                statsOptions,
                restDayRangesFromCsv(metadata.getOrDefault("Rest days", ""))
        );
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
        if (!restDays.isEmpty()) {
            StringBuilder rawRestDays = new StringBuilder();
            for (RestDayRange range : restDays) {
                if (rawRestDays.length() > 0) {
                    rawRestDays.append(';');
                }
                rawRestDays.append(range.startDate).append('/').append(range.endDate);
            }
            writeCsvRow(out, Arrays.asList("Rest days", rawRestDays.toString()));
        }
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

    private int targetUnitsForDate(Book book, String sectionLabel, BookDeadline deadline, LocalDate targetDate) {
        int total = totalUnits(book, sectionLabel);
        int completed = completedUnits(book, sectionLabel);
        if (unitsRemaining(book, sectionLabel) <= 0 || targetDate.isAfter(deadline.deadline)) {
            return total;
        }
        if (targetDate.isBefore(deadline.startDate) || deadline.dailyPages <= 0) {
            return completed;
        }

        LocalDate paceStart = deadline.startDate;
        if (book.currentPage != null && LocalDate.now().isAfter(paceStart)) {
            paceStart = LocalDate.now();
        }
        if (targetDate.isBefore(paceStart)) {
            return completed;
        }

        LocalDate activeDate = targetDate.isAfter(deadline.deadline) ? deadline.deadline : targetDate;
        int elapsedDays = availableReadingDaysCount(paceStart, activeDate);
        int scheduledUnits = (int) Math.ceil(deadline.dailyPages * elapsedDays - 1e-9);
        return Math.min(Math.max(completed + scheduledUnits, completed), total);
    }

    private String todayTargetValue(String sectionLabel, BookDeadline deadline) {
        LocalDate today = LocalDate.now();
        if (today.isBefore(deadline.startDate)
                || today.isAfter(deadline.deadline)
                || isRestDay(today)) {
            return isAudiobookSection(sectionLabel) ? formatDuration(0) : "0";
        }
        if (!isAudiobookSection(sectionLabel)) {
            LocalDate paceStart = deadline.startDate;
            if (deadline.book.currentPage != null && today.isAfter(paceStart)) {
                paceStart = today;
            }
            if (!today.isBefore(paceStart) && deadline.dailyPages > 0) {
                return String.valueOf(roundedUpPageTarget(deadline.dailyPages));
            }
        }
        int todayTarget = targetUnitsForDate(deadline.book, sectionLabel, deadline, today);
        int yesterdayTarget = targetUnitsForDate(deadline.book, sectionLabel, deadline, today.minusDays(1));
        int targetUnits = Math.max(todayTarget - yesterdayTarget, 0);
        return isAudiobookSection(sectionLabel) ? formatDuration(targetUnits) : String.valueOf(targetUnits);
    }

    private boolean isTargetCompleteToday(Book book) {
        return LocalDate.now().toString().equals(book.targetCompletedDate);
    }

    private boolean markTargetCompletedIfReached(
            Book book, String sectionLabel, String dateText, String inputText
    ) {
        try {
            LocalDate targetDate = parseDate(dateText);
            if (!targetDate.equals(LocalDate.now()) || inputText.isEmpty()) {
                return isTargetCompleteToday(book);
            }
            int currentPage = isAudiobookSection(sectionLabel)
                    ? currentTimeFromRemaining(book, parseDuration(inputText))
                    : Integer.parseInt(inputText);
            if (!targetReached(book, sectionLabel, targetDate, currentPage)) {
                return false;
            }
            if (!isTargetCompleteToday(book)) {
                book.targetCompletedDate = targetDate.toString();
                autosaveJson("Today's target completed");
            }
            return true;
        } catch (IllegalArgumentException ex) {
            return isTargetCompleteToday(book);
        }
    }

    private boolean targetReached(Book book, String sectionLabel, LocalDate targetDate, int currentPage) {
        if (!targetDate.equals(LocalDate.now())) {
            return false;
        }
        PlanSummary summary = buildRemainingPlans();
        BookDeadline deadline = deadlineForBook(
                sectionPlanByLabel(summary.sectionPlans, sectionLabel), book
        );
        if (deadline == null) {
            return false;
        }
        int completed = completedUnits(book, sectionLabel);
        int target = targetUnitsForDate(book, sectionLabel, deadline, targetDate);
        int currentUnits = isAudiobookSection(sectionLabel)
                ? currentPage - book.startPage
                : currentPage - book.startPage + 1;
        return target > completed && currentUnits >= target;
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
        return isAudiobookSection(sectionLabel) ? formatDuration(dailyPages) : String.valueOf(roundedUpPageTarget(dailyPages));
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
                    : availableReadingDaysCount(planStart, planEnd) == 0
                    ? 0.0
                    : (double) sectionUnits / availableReadingDaysCount(planStart, planEnd);
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
            applyPersistedDeadlineOverrides(section, planEnd);
            section.baselineNeedsRecalculation = false;
        }
    }

    private void recalculateBaselineSchedules(
            List<BookSection> planSections, LocalDate planStart, LocalDate planEnd
    ) {
        for (BookSection section : planSections) {
            int sectionUnits = 0;
            for (Book book : section.books) {
                sectionUnits += unitsRemaining(book, section.label);
            }
            double dailyPace = section.books.isEmpty()
                    ? 0.0
                    : availableReadingDaysCount(planStart, planEnd) == 0
                    ? 0.0
                    : (double) sectionUnits / availableReadingDaysCount(planStart, planEnd);
            SectionPlan plan = buildPlan(
                    section,
                    planStart,
                    planEnd,
                    dailyPace,
                    book -> unitsRemaining(book, section.label)
            );
            for (BookDeadline deadline : plan.deadlines) {
                deadline.book.baselineSchedule = new BaselineSchedule(
                        deadline.startDate, deadline.deadline, deadline.dailyPages
                );
            }
            applyPersistedDeadlineOverrides(section, planEnd);
            section.baselineNeedsRecalculation = false;
        }
    }
    private void applyDeadlineOverride(BookSection section, Book book, LocalDate override, LocalDate planEnd) {
        if (book.baselineSchedule == null) {
            throw new IllegalArgumentException("calculate the plan before setting a deadline override");
        }
        if (override != null) {
            if (override.isBefore(LocalDate.now())) {
                throw new IllegalArgumentException("deadline override cannot be before today");
            }
            if (override.isAfter(planEnd)) {
                throw new IllegalArgumentException("deadline override cannot be after the plan finish date");
            }
        }
        List<Integer> containingGroup = null;
        for (List<Integer> group : section.simultaneousGroups) {
            if (group.contains(book.number)) {
                containingGroup = group;
                break;
            }
        }
        book.deadlineOverride = override;
        LocalDate deadline = override == null ? planEnd : override;
        if (override == null && containingGroup != null) {
            for (Integer bookId : containingGroup) {
                Book other = section.books.get(bookId - 1);
                if (bookId != book.number && other.baselineSchedule != null) {
                    deadline = other.baselineSchedule.deadline;
                    break;
                }
            }
        }
        LocalDate start = book.baselineSchedule.startDate;
        int remaining = unitsRemaining(book, section.label);
        LocalDate paceStart = effectiveRemainingStartDate(start, deadline, LocalDate.now());
        int availableDays = availableReadingDaysCount(paceStart, deadline);
        double dailyTarget = remaining == 0 || availableDays == 0 ? 0.0 : (double) remaining / availableDays;
        book.baselineSchedule = new BaselineSchedule(start, deadline, dailyTarget);

        if (containingGroup != null) {
            List<Integer> activeGroup = new ArrayList<>();
            for (Integer bookId : containingGroup) {
                if (section.books.get(bookId - 1).deadlineOverride == null && section.books.get(bookId - 1).startDateOverride == null) {
                    activeGroup.add(bookId);
                }
            }
            if (activeGroup.size() >= 2) {
                BaselineSchedule reference = section.books.get(activeGroup.get(0) - 1).baselineSchedule;
                int groupRemaining = 0;
                for (Integer bookId : activeGroup) {
                    groupRemaining += unitsRemaining(section.books.get(bookId - 1), section.label);
                }
                LocalDate groupStart = effectiveRemainingStartDate(reference.startDate, reference.deadline, LocalDate.now());
                int groupDays = availableReadingDaysCount(groupStart, reference.deadline);
                double groupPace = groupRemaining == 0 || groupDays == 0 ? 0.0 : (double) groupRemaining / groupDays;
                for (Integer bookId : activeGroup) {
                    Book groupBook = section.books.get(bookId - 1);
                    int bookRemaining = unitsRemaining(groupBook, section.label);
                    double bookTarget = groupRemaining == 0 || bookRemaining == 0
                            ? 0.0
                            : groupPace * bookRemaining / groupRemaining;
                    groupBook.baselineSchedule = new BaselineSchedule(
                            reference.startDate, reference.deadline, bookTarget
                    );
                }
            }
        }
        section.baselineNeedsRecalculation = false;
    }

    private void applyStartDateOverride(BookSection section, Book book, LocalDate override, LocalDate planStart) {
        if (book.baselineSchedule == null) {
            throw new IllegalArgumentException("calculate the plan before setting a start date override");
        }
        LocalDate deadline = book.baselineSchedule.deadline;
        if (override != null && override.isAfter(deadline)) {
            throw new IllegalArgumentException("start date override cannot be after the deadline");
        }
        book.startDateOverride = override;
        LocalDate start = override == null
                ? (planStart == null ? book.baselineSchedule.startDate : planStart)
                : override;
        int remaining = unitsRemaining(book, section.label);
        LocalDate paceStart = effectiveRemainingStartDate(start, deadline, LocalDate.now());
        int availableDays = availableReadingDaysCount(paceStart, deadline);
        double dailyTarget = remaining == 0 || availableDays == 0 ? 0.0 : (double) remaining / availableDays;
        book.baselineSchedule = new BaselineSchedule(start, deadline, dailyTarget);
        section.baselineNeedsRecalculation = false;
    }

    private void applyPersistedDeadlineOverrides(BookSection section, LocalDate planEnd) {
        for (Book book : section.books) {
            if (book.deadlineOverride != null) {
                applyDeadlineOverride(section, book, book.deadlineOverride, planEnd);
            }
        }
        for (Book book : section.books) {
            if (book.startDateOverride != null) {
                applyStartDateOverride(section, book, book.startDateOverride, null);
            }
        }
    }
    private void invalidateBaselineSchedules(BookSection section) {
        section.baselineNeedsRecalculation = true;
    }

    private void invalidateAllBaselineSchedules() {
        for (BookSection section : sections) {
            section.baselineNeedsRecalculation = true;
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
        int periodDays = availableReadingDaysCount(remainingStart, end);
        int remainingPages = 0;
        for (Book book : section.books) {
            remainingPages += unitsRemaining(book, section.label);
        }
        double dailyPace = remainingPages == 0 || periodDays == 0 ? 0.0 : (double) remainingPages / periodDays;
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
        if (plan.section.baselineNeedsRecalculation) {
            return plan;
        }
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

            // Compute fresh daily pages from remaining work and remaining reading days
            LocalDate paceStart = effectiveRemainingStartDate(baseline.startDate, baseline.deadline, today);
            int availableDays = availableReadingDaysCount(paceStart, baseline.deadline);
            int remaining = unitsRemaining(deadline.book, plan.section.label);
            double dailyPages = remaining == 0 || availableDays == 0 ? 0.0 : (double) remaining / availableDays;

            deadlines.add(new BookDeadline(
                    deadline.book,
                    deadline.cumulativePages,
                    baseline.startDate,
                    baseline.deadline,
                    availableReadingDaysCount(baseline.startDate, baseline.deadline),
                    dailyPages,
                    status
            ));
        }
        return new SectionPlan(
                plan.section,
                deadlines,
                plan.dailyPace,
                plan.totalPages,
                plan.requiredPace,
                plan.overallStatus
        );
    }

    private List<List<Integer>> activeSimultaneousGroups(BookSection section) {
        List<List<Integer>> activeGroups = new ArrayList<>();
        for (List<Integer> group : section.simultaneousGroups) {
            List<Integer> active = new ArrayList<>();
            for (Integer bookId : group) {
                if (section.books.get(bookId - 1).deadlineOverride == null && section.books.get(bookId - 1).startDateOverride == null) {
                    active.add(bookId);
                }
            }
            if (active.size() >= 2) {
                activeGroups.add(active);
            }
        }
        return activeGroups;
    }
    private SectionPlan buildPlan(BookSection section, LocalDate start, LocalDate end, double dailyPace, PageCounter counter) {
        int totalPages = 0;
        for (Book book : section.books) {
            totalPages += counter.pages(book);
        }
        int periodDays = availableReadingDaysCount(start, end);
        double requiredPace = periodDays == 0 ? 0.0 : (double) totalPages / periodDays;
        List<BookDeadline> deadlines = calculateDeadlines(section.books, start, end, dailyPace, activeSimultaneousGroups(section), counter);
        String overallStatus = totalPages == 0
                || (periodDays > 0
                && (deadlines.isEmpty() || !deadlines.get(deadlines.size() - 1).deadline.isAfter(end)))
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
        List<List<Integer>> groups = validateSimultaneousGroups(books, simultaneousGroups, false);
        Map<Integer, List<Integer>> groupByFirst = new HashMap<>();
        Set<Integer> groupedIds = new HashSet<>();
        for (List<Integer> group : groups) {
            groupByFirst.put(group.get(0), group);
            groupedIds.addAll(group);
        }

        Map<Integer, Book> booksByNumber = new HashMap<>();
        for (Book book : books) {
            booksByNumber.put(book.number, book);
        }
        List<BookDeadline> deadlines = new ArrayList<>();
        List<LocalDate> readingDates = availableReadingDays(start, end);
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
            List<Book> groupBooks = new ArrayList<>();
            for (Integer groupId : groupIds) {
                groupBooks.add(booksByNumber.get(groupId));
            }
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
            LocalDate deadline;
            LocalDate groupStart;
            if (readingDates.isEmpty()) {
                deadline = end;
                groupStart = end;
            } else {
                deadline = readingDates.get(Math.max(0, Math.min(cumulativeDays, readingDates.size()) - 1));
                groupStart = daysAllocated == 0 ? deadline : readingDates.get(previousCumulativeDays);
            }
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
            bookIndex++;
        }
        return deadlines;
    }

    private List<String[]> allOptionalSummaryRows(List<SectionPlan> sectionPlans, double highestDailyPace) {
        return optionalSummaryRows(sectionPlans, highestDailyPace, new StatsOptions(true, true, true, true, true));
    }

    private List<String[]> optionalSummaryRows(List<SectionPlan> sectionPlans, double highestDailyPace) {
        return optionalSummaryRows(sectionPlans, highestDailyPace, statsOptions);
    }

    private List<String[]> optionalSummaryRows(List<SectionPlan> sectionPlans, double highestDailyPace, StatsOptions options) {
        SectionPlan physical = sectionPlanByLabel(sectionPlans, PHYSICAL_BOOKS_LABEL);
        SectionPlan digital = sectionPlanByLabel(sectionPlans, DIGITAL_BOOKS_LABEL);
        SectionPlan audiobook = sectionPlanByLabel(sectionPlans, AUDIOBOOKS_LABEL);
        List<String[]> rows = new ArrayList<>();
        if (options.bookCounts) {
            rows.add(new String[]{"Physical book count", String.valueOf(physical.section.books.size())});
            rows.add(new String[]{"Digital book count", String.valueOf(digital.section.books.size())});
            rows.add(new String[]{"Audiobook count", String.valueOf(audiobook.section.books.size())});
        }
        if (options.pageShare) {
            int totalPages = physical.totalPages + digital.totalPages;
            double physicalShare = totalPages == 0 ? 0.0 : (double) physical.totalPages / totalPages * 100.0;
            double digitalShare = totalPages == 0 ? 0.0 : (double) digital.totalPages / totalPages * 100.0;
            rows.add(new String[]{"Physical page share", format1(physicalShare) + "%"});
            rows.add(new String[]{"Digital page share", format1(digitalShare) + "%"});
        }
        if (options.averagePages) {
            rows.add(new String[]{"Physical average pages/book", format1(averagePages(physical))});
            rows.add(new String[]{"Digital average pages/book", format1(averagePages(digital))});
            rows.add(new String[]{"Audiobook average duration", formatDuration(averagePages(audiobook))});
        }
        if (options.readingPeriod) {
            rows.add(new String[]{"Reading period", availableReadingDaysCount(startDate, endDate) + " days"});
        }
        if (options.paceDriver) {
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

    void removeReadingSession(Book book, int index) {
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

    boolean isRestDay(LocalDate value) {
        for (RestDayRange range : restDays) {
            if (!value.isBefore(range.startDate) && !value.isAfter(range.endDate)) {
                return true;
            }
        }
        return false;
    }

    List<LocalDate> availableReadingDays(LocalDate start, LocalDate end) {
        List<LocalDate> dates = new ArrayList<>();
        for (LocalDate current = start; !current.isAfter(end); current = current.plusDays(1)) {
            if (!isRestDay(current)) {
                dates.add(current);
            }
        }
        return dates;
    }

    int availableReadingDaysCount(LocalDate start, LocalDate end) {
        return availableReadingDays(start, end).size();
    }

    private void normalizeRestDayRanges() {
        restDays.sort((left, right) -> left.startDate.compareTo(right.startDate));
        List<RestDayRange> merged = new ArrayList<>();
        for (RestDayRange range : restDays) {
            if (merged.isEmpty()
                    || range.startDate.isAfter(merged.get(merged.size() - 1).endDate.plusDays(1))) {
                merged.add(range);
            } else {
                RestDayRange previous = merged.remove(merged.size() - 1);
                merged.add(new RestDayRange(
                        previous.startDate,
                        previous.endDate.isAfter(range.endDate) ? previous.endDate : range.endDate
                ));
            }
        }
        restDays.clear();
        restDays.addAll(merged);
    }

    private void renderRestDayRanges(LinearLayout container) {
        container.removeAllViews();
        for (int index = 0; index < restDays.size(); index++) {
            final int rangeIndex = index;
            RestDayRange range = restDays.get(index);
            LinearLayout row = row();
            row.addView(label(range.startDate + " ? " + range.endDate),
                    new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            row.addView(secondaryButton("Remove", v -> {
                restDays.remove(rangeIndex);
                afterStateChange("Rest-day range removed");
            }));
            container.addView(row);
        }
    }

    private static int inclusiveDaysBetween(LocalDate start, LocalDate end) {
        return (int) ChronoUnit.DAYS.between(start, end) + 1;
    }

    private LocalDate effectiveRemainingStartDate(LocalDate start, LocalDate end, LocalDate today) {
        LocalDate candidate;
        if (today.isBefore(start)) {
            candidate = start;
        } else if (today.isAfter(end)) {
            candidate = end;
        } else {
            candidate = today;
        }
        for (LocalDate readingDay : availableReadingDays(candidate, end)) {
            return readingDay;
        }
        return end;
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

    static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }

    int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private static String format1(double value) {
        return String.format(Locale.US, "%.1f", value);
    }

    static String format2(double value) {
        return String.format(Locale.US, "%.2f", value);
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

}
