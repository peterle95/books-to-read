from pathlib import Path

path = Path("reading-plan-android/app/src/main/java/com/petermolnar/readingplan/MainActivity.java")
raw = path.read_bytes()
newline = "\r\n" if b"\r\n" in raw else "\n"
text = raw.decode("utf-8").replace("\r\n", "\n")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


def method_bounds(signature: str) -> tuple[int, int]:
    start = text.find(signature)
    if start < 0:
        raise RuntimeError(f"Method not found: {signature}")
    brace = text.find("{", start)
    depth = 0
    for index in range(brace, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return start, index + 1
    raise RuntimeError(f"Closing brace not found: {signature}")


def replace_method(signature: str, replacement: str) -> None:
    global text
    start, end = method_bounds(signature)
    text = text[:start] + replacement.rstrip() + text[end:]


def get_method(signature: str) -> str:
    start, end = method_bounds(signature)
    return text[start:end]


replace_once(
    "    private Button jsonStatusButton;\n    private boolean jsonLoaded;",
    "    private Button jsonStatusButton;\n    private Dialog metricsDialog;\n    private boolean jsonLoaded;",
    "metrics dialog field",
)
replace_once(
    '        for (String tab : Arrays.asList("Session", "Plan", "Books", "Metrics")) {',
    '        for (String tab : Arrays.asList("Session", "Plan", "Books", "Charts")) {',
    "charts tab label",
)
replace_once(
    '        } else if ("Metrics".equals(currentTab)) {\n            content.addView(buildMetricsView());',
    '        } else if ("Charts".equals(currentTab)) {\n            content.addView(buildChartsView());',
    "charts tab routing",
)

replace_once(
    "        BookSection section = sectionByLabel(selectedBookSection);\n        Book selected = selectedSessionBook();",
    "        BookSection section = sectionByLabel(selectedBookSection);\n        List<Book> sessionBooks = availableSessionBooks(section);\n        Book selected = selectedSessionBook();",
    "session available books",
)
replace_once(
    "        if (section.books.isEmpty()) {\n            TextView empty = label(\"Add a book in the Books tab before logging a session.\");",
    "        if (sessionBooks.isEmpty()) {\n            String emptyMessage = section.books.isEmpty()\n                    ? \"Add a book in the Books tab before logging a session.\"\n                    : \"All books in this format are complete.\";\n            TextView empty = label(emptyMessage);",
    "session empty state",
)
replace_once(
    "            addSessionBookButtons(bookCard, section);",
    "            addSessionBookButtons(bookCard, sessionBooks);",
    "session button source",
)

replace_method(
    "    private void addSessionBookButtons(LinearLayout container, BookSection section) {",
    '''    private void addSessionBookButtons(LinearLayout container, List<Book> sessionBooks) {
        for (int start = 0; start < sessionBooks.size(); start += 2) {
            LinearLayout bookRow = row();
            int rowEnd = Math.min(start + 2, sessionBooks.size());
            for (int index = start; index < rowEnd; index++) {
                Book book = sessionBooks.get(index);
                Button button = selectionButton(book.number + ". " + book.title, book.number == selectedSessionBookNumber);
                int bookNumber = book.number;
                button.setOnClickListener(v -> {
                    selectedSessionBookNumber = bookNumber;
                    showCurrentTab();
                });
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
                params.setMargins(0, 0, index + 1 < rowEnd ? dp(6) : 0, dp(6));
                bookRow.addView(button, params);
            }
            container.addView(bookRow);
        }
    }''',
)
replace_method(
    "    private Book selectedSessionBook() {",
    '''    private Book selectedSessionBook() {
        BookSection section = sectionByLabel(selectedBookSection);
        List<Book> sessionBooks = availableSessionBooks(section);
        for (Book book : sessionBooks) {
            if (book.number == selectedSessionBookNumber) {
                return book;
            }
        }
        if (sessionBooks.isEmpty()) {
            selectedSessionBookNumber = -1;
            return null;
        }
        Book first = sessionBooks.get(0);
        selectedSessionBookNumber = first.number;
        return first;
    }

    private List<Book> availableSessionBooks(BookSection section) {
        List<Book> available = new ArrayList<>();
        for (Book book : section.books) {
            if (completedUnits(book, section.label) < totalUnits(book, section.label)) {
                available.add(book);
            }
        }
        return available;
    }''',
)

metrics_method = get_method("    private View buildMetricsView() {")
old_button = '        header.addView(secondaryButton("Charts", v -> showChartsDialog()));'
new_button = '''        header.addView(secondaryButton("Close", v -> {
            if (metricsDialog != null) {
                metricsDialog.dismiss();
            }
        }));'''
if metrics_method.count(old_button) != 1:
    raise RuntimeError("Metrics header button did not match")
metrics_method = metrics_method.replace(old_button, new_button, 1)
if metrics_method.count("            showCurrentTab();") != 4:
    raise RuntimeError("Metrics refresh calls did not match")
metrics_method = metrics_method.replace("            showCurrentTab();", "            showMetricsDialog();")
replace_method("    private View buildMetricsView() {", metrics_method)

replace_method(
    "    private void showChartsDialog() {",
    '''    private View buildChartsView() {
        LinearLayout panel = verticalBox();
        LinearLayout header = row();
        header.addView(heading("Charts"), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(secondaryButton("Metrics", v -> showMetricsDialog()));
        panel.addView(header);

        List<ChartData> charts = chartData();
        if (charts.isEmpty()) {
            TextView empty = label("Add a physical, digital, or audiobook first.");
            empty.setTextColor(MOCHA);
            panel.addView(empty);
            return panel;
        }

        List<String> choices = new ArrayList<>();
        for (ChartData chart : charts) {
            choices.add(chart.sectionLabel + " - " + chart.book.number + ". " + chart.book.title);
        }
        panel.addView(label("Book"));
        Spinner bookSpinner = spinner(choices, choices.get(0));
        panel.addView(bookSpinner);

        ChartView chartView = new ChartView(this, charts.get(0));
        chartView.setProjectionVisible(showActualPaceProjection);
        CheckBox projectionToggle = checkBox("Show projection based on actual reading pace", showActualPaceProjection);
        projectionToggle.setOnCheckedChangeListener((button, checked) -> {
            showActualPaceProjection = checked;
            chartView.setProjectionVisible(checked);
        });
        panel.addView(projectionToggle);
        panel.addView(chartView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        TextView details = label(chartDetails(charts.get(0)));
        details.setTextColor(MOCHA);
        panel.addView(details);
        bookSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(() -> {
            int index = bookSpinner.getSelectedItemPosition();
            if (index >= 0 && index < charts.size()) {
                chartView.setChartData(charts.get(index));
                details.setText(chartDetails(charts.get(index)));
            }
        }));
        return panel;
    }

    private void showMetricsDialog() {
        if (metricsDialog != null && metricsDialog.isShowing()) {
            metricsDialog.dismiss();
        }
        Dialog dialog = new Dialog(this);
        metricsDialog = dialog;
        dialog.setContentView(buildMetricsView());
        dialog.setOnDismissListener(ignored -> {
            if (metricsDialog == dialog) {
                metricsDialog = null;
            }
        });
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(CREAM));
            window.setGravity(Gravity.CENTER);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT,
                    (int) (getResources().getDisplayMetrics().heightPixels * 0.9f));
        }
    }''',
)

replace_method(
    "    private List<ChartData> chartData() {",
    '''    private List<ChartData> chartData() {
        PlanSummary summary = buildRemainingPlans();
        List<ChartData> charts = new ArrayList<>();
        for (String sectionLabel : BOOK_SECTION_LABELS) {
            BookSection section = sectionByLabel(sectionLabel);
            SectionPlan plan = sectionPlanByLabel(summary.sectionPlans, sectionLabel);
            for (Book book : section.books) {
                if (totalUnits(book, sectionLabel) <= 0) {
                    continue;
                }
                BookDeadline deadline = deadlineForBook(plan, book);
                if (deadline == null) {
                    deadline = chartDeadlineForBook(sectionLabel, book);
                }
                charts.add(new ChartData(sectionLabel, book, deadline));
            }
        }
        return charts;
    }

    private BookDeadline chartDeadlineForBook(String sectionLabel, Book book) {
        BaselineSchedule baseline = book.baselineSchedule;
        LocalDate firstSession = firstSessionDate(book);
        LocalDate lastSession = lastSessionDate(book);
        LocalDate chartStart = baseline != null ? baseline.startDate
                : book.startDateOverride != null ? book.startDateOverride
                : firstSession != null ? firstSession : startDate;
        LocalDate chartDeadline = baseline != null ? baseline.deadline
                : book.deadlineOverride != null ? book.deadlineOverride
                : lastSession != null ? lastSession : LocalDate.now();
        if (chartDeadline.isBefore(chartStart)) {
            chartStart = chartDeadline;
        }
        int readingDays = Math.max(availableReadingDaysCount(chartStart, chartDeadline), 1);
        double dailyTarget = baseline != null ? baseline.dailyTarget
                : (double) totalUnits(book, sectionLabel) / readingDays;
        return new BookDeadline(book, totalUnits(book, sectionLabel), chartStart, chartDeadline,
                readingDays, dailyTarget,
                completedUnits(book, sectionLabel) >= totalUnits(book, sectionLabel) ? "completed" : "chart only");
    }

    private static LocalDate firstSessionDate(Book book) {
        LocalDate first = null;
        for (ReadingSession session : book.readingSessions) {
            if (first == null || session.date.isBefore(first)) {
                first = session.date;
            }
        }
        return first;
    }

    private static LocalDate lastSessionDate(Book book) {
        LocalDate last = null;
        for (ReadingSession session : book.readingSessions) {
            if (last == null || session.date.isAfter(last)) {
                last = session.date;
            }
        }
        return last;
    }''',
)

for marker in [
    'Arrays.asList("Session", "Plan", "Books", "Charts")',
    'content.addView(buildChartsView())',
    'private List<Book> availableSessionBooks',
    'secondaryButton("Metrics", v -> showMetricsDialog())',
    'private void showMetricsDialog()',
    'deadline = chartDeadlineForBook(sectionLabel, book)',
]:
    if marker not in text:
        raise RuntimeError(f"Missing marker: {marker}")

path.write_bytes(text.replace("\n", newline).encode("utf-8"))
