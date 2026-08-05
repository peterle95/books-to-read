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
import android.os.Handler;
import android.os.Looper;
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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
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
import java.util.UUID;

import static com.petermolnar.readingplan.BookCollections.*;
import static com.petermolnar.readingplan.CsvSupport.*;
import static com.petermolnar.readingplan.PlanPrimitives.*;

public class MainActivity extends Activity {
    private static final String PREFS = "reading_plan_prefs";
    private static final String PREF_JSON_URI = "json_uri";
    private static final String PREF_CLIENT_ID = "client_id";
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
    static final int TARGET_COMPLETE = 0xff00ba40;
    static final int TARGET_COMPLETE_DARK = 0xff00832d;

    private LinearLayout root;
    private LinearLayout tabBar;
    private FrameLayout content;
    Button jsonStatusButton;
    private boolean jsonLoaded;

    final List<BookSection> sections = blankSections();
    private final ReadingPlanUi ui = new ReadingPlanUi(this);
    private final ReadingPlanTables tables = new ReadingPlanTables(this);
    private final ReadingPlanCalendar calendar = new ReadingPlanCalendar(this);
    private final ReadingPlanScheduler scheduler = new ReadingPlanScheduler(this);
    private final ReadingPlanTargets targets = new ReadingPlanTargets(this);
    private final ReadingPlanBookProgress bookProgress = new ReadingPlanBookProgress(this);
    private final ReadingPlanCsvReport csvReport = new ReadingPlanCsvReport(this);
    private final ReadingSessionEntries sessionEntries = new ReadingSessionEntries(this);
    private final ReadingPlanSessionView sessionView = new ReadingPlanSessionView(this);
    private final ReadingPlanPlanView planView = new ReadingPlanPlanView(this);
    private final ReadingPlanBooksView booksView = new ReadingPlanBooksView(this);
    private final ReadingPlanMetricsView metricsView = new ReadingPlanMetricsView(this);
    private Dialog metricsDialog;
    private final ReadingPlanChartsView chartsView = new ReadingPlanChartsView(this);
    private StatsOptions statsOptions = new StatsOptions(true, true, true, true, true);
    LocalDate startDate;
    LocalDate endDate;
    String endLabel = "Quarter end";
    final List<RestDayRange> restDays = new ArrayList<>();
    private Uri jsonUri;
    private String currentTab = "Session";
    boolean metricsSubview = false;
    String metricDetail = null;
    private String previousTabBeforeSettings = "Session";
    String selectedBookSection = PHYSICAL_BOOKS_LABEL;
    int selectedBookIndex = -1;
    int selectedSessionBookNumber = -1;
    boolean showPlanDateFields = false;
    boolean showActualPaceProjection = true;
    private boolean restoring = false;
    private final Handler saveHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingSave;
    private String loadedHash;
    private int loadedRevision;
    private boolean localDirty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startDate = nextQuarterStart(LocalDate.now());
        endDate = periodEndFromStart(startDate);
        buildRoot();
        loadSavedJsonUri();
        showCurrentTab();
    }

    @Override
    protected void onResume() {
        super.onResume();
        checkForExternalChange();
    }

    @Override
    protected void onPause() {
        flushPendingSave();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (pendingSave != null) {
            saveHandler.removeCallbacks(pendingSave);
        }
        super.onDestroy();
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

    Button actionButton(String label, View.OnClickListener listener) { return ui.actionButton(label, listener); }
    Button secondaryButton(String label, View.OnClickListener listener) { return ui.secondaryButton(label, listener); }
    Button selectionButton(String label, boolean selected) { return ui.selectionButton(label, selected); }
    private void attachButtonAnimation(View view, int normalFill, int normalBorder) { ui.attachButtonAnimation(view, normalFill, normalBorder); }
    LinearLayout metricColumn(String label, TextView value) { return ui.metricColumn(label, value); }
    TextView metricValue() { return ui.metricValue(); }
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
    void showCurrentTab() {
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

    private View buildSessionView() { return sessionView.build(); }

    void showEntriesSheet() {
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

    private View buildPlanView() { return planView.build(); }
    private View buildBooksView() { return booksView.build(); }

    private View buildMetricsView() { return metricsView.build(); }

    private View buildChartsTab() { return chartsView.build(); }

    void addMetricRow(TableLayout table, String area, String metric, String value, String details) {
        tables.addMetricRow(table, area, metric, value, details);
    }

    HorizontalScrollView bookScheduleTable(SectionPlan sectionPlan) {
        return tables.bookScheduleTable(sectionPlan);
    }

    private HorizontalScrollView planTable(SectionPlan sectionPlan) {
        return tables.planTable(sectionPlan);
    }

    TableRow addTableRow(TableLayout table, boolean header, List<String> values, int rowColor) {
        return tables.addTableRow(table, header, values, rowColor);
    }

    LinearLayout verticalBox() { return ui.verticalBox(); }
    LinearLayout row() { return ui.row(); }
    TextView heading(String text) { return ui.heading(text); }
    TextView sectionTitle(String text) { return ui.sectionTitle(text); }
    TextView label(String text) { return ui.label(text); }
    private TextView monoText(String text) { return ui.monoText(text); }
    EditText editText(String value, int inputType) { return ui.editText(value, inputType); }
    CheckBox checkBox(String label, boolean checked) { return ui.checkBox(label, checked); }
    Spinner spinner(List<String> values, String selected) { return ui.spinner(values, selected); }
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

    void showError(String message) {
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

    void confirmNewPlan() {
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
            String raw = readText(jsonUri);
            CsvPlan plan = loadJson(raw);
            applyPlan(plan);
            loadedHash = sha256(raw);
            loadedRevision = new JSONObject(raw).optInt("revision", 0);
            localDirty = false;
            setJsonLoaded(true);
            showCurrentTab();
        } catch (IOException | JSONException | IllegalArgumentException ex) {
            setJsonLoaded(false);
            showError("Could not load JSON: " + ex.getMessage());
        }
    }

    void autosaveJson(String successMessage) {
        if (restoring) {
            return;
        }
        if (jsonUri == null) {
            setJsonLoaded(false);
            return;
        }
        localDirty = true;
        if (pendingSave != null) {
            saveHandler.removeCallbacks(pendingSave);
        }
        pendingSave = () -> saveJsonNow();
        saveHandler.postDelayed(pendingSave, 250);
    }

    void showMetricsDialog() {
        if (metricsDialog != null && metricsDialog.isShowing()) metricsDialog.dismiss();
        Dialog dialog = new Dialog(this);
        metricsDialog = dialog;
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20), dp(12), dp(20), dp(20));
        panel.setBackgroundColor(CREAM);
        View handle = new View(this);
        handle.setBackground(roundedBackground(BORDER, BORDER));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(dp(44), dp(5));
        hp.gravity = Gravity.CENTER_HORIZONTAL;
        panel.addView(handle, hp);
        LinearLayout header = row();
        header.addView(heading("Metrics"), new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(secondaryButton("Close", v -> closeMetricsDialog(dialog)));
        panel.addView(header);
        panel.addView(metricsView.build(), new LinearLayout.LayoutParams(-1, 0, 1));
        dialog.setContentView(panel);
        Window window = dialog.getWindow();
        if (window != null) { window.setBackgroundDrawable(new ColorDrawable(CREAM)); window.setGravity(Gravity.BOTTOM); }
        dialog.show();
        if (dialog.getWindow() != null) dialog.getWindow().setLayout(-1, (int) (getResources().getDisplayMetrics().heightPixels * .86f));
        final float[] start = {0};
        handle.setOnTouchListener((v, e) -> {
            if (e.getAction() == 0) { start[0] = e.getRawY(); return true; }
            if (e.getAction() == 2) { panel.setTranslationY(Math.max(0, e.getRawY() - start[0])); return true; }
            if (e.getAction() == 1) { if (e.getRawY() - start[0] > dp(120)) closeMetricsDialog(dialog); else panel.animate().translationY(0).setDuration(180).start(); return true; }
            return true;
        });
    }

    private void closeMetricsDialog(Dialog dialog) {
        View view = dialog.getWindow().getDecorView();
        view.animate().translationY(view.getHeight()).setDuration(180).withEndAction(() -> { dialog.dismiss(); if (metricsDialog == dialog) metricsDialog = null; }).start();
    }

    private void saveJsonNow() {
        if (jsonUri == null) {
            return;
        }
        try {
            if (loadedHash == null) {
                throw new IOException("reload the JSON successfully before saving");
            }
            String current = readText(jsonUri);
            if (!loadedHash.equals(sha256(current))
                    || loadedRevision != new JSONObject(current).optInt("revision", 0)) {
                throw new IOException("reading_plan.json changed on another device; reload or merge it before saving");
            }
            String written = jsonText(loadedRevision + 1);
            writeText(jsonUri, written);
            if (!sha256(written).equals(sha256(readText(jsonUri)))) {
                throw new IOException("reading_plan.json changed while it was being saved");
            }
            loadedHash = sha256(written);
            loadedRevision++;
            localDirty = false;
            setJsonLoaded(true);
        } catch (IOException | JSONException ex) {
            setJsonLoaded(false);
            showError("Autosave failed: " + ex.getMessage());
        }
    }

    private void flushPendingSave() {
        if (pendingSave == null || !localDirty) {
            return;
        }
        saveHandler.removeCallbacks(pendingSave);
        pendingSave = null;
        saveJsonNow();
    }

    private void checkForExternalChange() {
        if (jsonUri == null || loadedHash == null) {
            return;
        }
        try {
            if (loadedHash.equals(sha256(readText(jsonUri)))) {
                return;
            }
            if (localDirty) {
                showError("reading_plan.json changed on another device while this app has unsaved changes");
                return;
            }
            reloadFromJson();
        } catch (IOException ex) {
            showError("Could not check synced JSON: " + ex.getMessage());
        }
    }

    private String clientId() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String id = prefs.getString(PREF_CLIENT_ID, null);
        if (id != null) {
            return id;
        }
        id = "android-" + UUID.randomUUID();
        prefs.edit().putString(PREF_CLIENT_ID, id).apply();
        return id;
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) {
                result.append(String.format(Locale.ROOT, "%02x", value));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new AssertionError(ex);
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
        int schemaVersion = payload.optInt("schema_version", 4);
        if (schemaVersion > 8) {
            throw new IllegalArgumentException("unsupported newer schema version");
        }
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
                BookSection section = bookSectionFromJson(
                        rawSections.getJSONObject(i), defaultLabel, schemaVersion >= 8
                );
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
        if (schemaVersion < 5) {
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

    private String jsonText(int revision) throws JSONException {
        initializeMissingBaselineSchedules();
        JSONObject payload = new JSONObject();
        payload.put("schema_version", 8);
        payload.put("revision", revision);
        payload.put("last_modified", OffsetDateTime.now().withNano(0).toString());
        payload.put("modified_by", clientId());
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
                jsonGroup.put(section.books.get(id - 1).id);
            }
            groups.put(jsonGroup);
        }
        object.put("simultaneous_groups", groups);
        return object;
    }

    private JSONObject bookToJson(Book book, String sectionLabel) throws JSONException {
        JSONObject object = new JSONObject();
        object.put("id", book.id);
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
                item.put("id", session.id);
                item.put("date", session.date.toString());
                item.put("current_time_seconds", session.currentPage);
                item.put("time_listened_seconds", session.pagesRead);
                item.put("remaining_time_seconds", remainingTimeAt(book, session.currentPage));
                if (session.deleted) {
                    item.put("deleted", true);
                }
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
            item.put("id", session.id);
            item.put("date", session.date.toString());
            item.put("current_page", session.currentPage);
            item.put("pages_read", session.pagesRead);
            if (session.deleted) {
                item.put("deleted", true);
            }
            sessions.put(item);
        }
        object.put("reading_sessions", sessions);
        return object;
    }

    private BookSection bookSectionFromJson(
            JSONObject object, String defaultLabel, boolean deriveProgressFromSessions
    ) throws JSONException {
        String label = canonicalSectionLabel(object.optString("label", defaultLabel), defaultLabel);
        BookSection section = new BookSection(label);
        section.baselineNeedsRecalculation = object.optBoolean("baseline_needs_recalculation", false);
        if (!BOOK_SECTION_LABELS.contains(label)) {
            return section;
        }
        JSONArray rawBooks = object.optJSONArray("books");
        if (rawBooks != null) {
            for (int i = 0; i < rawBooks.length(); i++) {
                section.books.add(bookFromJson(
                        rawBooks.getJSONObject(i), i + 1, label, deriveProgressFromSessions
                ));
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
                    Object value = rawGroup.get(j);
                    if (value instanceof String) {
                        String id = (String) value;
                        try {
                            group.add(Integer.parseInt(id));
                            continue;
                        } catch (NumberFormatException ignored) {
                        }
                        int number = -1;
                        for (Book book : section.books) {
                            if (book.id.equals(id)) {
                                number = book.number;
                                break;
                            }
                        }
                        if (number < 0) {
                            throw new IllegalArgumentException("simultaneous group references an unknown book");
                        }
                        group.add(number);
                    } else {
                        group.add(rawGroup.getInt(j));
                    }
                }
                groups.add(group);
            }
        }
        section.simultaneousGroups = validateSimultaneousGroups(section.books, groups);
        return section;
    }

    private Book bookFromJson(
            JSONObject object,
            int fallbackNumber,
            String sectionLabel,
            boolean deriveProgressFromSessions
    ) throws JSONException {
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
                String sessionId = rawSession.optString("id", "").trim();
                if (sessionId.isEmpty()) {
                    sessionId = UUID.randomUUID().toString();
                }
                boolean deleted = rawSession.optBoolean("deleted", false);
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
                sessions.add(new ReadingSession(sessionId, sessionDate, sessionCurrentPage, sessionPagesRead, deleted));
                previousCurrentPage = previousCurrentPage == null
                        ? sessionCurrentPage
                        : Math.max(previousCurrentPage, sessionCurrentPage);
            }
        }
        Map<String, ReadingSession> sessionsById = new HashMap<>();
        for (ReadingSession session : sessions) {
            ReadingSession existing = sessionsById.get(session.id);
            if (existing == null) {
                sessionsById.put(session.id, session);
            } else if (existing.date.equals(session.date)
                    && existing.currentPage == session.currentPage
                    && existing.pagesRead == session.pagesRead) {
                existing.deleted = existing.deleted || session.deleted;
            } else {
                throw new IllegalArgumentException("conflicting reading session UUID");
            }
        }
        sessions = new ArrayList<>(sessionsById.values());
        Collections.sort(sessions, (left, right) -> {
            int byDate = left.date.compareTo(right.date);
            return byDate != 0 ? byDate : left.id.compareTo(right.id);
        });
        if (!sessions.isEmpty() && (deriveProgressFromSessions || currentPage == null)) {
            int max = Integer.MIN_VALUE;
            for (ReadingSession session : sessions) {
                if (!session.deleted) {
                    max = Math.max(max, session.currentPage);
                }
            }
            currentPage = max == Integer.MIN_VALUE ? null : max;
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
        String bookId = object.optString("id", "").trim();
        if (bookId.isEmpty()) {
            bookId = UUID.randomUUID().toString();
        }
        return new Book(fallbackNumber, title, startPage, endPage, currentPage, sessions, baselineSchedule, deadlineOverride, startDateOverride, targetCompletedDate, bookId);
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

    private String csvText(PlanSummary summary) { return csvReport.csvText(summary); }

    static String sectionDailyPace(SectionPlan sectionPlan) { return ReadingPlanCsvReport.sectionDailyPace(sectionPlan); }

    SessionTarget sessionTarget(String sectionLabel, Book book, LocalDate targetDate) { return targets.sessionTarget(sectionLabel, book, targetDate); }

    String todayTargetValue(String sectionLabel, BookDeadline deadline) { return targets.todayTargetValue(sectionLabel, deadline); }

    boolean markTargetCompletedIfReached(Book book, String sectionLabel, String dateText, String inputText) {
        return targets.markTargetCompletedIfReached(book, sectionLabel, dateText, inputText);
    }

    boolean targetReached(Book book, String sectionLabel, LocalDate targetDate, int currentPage) {
        return targets.targetReached(book, sectionLabel, targetDate, currentPage);
    }

    boolean isTargetCompleteToday(Book book) { return targets.isTargetCompleteToday(book); }

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


    private void calculateBaselineSchedules(List<BookSection> planSections, LocalDate planStart, LocalDate planEnd) {
        scheduler.calculateBaselineSchedules(planSections, planStart, planEnd);
    }

    void recalculateBaselineSchedules(List<BookSection> planSections, LocalDate planStart, LocalDate planEnd) {
        scheduler.recalculateBaselineSchedules(planSections, planStart, planEnd);
    }

    void applyDeadlineOverride(BookSection section, Book book, LocalDate override, LocalDate planEnd) {
        scheduler.applyDeadlineOverride(section, book, override, planEnd);
    }

    void applyStartDateOverride(BookSection section, Book book, LocalDate override, LocalDate planStart) {
        scheduler.applyStartDateOverride(section, book, override, planStart);
    }

    void invalidateBaselineSchedules(BookSection section) { scheduler.invalidateBaselineSchedules(section); }

    private void invalidateAllBaselineSchedules() {
        for (BookSection section : sections) {
            scheduler.invalidateBaselineSchedules(section);
        }
    }

    PlanSummary buildRemainingPlans() { return scheduler.buildRemainingPlans(); }

    List<String[]> allOptionalSummaryRows(List<SectionPlan> sectionPlans, double highestDailyPace) {
        return optionalSummaryRows(sectionPlans, highestDailyPace, new StatsOptions(true, true, true, true, true));
    }

    List<String[]> optionalSummaryRows(List<SectionPlan> sectionPlans, double highestDailyPace) {
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

    void addReadingSession(Book book, LocalDate sessionDate, int currentPage, String sectionLabel) {
        bookProgress.addReadingSession(book, sessionDate, currentPage, sectionLabel);
    }

    void removeReadingSession(Book book, int index) { bookProgress.removeReadingSession(book, index); }

    void moveSelectedBook(BookSection section, int offset) { bookProgress.moveSelectedBook(section, offset); }

    BookFields readBookFields(String sectionLabel, EditText titleInput, EditText startPageInput, EditText endPageInput, String defaultTitle, Integer defaultStart, Integer defaultEnd) {
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

    Book selectedBook(BookSection section) {
        if (!hasSelectedBook(section)) {
            return null;
        }
        return section.books.get(selectedBookIndex);
    }

    boolean hasSelectedBook(BookSection section) {
        return selectedBookIndex >= 0 && selectedBookIndex < section.books.size();
    }

    BookSection sectionByLabel(String label) {
        return sectionByLabelFromList(sections, label);
    }

    private static LocalDate nextQuarterStart(LocalDate today) { return ReadingPlanCalendar.nextQuarterStart(today); }

    static LocalDate periodEndFromStart(LocalDate start) { return ReadingPlanCalendar.periodEndFromStart(start); }

    boolean isRestDay(LocalDate value) { return calendar.isRestDay(value); }

    List<LocalDate> availableReadingDays(LocalDate start, LocalDate end) {
        return calendar.availableReadingDays(start, end);
    }

    int availableReadingDaysCount(LocalDate start, LocalDate end) {
        return calendar.availableReadingDaysCount(start, end);
    }

    void normalizeRestDayRanges() { calendar.normalizeRestDayRanges(); }

    LocalDate effectiveRemainingStartDate(LocalDate start, LocalDate end, LocalDate today) {
        return calendar.effectiveRemainingStartDate(start, end, today);
    }

    private static double averagePages(SectionPlan plan) {
        int count = plan.section.books.size();
        return count == 0 ? 0.0 : (double) plan.totalPages / count;
    }

    String endName() {
        return "Target finish date".equals(endLabel) ? "target finish date" : "quarter end date";
    }

    static String finalResultMessage(LocalDate finalDeadline, LocalDate endDate, String endName) {
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

    static int clamp(int value, int min, int max) { return ReadingPlanCalendar.clamp(value, min, max); }

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

    static class SimpleTextWatcher implements TextWatcher {
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

    static class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
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
