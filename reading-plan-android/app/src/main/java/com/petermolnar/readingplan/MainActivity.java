package com.petermolnar.readingplan;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
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
    private static final List<String> BOOK_SECTION_LABELS = Arrays.asList(
            PHYSICAL_BOOKS_LABEL,
            DIGITAL_BOOKS_LABEL
    );
    private static final int PURPLE = 0xff6d28d9;
    private static final int PURPLE_DARK = 0xff4c1d95;
    private static final int LIGHT_GRAY = 0xfff3f4f6;
    private static final int TEXT = 0xff111827;

    private LinearLayout root;
    private LinearLayout tabBar;
    private FrameLayout content;
    private TextView statusView;
    private TextView fileView;

    private final List<BookSection> sections = blankSections();
    private StatsOptions statsOptions = new StatsOptions(true, true, true, true, true);
    private LocalDate startDate;
    private LocalDate endDate;
    private String endLabel = "Quarter end";
    private Uri jsonUri;
    private String currentTab = "Session";
    private String selectedBookSection = PHYSICAL_BOOKS_LABEL;
    private int selectedBookIndex = -1;
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
        root.setBackgroundColor(0xffffffff);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(12), dp(10), dp(12), dp(8));
        root.addView(header, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView title = new TextView(this);
        title.setText("Reading Plan");
        title.setTextColor(TEXT);
        title.setTextSize(22);
        title.setTypeface(null, 1);
        header.addView(title);

        fileView = new TextView(this);
        fileView.setTextColor(0xff374151);
        fileView.setPadding(0, dp(4), 0, dp(8));
        header.addView(fileView);

        HorizontalScrollView actionScroll = new HorizontalScrollView(this);
        actionScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actionScroll.addView(actions);
        header.addView(actionScroll);

        actions.addView(actionButton("Connect synced reading_plan.json", v -> openJsonPicker()));
        actions.addView(actionButton("Reload from synced file", v -> reloadFromJson()));
        actions.addView(actionButton("Import CSV", v -> openCsvPicker()));
        actions.addView(actionButton("Export CSV", v -> createCsv()));
        actions.addView(actionButton("New", v -> confirmNewPlan()));

        tabBar = new LinearLayout(this);
        tabBar.setOrientation(LinearLayout.HORIZONTAL);
        tabBar.setPadding(dp(8), 0, dp(8), dp(6));
        root.addView(tabBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
        ));

        statusView = new TextView(this);
        statusView.setTextColor(0xff166534);
        statusView.setPadding(dp(10), dp(6), dp(10), dp(6));
        root.addView(statusView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        setContentView(root);
    }

    private Button actionButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        button.setMinHeight(dp(40));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, dp(8), 0);
        button.setLayoutParams(params);
        return button;
    }

    private void renderTabBar() {
        tabBar.removeAllViews();
        for (String tab : Arrays.asList("Session", "Plan", "Books", "Summary")) {
            Button button = new Button(this);
            button.setText(tab);
            button.setAllCaps(false);
            button.setTextColor(tab.equals(currentTab) ? 0xffffffff : TEXT);
            button.setBackgroundColor(tab.equals(currentTab) ? PURPLE : LIGHT_GRAY);
            button.setOnClickListener(v -> {
                currentTab = tab;
                showCurrentTab();
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    0,
                    dp(42),
                    1
            );
            params.setMargins(dp(2), 0, dp(2), 0);
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
        } else {
            content.addView(buildSummaryView());
        }
    }

    private View buildSessionView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        TextView heading = heading("Reading session");
        box.addView(heading);

        Spinner sectionSpinner = spinner(BOOK_SECTION_LABELS, selectedBookSection);
        box.addView(label("Format"));
        box.addView(sectionSpinner);

        List<String> bookChoices = bookChoices(sectionByLabel(selectedBookSection));
        Spinner bookSpinner = spinner(bookChoices, "");
        box.addView(label("Book"));
        box.addView(bookSpinner);

        sectionSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(() -> {
            selectedBookSection = String.valueOf(sectionSpinner.getSelectedItem());
            showCurrentTab();
        }));

        EditText dateInput = editText(LocalDate.now().toString(), InputType.TYPE_CLASS_TEXT);
        EditText pageInput = editText("", InputType.TYPE_CLASS_NUMBER);
        box.addView(label("Date"));
        box.addView(dateInput);
        box.addView(label("Current page"));
        box.addView(pageInput);

        TextView remaining = label("");
        box.addView(remaining);
        Runnable updateRemaining = () -> {
            Book book = selectedBookFromSpinner(selectedBookSection, bookSpinner);
            if (book == null) {
                remaining.setText("Select a book first.");
            } else {
                remaining.setText("Remaining pages: " + pagesRemaining(book));
            }
        };
        bookSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(updateRemaining));
        updateRemaining.run();

        Button add = actionButton("Add Session", v -> {
            Book book = selectedBookFromSpinner(selectedBookSection, bookSpinner);
            if (book == null) {
                showError("Select a book first");
                return;
            }
            try {
                LocalDate sessionDate = parseDate(dateInput.getText().toString().trim());
                int currentPage = Integer.parseInt(pageInput.getText().toString().trim());
                addReadingSession(book, sessionDate, currentPage);
                selectedBookIndex = book.number - 1;
                afterStateChange("Session added");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        });
        box.addView(add);

        box.addView(sectionTitle("Sessions"));
        boolean hasSessions = false;
        for (int sectionIndex = 0; sectionIndex < sections.size(); sectionIndex++) {
            BookSection section = sections.get(sectionIndex);
            for (int bookIndex = 0; bookIndex < section.books.size(); bookIndex++) {
                Book book = section.books.get(bookIndex);
                for (int sessionIndex = 0; sessionIndex < book.readingSessions.size(); sessionIndex++) {
                    hasSessions = true;
                    ReadingSession session = book.readingSessions.get(sessionIndex);
                    LinearLayout row = row();
                    TextView text = label(session.date + " | " + section.label + " | "
                            + book.number + ". " + book.title + " | page "
                            + session.currentPage + " | +" + session.pagesRead);
                    row.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
                    int finalSectionIndex = sectionIndex;
                    int finalBookIndex = bookIndex;
                    int finalSessionIndex = sessionIndex;
                    Button delete = actionButton("Delete", v -> {
                        try {
                            removeReadingSession(
                                    sections.get(finalSectionIndex).books.get(finalBookIndex),
                                    finalSessionIndex
                            );
                            afterStateChange("Session deleted");
                        } catch (IllegalArgumentException ex) {
                            showError(ex.getMessage());
                        }
                    });
                    row.addView(delete);
                    box.addView(row);
                }
            }
        }
        if (!hasSessions) {
            box.addView(label("No sessions yet."));
        }
        return scroll;
    }

    private View buildPlanView() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = verticalBox();
        scroll.addView(box);

        box.addView(heading("Plan"));
        EditText startInput = editText(startDate.toString(), InputType.TYPE_CLASS_TEXT);
        CheckBox customTarget = new CheckBox(this);
        customTarget.setText("Custom finish date");
        customTarget.setChecked("Target finish date".equals(endLabel));
        EditText endInput = editText(endDate.toString(), InputType.TYPE_CLASS_TEXT);

        box.addView(label("Start date"));
        box.addView(startInput);
        box.addView(customTarget);
        box.addView(label("Finish date"));
        box.addView(endInput);

        box.addView(sectionTitle("Optional summary stats"));
        CheckBox bookCounts = checkBox("Book counts", statsOptions.bookCounts);
        CheckBox pageShare = checkBox("Page share", statsOptions.pageShare);
        CheckBox averagePages = checkBox("Average pages", statsOptions.averagePages);
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
        EditText titleInput = editText(selected == null ? "" : selected.title, InputType.TYPE_CLASS_TEXT);
        EditText startPageInput = editText(selected == null ? "1" : String.valueOf(selected.startPage), InputType.TYPE_CLASS_NUMBER);
        EditText endPageInput = editText(selected == null ? "" : String.valueOf(selected.endPage), InputType.TYPE_CLASS_NUMBER);

        box.addView(label("Title"));
        box.addView(titleInput);
        box.addView(label("Start page"));
        box.addView(startPageInput);
        box.addView(label("End page"));
        box.addView(endPageInput);

        LinearLayout buttons1 = row();
        buttons1.addView(actionButton("Add", v -> {
            BookFields fields = readBookFields(titleInput, startPageInput, endPageInput, "Book " + (section.books.size() + 1), 1, null);
            if (fields == null) {
                return;
            }
            section.books.add(new Book(section.books.size() + 1, fields.title, fields.startPage, fields.endPage));
            renumberBooks(section.books);
            selectedBookIndex = section.books.size() - 1;
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
            BookFields fields = readBookFields(titleInput, startPageInput, endPageInput, "Book " + position, 1, null);
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
            BookFields fields = readBookFields(titleInput, startPageInput, endPageInput, oldBook.title, oldBook.startPage, oldBook.endPage);
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
                afterStateChange("Groups updated");
            } catch (IllegalArgumentException ex) {
                showError(ex.getMessage());
            }
        }));
        groupButtons.addView(actionButton("Clear", v -> {
            section.simultaneousGroups = new ArrayList<>();
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
        box.addView(monoText(summaryText(summary, true)));

        for (SectionPlan sectionPlan : summary.sectionPlans) {
            box.addView(sectionTitle(sectionPlan.section.label));
            if (sectionPlan.deadlines.isEmpty()) {
                box.addView(label("No books."));
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
        addTableRow(table, true, Arrays.asList("Book", "Title", "Start page", "End page", "Current page", "Pages", "Read", "Remaining"), -1);
        for (int i = 0; i < section.books.size(); i++) {
            Book book = section.books.get(i);
            List<String> row = Arrays.asList(
                    String.valueOf(book.number),
                    book.title,
                    String.valueOf(book.startPage),
                    String.valueOf(book.endPage),
                    book.currentPage == null ? "" : String.valueOf(book.currentPage),
                    String.valueOf(book.pages()),
                    String.valueOf(book.pagesRead()),
                    String.valueOf(pagesRemaining(book))
            );
            int index = i;
            TableRow tableRow = addTableRow(table, false, row, i == selectedBookIndex ? PURPLE : -1);
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
        List<String> headers = Arrays.asList(
                "Book", "Title", "Daily pages", "Start page", "End page", "Current page",
                "Pages", "Read", "Remaining", "Cumulative remaining", "Start date",
                "Deadline", "Days allocated", "Status"
        );
        addTableRow(table, true, headers, -1);
        for (BookDeadline deadline : sectionPlan.deadlines) {
            Book book = deadline.book;
            addTableRow(table, false, Arrays.asList(
                    String.valueOf(book.number),
                    book.title,
                    format2(deadline.dailyPages),
                    String.valueOf(book.startPage),
                    String.valueOf(book.endPage),
                    book.currentPage == null ? "" : String.valueOf(book.currentPage),
                    String.valueOf(book.pages()),
                    String.valueOf(book.pagesRead()),
                    String.valueOf(pagesRemaining(book)),
                    String.valueOf(deadline.cumulativePages),
                    deadline.startDate.toString(),
                    deadline.deadline.toString(),
                    String.valueOf(deadline.daysAllocated),
                    deadline.status
            ), -1);
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
            cell.setTextColor(rowColor == PURPLE ? 0xffffffff : TEXT);
            cell.setPadding(dp(8), dp(6), dp(8), dp(6));
            cell.setGravity(Gravity.CENTER_VERTICAL);
            cell.setSingleLine(false);
            cell.setMinWidth(dp(90));
            if (header) {
                cell.setTypeface(null, 1);
                cell.setBackgroundColor(LIGHT_GRAY);
            } else if (rowColor != -1) {
                cell.setBackgroundColor(rowColor);
            } else {
                cell.setBackgroundColor(0xffffffff);
            }
            row.addView(cell);
        }
        return row;
    }

    private LinearLayout verticalBox() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(12), dp(8), dp(12), dp(16));
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
        view.setTextSize(20);
        view.setTypeface(null, 1);
        view.setPadding(0, dp(4), 0, dp(10));
        return view;
    }

    private TextView sectionTitle(String text) {
        TextView view = label(text);
        view.setTextSize(16);
        view.setTypeface(null, 1);
        view.setPadding(0, dp(14), 0, dp(6));
        return view;
    }

    private TextView label(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(TEXT);
        view.setTextSize(14);
        view.setPadding(0, dp(4), 0, dp(4));
        return view;
    }

    private TextView monoText(String text) {
        TextView view = label(text);
        view.setTextSize(13);
        view.setTypeface(android.graphics.Typeface.MONOSPACE);
        view.setPadding(dp(8), dp(8), dp(8), dp(8));
        view.setBackgroundColor(0xfff9fafb);
        return view;
    }

    private EditText editText(String value, int inputType) {
        EditText edit = new EditText(this);
        edit.setText(value);
        edit.setSingleLine(true);
        edit.setInputType(inputType);
        edit.setSelectAllOnFocus(false);
        return edit;
    }

    private CheckBox checkBox(String label, boolean checked) {
        CheckBox box = new CheckBox(this);
        box.setText(label);
        box.setChecked(checked);
        return box;
    }

    private Spinner spinner(List<String> values, String selected) {
        Spinner spinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_spinner_item,
                values
        );
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        int index = values.indexOf(selected);
        if (index >= 0) {
            spinner.setSelection(index);
        }
        return spinner;
    }

    private void refreshHeader() {
        fileView.setText(jsonUri == null
                ? "JSON file: not connected"
                : "JSON file: " + jsonUri);
        if (statusView.getText().length() == 0) {
            setStatus(jsonUri == null ? "Connect the Syncthing reading_plan.json file." : "Ready", false);
        }
    }

    private void afterStateChange(String message) {
        autosaveJson(message);
        showCurrentTab();
    }

    private void setStatus(String message, boolean error) {
        statusView.setText(message);
        statusView.setTextColor(error ? 0xff991b1b : 0xff166534);
    }

    private void showError(String message) {
        setStatus(message, true);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
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
            setStatus("Connect the Syncthing reading_plan.json file.", false);
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
            showError("Connect a JSON file first");
            return;
        }
        try {
            CsvPlan plan = loadJson(readText(jsonUri));
            applyPlan(plan);
            setStatus("Loaded synced JSON file", false);
            showCurrentTab();
        } catch (IOException | JSONException | IllegalArgumentException ex) {
            showError("Could not load JSON: " + ex.getMessage());
        }
    }

    private void autosaveJson(String successMessage) {
        if (restoring) {
            return;
        }
        if (jsonUri == null) {
            setStatus("Connect the Syncthing reading_plan.json file to save changes.", true);
            return;
        }
        try {
            writeText(jsonUri, jsonText());
            setStatus(successMessage + " to synced JSON", false);
        } catch (IOException | JSONException ex) {
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
        return new CsvPlan(
                loadedSections,
                loadedStart,
                loadedEnd,
                loadedEndLabel,
                statsOptionsFromJson(payload.optJSONObject("stats_options"))
        );
    }

    private String jsonText() throws JSONException {
        JSONObject payload = new JSONObject();
        payload.put("schema_version", 3);
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
            books.put(bookToJson(book));
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

    private JSONObject bookToJson(Book book) throws JSONException {
        JSONObject object = new JSONObject();
        object.put("number", book.number);
        object.put("title", book.title);
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
        String label = object.optString("label", defaultLabel).trim();
        if (label.isEmpty()) {
            label = defaultLabel;
        }
        BookSection section = new BookSection(label);
        JSONArray rawBooks = object.optJSONArray("books");
        if (rawBooks != null) {
            for (int i = 0; i < rawBooks.length(); i++) {
                section.books.add(bookFromJson(rawBooks.getJSONObject(i), i + 1));
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

    private Book bookFromJson(JSONObject object, int fallbackNumber) throws JSONException {
        String title = object.optString("title", "").trim();
        if (title.isEmpty()) {
            throw new IllegalArgumentException("each book needs a title");
        }
        int startPage;
        int endPage;
        if (object.has("start_page") && object.has("end_page")) {
            startPage = object.getInt("start_page");
            endPage = object.getInt("end_page");
        } else {
            int pages = object.optInt("pages", 0);
            startPage = 1;
            endPage = pages;
        }
        validatePageRange(startPage, endPage);

        Integer currentPage = null;
        if (object.has("current_page") && !object.isNull("current_page")) {
            currentPage = object.getInt("current_page");
        }
        int pagesRead = object.optInt("pages_read", 0);
        if (pagesRead < 0) {
            throw new IllegalArgumentException("pages read cannot be negative");
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
                if (rawSession.has("current_page")) {
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
                    throw new IllegalArgumentException("reading session pages must be positive");
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
            currentPage = startPage + pagesRead - 1;
        }
        if (currentPage != null) {
            currentPage = clamp(currentPage, startPage, endPage);
        }
        return new Book(fallbackNumber, title, startPage, endPage, currentPage, sessions);
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
                    || startsWith(row, "Book", "Title", "Start page")) {
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
                ParseTableResult result = parseCsvBookTable(rows, index, true);
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
                        || startsWith(rows.get(i), "Book", "Title", "Start page")) {
                    headerIndex = i;
                    break;
                }
            }
            if (headerIndex < 0) {
                throw new IllegalArgumentException("missing book table header");
            }
            ParseTableResult result = parseCsvBookTable(rows, headerIndex, false);
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

    private ParseTableResult parseCsvBookTable(List<List<String>> rows, int headerIndex, boolean stopAtBlank) {
        List<String> headers = rows.get(headerIndex);
        Map<String, Integer> headerIndexes = new HashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            headerIndexes.put(headers.get(i), i);
        }
        Integer startPageIndex = headerIndexes.get("Start page");
        Integer endPageIndex = headerIndexes.get("End page");
        Integer currentPageIndex = headerIndexes.get("Current page");
        Integer pagesIndex = headerIndexes.containsKey("Pages") ? headerIndexes.get("Pages") : 2;
        Integer pagesReadIndex = headerIndexes.containsKey("Read pages")
                ? headerIndexes.get("Read pages")
                : headerIndexes.get("Pages read");
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
            if (startPageIndex != null && endPageIndex != null) {
                startPage = intCell(row, startPageIndex);
                endPage = intCell(row, endPageIndex);
            } else {
                int pages = intCell(row, pagesIndex);
                startPage = 1;
                endPage = pages;
            }
            int pagesRead = pagesReadIndex == null ? 0 : intCell(row, pagesReadIndex);
            Integer currentPage = null;
            if (currentPageIndex != null && currentPageIndex < row.size() && !row.get(currentPageIndex).trim().isEmpty()) {
                currentPage = Integer.parseInt(row.get(currentPageIndex).trim());
            }
            String title = row.get(1).trim();
            validatePageRange(startPage, endPage);
            if (pagesRead < 0 || title.isEmpty()) {
                throw new IllegalArgumentException("each book needs a title and valid page range");
            }
            if (currentPage == null && pagesRead > 0) {
                currentPage = startPage + pagesRead - 1;
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
        writeCsvRow(out, Arrays.asList("Total remaining pages", String.valueOf(summary.totalPages)));
        writeCsvRow(out, Arrays.asList("Physical remaining pages", String.valueOf(physical.totalPages)));
        writeCsvRow(out, Arrays.asList("Digital remaining pages", String.valueOf(digital.totalPages)));
        writeCsvRow(out, Arrays.asList("Highest daily pace", format15(summary.highestDailyPace) + " pages/day"));
        writeCsvRow(out, Arrays.asList("Status", summary.overallStatus));
        for (String[] row : optionalSummaryRows(summary.sectionPlans, summary.highestDailyPace)) {
            writeCsvRow(out, Arrays.asList(row[0], row[1]));
        }

        for (SectionPlan sectionPlan : summary.sectionPlans) {
            writeCsvRow(out, Collections.emptyList());
            writeCsvRow(out, Collections.singletonList(sectionPlan.section.label));
            writeCsvRow(out, Arrays.asList("Daily pace", format15(sectionPlan.dailyPace) + " pages/day"));
            if (!sectionPlan.section.simultaneousGroups.isEmpty()) {
                writeCsvRow(out, Arrays.asList("Simultaneous groups", groupsCompact(sectionPlan.section.simultaneousGroups)));
            }
            writeCsvRow(out, Arrays.asList(
                    "Book", "Title", "Start page", "End page", "Current page", "Pages",
                    "Read pages", "Remaining pages", "Daily pages", "Cumulative remaining pages",
                    "Start date", "Deadline", "Days allocated", "Status"
            ));
            for (BookDeadline deadline : sectionPlan.deadlines) {
                Book book = deadline.book;
                writeCsvRow(out, Arrays.asList(
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
                ));
            }
        }
        return out.toString();
    }

    private String summaryText(PlanSummary summary, boolean includeSectionDetails) {
        SectionPlan physical = sectionPlanByLabel(summary.sectionPlans, PHYSICAL_BOOKS_LABEL);
        SectionPlan digital = sectionPlanByLabel(summary.sectionPlans, DIGITAL_BOOKS_LABEL);
        StringBuilder text = new StringBuilder();
        text.append("Reading plan\n");
        text.append("Start date: ").append(startDate).append('\n');
        text.append(endLabel).append(": ").append(endDate).append('\n');
        text.append("Remaining pages: ").append(summary.totalPages).append('\n');
        text.append("Physical remaining pages: ").append(physical.totalPages).append('\n');
        text.append("Digital remaining pages: ").append(digital.totalPages).append('\n');
        text.append("Highest remaining daily pace: ").append(format2(summary.highestDailyPace)).append(" pages/day\n");
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
                text.append("Remaining daily pace: ").append(format2(sectionPlan.dailyPace)).append(" pages/day\n");
                text.append(finalResultMessage(sectionPlan.deadlines.get(sectionPlan.deadlines.size() - 1).deadline, endDate, endName())).append('\n');
            }
        }
        return text.toString();
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
            totalPages += plan.totalPages;
            highestPace = Math.max(highestPace, plan.dailyPace);
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
            remainingPages += pagesRemaining(book);
        }
        double dailyPace = remainingPages == 0 ? 0.0 : (double) remainingPages / periodDays;
        return buildPlan(section, remainingStart, end, dailyPace, MainActivity::pagesRemaining);
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
        List<String[]> rows = new ArrayList<>();
        if (statsOptions.bookCounts) {
            rows.add(new String[]{"Physical book count", String.valueOf(physical.section.books.size())});
            rows.add(new String[]{"Digital book count", String.valueOf(digital.section.books.size())});
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
        }
        if (statsOptions.readingPeriod) {
            rows.add(new String[]{"Reading period", inclusiveDaysBetween(startDate, endDate) + " days"});
        }
        if (statsOptions.paceDriver) {
            List<String> drivers = new ArrayList<>();
            for (SectionPlan plan : sectionPlans) {
                if (plan.totalPages > 0 && Math.abs(plan.dailyPace - highestDailyPace) < 1e-9) {
                    drivers.add(plan.section.label);
                }
            }
            rows.add(new String[]{"Pace driver", String.join(", ", drivers) + " (" + format2(highestDailyPace) + " pages/day)"});
        }
        return rows;
    }

    private void addReadingSession(Book book, LocalDate sessionDate, int currentPage) {
        int previousPagesRead = book.pagesRead();
        setBookProgress(book, currentPage);
        int pagesRead = book.pagesRead() - previousPagesRead;
        if (pagesRead <= 0) {
            throw new IllegalArgumentException("current page must be after the previously recorded page");
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

    private void setBookProgress(Book book, int currentPage) {
        if (currentPage < book.startPage) {
            throw new IllegalArgumentException("current page cannot be before the book's start page");
        }
        if (currentPage > book.endPage) {
            throw new IllegalArgumentException("current page cannot be after the book's end page");
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

    private BookFields readBookFields(EditText titleInput, EditText startPageInput, EditText endPageInput, String defaultTitle, Integer defaultStart, Integer defaultEnd) {
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
            int start = rawStart.isEmpty() && defaultStart != null ? defaultStart : Integer.parseInt(rawStart);
            int end = rawEnd.isEmpty() && defaultEnd != null ? defaultEnd : Integer.parseInt(rawEnd);
            validatePageRange(start, end);
            return new BookFields(title, start, end);
        } catch (NumberFormatException ex) {
            showError("Start page and end page must be whole numbers");
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

    private static class Book {
        int number;
        final String title;
        final int startPage;
        final int endPage;
        Integer currentPage;
        final List<ReadingSession> readingSessions;

        Book(int number, String title, int startPage, int endPage) {
            this(number, title, startPage, endPage, null, new ArrayList<>());
        }

        Book(int number, String title, int startPage, int endPage, Integer currentPage, List<ReadingSession> readingSessions) {
            this.number = number;
            this.title = title;
            this.startPage = startPage;
            this.endPage = endPage;
            this.currentPage = currentPage;
            this.readingSessions = readingSessions;
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
