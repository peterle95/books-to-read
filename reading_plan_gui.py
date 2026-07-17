from __future__ import annotations

import csv
from datetime import date
from math import ceil
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from reading_plan import (
    AUDIOBOOKS_LABEL,
    BOOK_SECTION_LABELS,
    DIGITAL_BOOKS_LABEL,
    PHYSICAL_BOOKS_LABEL,
    Book,
    BookDeadline,
    BookSection,
    RestDayRange,
    SummaryStatsOptions,
    add_reading_session,
    available_reading_days_count,
    build_remaining_section_plans,
    completed_units,
    recalculate_baseline_schedules,
    current_time_from_remaining,
    final_result_message,
    format_duration,
    insertion_splits_simultaneous_group,
    is_audiobook_section,
    load_csv_plan,
    load_json_plan,
    next_quarter_start,
    normalize_rest_day_ranges,
    optional_summary_stat_rows,
    pages_remaining,
    parse_date,
    parse_duration,
    period_end_from_start,
    remaining_time_at_current,
    remap_simultaneous_groups_after_addition,
    remap_simultaneous_groups_after_deletion,
    remaining_units,
    remove_reading_session,
    renumber_books,
    section_plan_by_label,
    section_daily_pace,
    total_units,
    validate_simultaneous_groups,
    write_csv,
    write_json_plan,
)


DEFAULT_JSON_FILE = Path("reading_plan.json")

PAGE_PLAN_COLUMNS = (
    "Book",
    "Title",
    "Daily pages",
    "Remaining",
    "Start page",
    "End page",
    "Current page",
    "Pages",
    "Start date",
    "Deadline",
    "Days allocated",
    "Status",
)
AUDIO_PLAN_COLUMNS = (
    "Book",
    "Title",
    "Daily time",
    "Remaining time",
    "Start time",
    "End time",
    "Duration",
    "Start date",
    "Deadline",
    "Days allocated",
    "Status",
)
PAGE_BOOK_COLUMNS = (
    "Book",
    "Title",
    "Start page",
    "End page",
    "Current page",
    "Pages",
    "Remaining",
)
AUDIO_BOOK_COLUMNS = (
    "Book",
    "Title",
    "Start time",
    "End time",
    "Remaining time",
    "Duration",
)
SESSION_COLUMNS = (
    "Date",
    "Format",
    "Book",
    "Current page/time left",
    "Session progress",
)
PLAN_COLUMN_WIDTHS = {
    "Book": 6,
    "Title": 28,
    "Daily pages": 12,
    "Daily time": 12,
    "Start page": 10,
    "End page": 10,
    "Current page": 12,
    "Start time": 10,
    "End time": 10,
    "Pages": 8,
    "Remaining": 10,
    "Duration": 10,
    "Remaining time": 14,
    "Start date": 12,
    "Deadline": 12,
    "Days allocated": 14,
    "Status": 12,
}
DAILY_PAGES_PURPLE = "#6d28d9"
DAILY_PAGES_PURPLE_DARK = "#4c1d95"


def blank_sections() -> list[BookSection]:
    return [BookSection(label, [], []) for label in BOOK_SECTION_LABELS]


def book_columns(label: str) -> tuple[str, ...]:
    return AUDIO_BOOK_COLUMNS if is_audiobook_section(label) else PAGE_BOOK_COLUMNS


def plan_columns(label: str) -> tuple[str, ...]:
    return AUDIO_PLAN_COLUMNS if is_audiobook_section(label) else PAGE_PLAN_COLUMNS


def display_value(label: str, value: int | float | None) -> str:
    if value is None:
        return ""
    if is_audiobook_section(label):
        return format_duration(value)
    return str(int(value))


def target_units_for_date(
    book: Book,
    section_label: str,
    deadline: BookDeadline,
    target_date: date,
    rest_days: list[RestDayRange] | None = None,
) -> int:
    total = total_units(book, section_label)
    completed = completed_units(book, section_label)
    if remaining_units(book, section_label) <= 0 or target_date > deadline.deadline:
        return total
    if target_date < deadline.start_date or deadline.daily_pages <= 0:
        return completed

    active_date = min(target_date, deadline.deadline)
    elapsed_days = available_reading_days_count(
        deadline.start_date, active_date, rest_days
    )
    scheduled_units = ceil(deadline.daily_pages * elapsed_days - 1e-9)
    return min(max(completed + scheduled_units, completed), total)


def target_display_value(book: Book, section_label: str, target_units: int) -> str:
    if is_audiobook_section(section_label):
        return format_duration(max(total_units(book, section_label) - target_units, 0))
    if target_units <= 0:
        return str(book.start_page)
    return str(book.start_page + target_units - 1)


def target_daily_pace_text(section_label: str, daily_pages: float) -> str:
    if is_audiobook_section(section_label):
        return f"{format_duration(daily_pages)}/day"
    return f"{daily_pages:.2f} pages/day"


def groups_to_text(groups: list[tuple[int, ...]]) -> str:
    return "; ".join(",".join(str(book_id) for book_id in group) for group in groups)


def parse_group_text(raw_text: str) -> list[tuple[int, ...]]:
    groups: list[tuple[int, ...]] = []
    for raw_group in raw_text.split(";"):
        raw_group = raw_group.strip()
        if not raw_group:
            continue
        try:
            groups.append(
                tuple(
                    int(raw_id.strip())
                    for raw_id in raw_group.split(",")
                    if raw_id.strip()
                )
            )
        except ValueError as error:
            raise ValueError("group IDs must be whole numbers") from error
    return groups


def end_name_for_label(end_label: str) -> str:
    if end_label == "Target finish date":
        return "target finish date"
    return "quarter end date"


class ReadingPlanApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Reading Plan")
        self.geometry("1220x780")
        self.minsize(1020, 640)

        self.sections = blank_sections()
        self.rest_days: list[RestDayRange] = []
        self.file_path = DEFAULT_JSON_FILE
        self.cached_plan: tuple[object, ...] | None = None
        self.suspend_autosave = False

        self.start_var = tk.StringVar()
        self.end_var = tk.StringVar()
        self.custom_target_var = tk.BooleanVar(value=False)
        self.status_var = tk.StringVar(value="Ready")
        self.file_var = tk.StringVar(value=str(self.file_path))

        self.session_section_var = tk.StringVar(value=PHYSICAL_BOOKS_LABEL)
        self.session_book_var = tk.StringVar()
        self.session_date_var = tk.StringVar(value=date.today().isoformat())
        self.session_current_page_var = tk.StringVar()
        self.session_remaining_var = tk.StringVar(value="")
        self.rest_start_var = tk.StringVar()
        self.rest_end_var = tk.StringVar()
        self.rest_tree: ttk.Treeview | None = None

        self.book_trees: dict[str, ttk.Treeview] = {}
        self.plan_tables: dict[str, tk.Frame] = {}
        self.title_vars: dict[str, tk.StringVar] = {}
        self.start_page_vars: dict[str, tk.StringVar] = {}
        self.end_page_vars: dict[str, tk.StringVar] = {}
        self.group_vars: dict[str, tk.StringVar] = {}
        self.stat_vars = {
            "book_counts": tk.BooleanVar(value=True),
            "page_share": tk.BooleanVar(value=True),
            "average_pages": tk.BooleanVar(value=True),
            "reading_period": tk.BooleanVar(value=True),
            "pace_driver": tk.BooleanVar(value=True),
        }

        self._build_layout()
        self.load_initial_plan()

    def _build_layout(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        notebook = ttk.Notebook(self)
        notebook.grid(row=0, column=0, sticky="nsew")

        session_tab = ttk.Frame(notebook, padding=12)
        plan_tab = ttk.Frame(notebook, padding=12)
        books_tab = ttk.Frame(notebook, padding=12)
        summary_tab = ttk.Frame(notebook, padding=12)
        notebook.add(session_tab, text="Session")
        notebook.add(plan_tab, text="Plan")
        notebook.add(books_tab, text="Books")
        notebook.add(summary_tab, text="Summary")

        self._build_session_tab(session_tab)
        self._build_plan_tab(plan_tab)
        self._build_books_tab(books_tab)
        self._build_summary_tab(summary_tab)

        self.status_label = ttk.Label(
            self, textvariable=self.status_var, anchor="w", padding=(8, 5)
        )
        self.status_label.grid(row=1, column=0, sticky="ew")

    def _build_session_tab(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(2, weight=1)

        form = ttk.LabelFrame(parent, text="Reading session", padding=12)
        form.grid(row=0, column=0, sticky="ew")
        form.columnconfigure(3, weight=1)

        ttk.Label(form, text="Format").grid(row=0, column=0, sticky="w")
        section_combo = ttk.Combobox(
            form,
            textvariable=self.session_section_var,
            values=BOOK_SECTION_LABELS,
            state="readonly",
            width=18,
        )
        section_combo.grid(row=0, column=1, sticky="w", padx=(8, 18))
        section_combo.bind("<<ComboboxSelected>>", lambda _event: self.refresh_session_books())

        ttk.Label(form, text="Book").grid(row=0, column=2, sticky="w")
        self.session_book_combo = ttk.Combobox(
            form,
            textvariable=self.session_book_var,
            state="readonly",
        )
        self.session_book_combo.grid(row=0, column=3, sticky="ew", padx=(8, 18))
        self.session_book_combo.bind(
            "<<ComboboxSelected>>", lambda _event: self.refresh_session_remaining()
        )

        ttk.Label(form, text="Date").grid(row=1, column=0, sticky="w", pady=(10, 0))
        ttk.Entry(form, textvariable=self.session_date_var, width=14).grid(
            row=1, column=1, sticky="w", padx=(8, 18), pady=(10, 0)
        )
        self.session_date_var.trace_add(
            "write", lambda *_args: self.refresh_session_remaining()
        )
        self.session_progress_label = ttk.Label(form, text="Current page")
        self.session_progress_label.grid(row=1, column=2, sticky="w", pady=(10, 0))
        ttk.Entry(form, textvariable=self.session_current_page_var, width=12).grid(
            row=1, column=3, sticky="w", padx=(8, 18), pady=(10, 0)
        )
        ttk.Button(form, text="Add Session", command=self.add_session).grid(
            row=1, column=4, sticky="w", pady=(10, 0)
        )

        remaining = ttk.Label(form, textvariable=self.session_remaining_var)
        remaining.grid(row=2, column=0, columnspan=5, sticky="w", pady=(10, 0))

        actions = ttk.Frame(parent)
        actions.grid(row=1, column=0, sticky="ew", pady=(12, 8))
        ttk.Button(actions, text="Delete Selected Session", command=self.delete_session).grid(
            row=0, column=0, sticky="w"
        )

        self.session_tree = ttk.Treeview(
            parent, columns=SESSION_COLUMNS, show="headings", selectmode="browse"
        )
        widths = {
            "Date": 120,
            "Format": 160,
            "Book": 460,
            "Current page/time left": 170,
            "Session progress": 120,
        }
        for column in SESSION_COLUMNS:
            self.session_tree.heading(column, text=column)
            self.session_tree.column(column, width=widths[column], anchor="w")
        self.session_tree.grid(row=2, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=self.session_tree.yview)
        scrollbar.grid(row=2, column=1, sticky="ns")
        self.session_tree.configure(yscrollcommand=scrollbar.set)

    def _build_plan_tab(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(5, weight=1)

        toolbar = ttk.Frame(parent)
        toolbar.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        actions = [
            ("New", self.new_plan),
            ("Open JSON", self.open_json),
            ("Import CSV", self.import_csv),
            ("Export CSV", self.export_csv),
            ("Recalculate", self.recalculate_plan),
        ]
        for index, (label, command) in enumerate(actions):
            ttk.Button(toolbar, text=label, command=command).grid(
                row=0, column=index, padx=(0, 8)
            )

        file_row = ttk.Frame(parent)
        file_row.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        file_row.columnconfigure(1, weight=1)
        ttk.Label(file_row, text="JSON file").grid(row=0, column=0, sticky="w")
        ttk.Label(file_row, textvariable=self.file_var).grid(
            row=0, column=1, sticky="ew", padx=(8, 0)
        )

        dates = ttk.LabelFrame(parent, text="Dates", padding=12)
        dates.grid(row=2, column=0, sticky="ew")
        dates.columnconfigure(1, weight=1)
        dates.columnconfigure(4, weight=1)

        ttk.Label(dates, text="Start date").grid(row=0, column=0, sticky="w")
        start_entry = ttk.Entry(dates, textvariable=self.start_var, width=16)
        start_entry.grid(row=0, column=1, sticky="w", padx=(8, 24))
        start_entry.bind("<Return>", lambda _event: self.mark_dates_changed())
        start_entry.bind("<FocusOut>", lambda _event: self.mark_dates_changed())

        ttk.Checkbutton(
            dates,
            text="Custom finish date",
            variable=self.custom_target_var,
            command=self.toggle_custom_target,
        ).grid(row=0, column=2, sticky="w", padx=(0, 24))
        ttk.Label(dates, text="Finish date").grid(row=0, column=3, sticky="w")
        self.end_entry = ttk.Entry(dates, textvariable=self.end_var, width=16)
        self.end_entry.grid(row=0, column=4, sticky="w", padx=(8, 0))
        self.end_entry.bind("<Return>", lambda _event: self.mark_dates_changed())
        self.end_entry.bind("<FocusOut>", lambda _event: self.mark_dates_changed())

        rest_frame = ttk.LabelFrame(parent, text="Rest-day ranges", padding=12)
        rest_frame.grid(row=3, column=0, sticky="ew", pady=(12, 12))
        rest_frame.columnconfigure(2, weight=1)
        ttk.Label(rest_frame, text="Start").grid(row=0, column=0, sticky="w")
        ttk.Entry(rest_frame, textvariable=self.rest_start_var, width=14).grid(
            row=0, column=1, padx=(8, 16)
        )
        ttk.Label(rest_frame, text="End").grid(row=0, column=2, sticky="w")
        ttk.Entry(rest_frame, textvariable=self.rest_end_var, width=14).grid(
            row=0, column=3, padx=(8, 16)
        )
        ttk.Button(rest_frame, text="Add range", command=self.add_rest_day_range).grid(
            row=0, column=4, padx=(0, 8)
        )
        ttk.Button(
            rest_frame, text="Remove selected", command=self.remove_rest_day_range
        ).grid(row=0, column=5)
        self.rest_tree = ttk.Treeview(
            rest_frame, columns=("Start", "End"), show="headings", height=3
        )
        self.rest_tree.heading("Start", text="Start")
        self.rest_tree.heading("End", text="End")
        self.rest_tree.column("Start", width=120, anchor="w")
        self.rest_tree.column("End", width=120, anchor="w")
        self.rest_tree.grid(row=1, column=0, columnspan=6, sticky="ew", pady=(8, 0))

        stats = ttk.LabelFrame(parent, text="Optional summary stats", padding=12)
        stats.grid(row=4, column=0, sticky="ew", pady=(0, 12))
        labels = [
            ("book_counts", "Book counts"),
            ("page_share", "Page share"),
            ("average_pages", "Average pages/time"),
            ("reading_period", "Reading period"),
            ("pace_driver", "Pace driver"),
        ]
        for index, (key, label) in enumerate(labels):
            ttk.Checkbutton(
                stats,
                text=label,
                variable=self.stat_vars[key],
                command=self.refresh_and_autosave,
            ).grid(row=0, column=index, sticky="w", padx=(0, 16))

        self.plan_text = tk.Text(parent, height=18, wrap="word", state="disabled")
        self.plan_text.grid(row=5, column=0, sticky="nsew")

    def _build_books_tab(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(0, weight=1)
        notebook = ttk.Notebook(parent)
        notebook.grid(row=0, column=0, sticky="nsew")
        for label in BOOK_SECTION_LABELS:
            frame = ttk.Frame(notebook, padding=8)
            frame.columnconfigure(0, weight=1)
            frame.rowconfigure(0, weight=1)
            notebook.add(frame, text=label)
            self._build_book_section(frame, label)

    def _build_book_section(self, parent: ttk.Frame, label: str) -> None:
        tree_frame = ttk.Frame(parent)
        tree_frame.grid(row=0, column=0, sticky="nsew")
        tree_frame.columnconfigure(0, weight=1)
        tree_frame.rowconfigure(0, weight=1)

        tree = ttk.Treeview(
            tree_frame,
            columns=book_columns(label),
            show="headings",
            selectmode="browse",
            height=12,
        )
        widths = {
            "Book": 70,
            "Title": 320,
            "Start page": 100,
            "End page": 100,
            "Current page": 110,
            "Pages": 90,
            "Remaining": 110,
            "Start time": 100,
            "End time": 100,
            "Duration": 90,
            "Remaining time": 120,
        }
        for column in book_columns(label):
            tree.heading(column, text=column)
            tree.column(column, width=widths[column], anchor="w")
        tree.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        tree.configure(yscrollcommand=scrollbar.set)
        tree.bind(
            "<<TreeviewSelect>>",
            lambda _event, section_label=label: self.load_selected_book(section_label),
        )
        self.book_trees[label] = tree

        editor = ttk.LabelFrame(parent, text="Book", padding=10)
        editor.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        editor.columnconfigure(1, weight=1)
        self.title_vars[label] = tk.StringVar()
        self.start_page_vars[label] = tk.StringVar()
        self.end_page_vars[label] = tk.StringVar()
        ttk.Label(editor, text="Title").grid(row=0, column=0, sticky="w")
        ttk.Entry(editor, textvariable=self.title_vars[label]).grid(
            row=0, column=1, sticky="ew", padx=(8, 12), columnspan=3
        )
        start_label = "Start time" if is_audiobook_section(label) else "Start page"
        end_label = "End time" if is_audiobook_section(label) else "End page"
        ttk.Label(editor, text=start_label).grid(row=1, column=0, sticky="w", pady=(10, 0))
        ttk.Entry(editor, textvariable=self.start_page_vars[label], width=10).grid(
            row=1, column=1, sticky="w", padx=(8, 12), pady=(10, 0)
        )
        ttk.Label(editor, text=end_label).grid(row=1, column=2, sticky="w", pady=(10, 0))
        ttk.Entry(editor, textvariable=self.end_page_vars[label], width=10).grid(
            row=1, column=3, sticky="w", padx=(8, 0), pady=(10, 0)
        )

        buttons = ttk.Frame(editor)
        buttons.grid(row=2, column=0, columnspan=4, sticky="ew", pady=(10, 0))
        actions = [
            ("Add", lambda section_label=label: self.add_book(section_label)),
            (
                "Insert Before",
                lambda section_label=label: self.insert_book_before_selection(section_label),
            ),
            (
                "Replace Selected",
                lambda section_label=label: self.replace_selected_book(section_label),
            ),
            (
                "Delete Selected",
                lambda section_label=label: self.delete_selected_book(section_label),
            ),
            ("Move Up", lambda section_label=label: self.move_selected_book(section_label, -1)),
            ("Move Down", lambda section_label=label: self.move_selected_book(section_label, 1)),
        ]
        for index, (button_label, command) in enumerate(actions):
            ttk.Button(buttons, text=button_label, command=command).grid(
                row=0, column=index, padx=(0, 8)
            )

        groups = ttk.LabelFrame(parent, text="Simultaneous groups", padding=10)
        groups.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        groups.columnconfigure(1, weight=1)
        self.group_vars[label] = tk.StringVar()
        ttk.Label(groups, text="Groups").grid(row=0, column=0, sticky="w")
        ttk.Entry(groups, textvariable=self.group_vars[label]).grid(
            row=0, column=1, sticky="ew", padx=(8, 12)
        )
        ttk.Button(
            groups,
            text="Apply",
            command=lambda section_label=label: self.apply_groups(section_label),
        ).grid(row=0, column=2, padx=(0, 8))
        ttk.Button(
            groups,
            text="Clear",
            command=lambda section_label=label: self.clear_groups(section_label),
        ).grid(row=0, column=3)

    def _build_summary_tab(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(1, weight=1)

        self.summary_text = tk.Text(parent, height=9, wrap="word", state="disabled")
        self.summary_text.grid(row=0, column=0, sticky="ew", pady=(0, 12))

        notebook = ttk.Notebook(parent)
        notebook.grid(row=1, column=0, sticky="nsew")
        for label in BOOK_SECTION_LABELS:
            frame = ttk.Frame(notebook, padding=8)
            frame.columnconfigure(0, weight=1)
            frame.rowconfigure(0, weight=1)
            notebook.add(frame, text=label)
            canvas = tk.Canvas(frame, highlightthickness=0)
            canvas.grid(row=0, column=0, sticky="nsew")
            y_scrollbar = ttk.Scrollbar(frame, orient="vertical", command=canvas.yview)
            y_scrollbar.grid(row=0, column=1, sticky="ns")
            x_scrollbar = ttk.Scrollbar(frame, orient="horizontal", command=canvas.xview)
            x_scrollbar.grid(row=1, column=0, sticky="ew")
            canvas.configure(
                yscrollcommand=y_scrollbar.set,
                xscrollcommand=x_scrollbar.set,
            )
            table = ttk.Frame(canvas)
            canvas_window = canvas.create_window((0, 0), window=table, anchor="nw")
            table.bind(
                "<Configure>",
                lambda _event, table_canvas=canvas: table_canvas.configure(
                    scrollregion=table_canvas.bbox("all")
                ),
            )
            canvas.bind(
                "<Configure>",
                lambda event, table_canvas=canvas, window_id=canvas_window: (
                    table_canvas.itemconfigure(window_id, height=max(event.height, 1))
                ),
            )
            self.plan_tables[label] = table

    def load_initial_plan(self) -> None:
        if self.file_path.exists():
            try:
                self.load_plan_from_json(self.file_path)
                self.set_status(f"Loaded {self.file_path}")
                return
            except (OSError, ValueError) as error:
                self.set_status(f"Could not load {self.file_path}: {error}", error=True)
        self.reset_to_blank_plan(autosave=True)

    def reset_to_blank_plan(self, autosave: bool) -> None:
        start_date = next_quarter_start()
        self.sections = blank_sections()
        self.rest_days = []
        self.start_var.set(start_date.isoformat())
        self.end_var.set(period_end_from_start(start_date).isoformat())
        self.custom_target_var.set(False)
        self.set_stats_options(SummaryStatsOptions(True, True, True, True, True))
        self.toggle_custom_target(refresh=False)
        self.refresh_all(autosave=autosave)

    def new_plan(self) -> None:
        if not messagebox.askyesno("Reading Plan", "Replace the current plan?"):
            return
        self.reset_to_blank_plan(autosave=True)
        self.set_status(f"New plan saved to {self.file_path}")

    def load_plan_from_json(self, path: Path) -> None:
        (
            sections,
            start_date,
            end_date,
            end_label,
            _end_name,
            stats_options,
            rest_days,
        ) = load_json_plan(str(path))
        self.suspend_autosave = True
        try:
            self.sections = sections
            self.rest_days = rest_days
            self.file_path = path
            self.file_var.set(str(path))
            self.start_var.set(start_date.isoformat())
            self.end_var.set(end_date.isoformat())
            self.custom_target_var.set(end_label == "Target finish date")
            self.set_stats_options(stats_options)
            self.toggle_custom_target(refresh=False)
            self.refresh_all(autosave=False)
        finally:
            self.suspend_autosave = False
        self.autosave_json()

    def open_json(self) -> None:
        filename = filedialog.askopenfilename(
            title="Open JSON plan",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if not filename:
            return
        path = Path(filename)
        try:
            self.load_plan_from_json(path)
        except (OSError, ValueError) as error:
            self.show_error(f"Could not open JSON: {error}")
            return
        self.set_status(f"Loaded {path}")

    def import_csv(self) -> None:
        filename = filedialog.askopenfilename(
            title="Import CSV plan",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if not filename:
            return
        try:
            sections, start_date, end_date, end_label, _end_name, rest_days = load_csv_plan(filename)
        except (OSError, csv.Error, ValueError) as error:
            self.show_error(f"Could not import CSV: {error}")
            return

        self.suspend_autosave = True
        try:
            self.sections = sections
            self.rest_days = rest_days
            self.file_path = Path(filename).with_suffix(".json")
            self.file_var.set(str(self.file_path))
            self.start_var.set(start_date.isoformat())
            self.end_var.set(end_date.isoformat())
            self.custom_target_var.set(end_label == "Target finish date")
            self.set_stats_options(SummaryStatsOptions(True, True, True, True, True))
            self.toggle_custom_target(refresh=False)
            self.refresh_all(autosave=False)
        finally:
            self.suspend_autosave = False
        self.autosave_json()
        self.set_status(f"Imported {Path(filename).name} and saved {self.file_path.name}")

    def export_csv(self) -> None:
        try:
            plan = self.current_plan_for_save()
        except ValueError as error:
            self.show_error(str(error))
            return
        (
            section_plans,
            total_pages,
            highest_daily_pace,
            overall_status,
            start_date,
            end_date,
            end_label,
            _end_name,
            stats_options,
        ) = plan
        filename = filedialog.asksaveasfilename(
            title="Export CSV plan",
            defaultextension=".csv",
            initialfile="reading_plan.csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if not filename:
            return
        try:
            write_csv(
                filename,
                section_plans,
                start_date,
                end_date,
                total_pages,
                highest_daily_pace,
                overall_status,
                end_label,
                stats_options,
                self.rest_days,
            )
        except OSError as error:
            self.show_error(f"Could not export CSV: {error}")
            return
        self.set_status(f"Exported {Path(filename).name}")

    def toggle_custom_target(self, refresh: bool = True) -> None:
        if self.custom_target_var.get():
            self.end_entry.configure(state="normal")
        else:
            self.end_entry.configure(state="disabled")
            try:
                start_date = parse_date(self.start_var.get().strip())
                self.end_var.set(period_end_from_start(start_date).isoformat())
            except ValueError:
                pass
        if refresh:
            self.mark_dates_changed()

    def current_dates(self) -> tuple[date, date, str, str]:
        start_date = parse_date(self.start_var.get().strip())
        if self.custom_target_var.get():
            end_date = parse_date(self.end_var.get().strip())
            end_label = "Target finish date"
        else:
            end_date = period_end_from_start(start_date)
            self.end_var.set(end_date.isoformat())
            end_label = "Quarter end"
        if end_date < start_date:
            raise ValueError("finish date must be on or after the start date")
        return start_date, end_date, end_label, end_name_for_label(end_label)

    def current_stats_options(self) -> SummaryStatsOptions:
        return SummaryStatsOptions(
            book_counts=self.stat_vars["book_counts"].get(),
            page_share=self.stat_vars["page_share"].get(),
            average_pages=self.stat_vars["average_pages"].get(),
            reading_period=self.stat_vars["reading_period"].get(),
            pace_driver=self.stat_vars["pace_driver"].get(),
        )

    def set_stats_options(self, options: SummaryStatsOptions) -> None:
        self.stat_vars["book_counts"].set(options.book_counts)
        self.stat_vars["page_share"].set(options.page_share)
        self.stat_vars["average_pages"].set(options.average_pages)
        self.stat_vars["reading_period"].set(options.reading_period)
        self.stat_vars["pace_driver"].set(options.pace_driver)

    def recalculate_plan(self) -> None:
        try:
            start_date, end_date, _end_label, _end_name = self.current_dates()
        except ValueError as error:
            self.show_error(str(error))
            return
        recalculate_baseline_schedules(
            self.sections, start_date, end_date, self.rest_days
        )
        self.refresh_all(autosave=True)

    def add_rest_day_range(self) -> None:
        try:
            item = RestDayRange(
                parse_date(self.rest_start_var.get().strip()),
                parse_date(self.rest_end_var.get().strip()),
            )
            if item.end_date < item.start_date:
                raise ValueError("rest-day end date must be on or after the start date")
        except ValueError as error:
            self.show_error(str(error))
            return
        self.rest_days = normalize_rest_day_ranges(self.rest_days + [item])
        self.mark_dates_changed()

    def remove_rest_day_range(self) -> None:
        if self.rest_tree is None:
            return
        selection = self.rest_tree.selection()
        if not selection:
            self.show_error("Select a rest-day range first")
            return
        index = int(selection[0])
        del self.rest_days[index]
        self.mark_dates_changed()

    def refresh_rest_days(self) -> None:
        if self.rest_tree is None:
            return
        self.rest_tree.delete(*self.rest_tree.get_children())
        for index, item in enumerate(self.rest_days):
            self.rest_tree.insert(
                "", "end", iid=str(index),
                values=(item.start_date.isoformat(), item.end_date.isoformat())
            )

    def mark_dates_changed(self) -> None:
        for section in self.sections:
            section.baseline_needs_recalculation = True
        self.refresh_and_autosave()

    def refresh_and_autosave(self) -> None:
        self.refresh_all(autosave=True)

    def refresh_all(self, autosave: bool) -> None:
        self.refresh_book_tables()
        self.refresh_rest_days()
        self.refresh_group_entries()
        self.refresh_session_books()
        self.refresh_session_table()
        self.refresh_plan(autosave=autosave)

    def refresh_book_tables(self) -> None:
        for section in self.sections:
            tree = self.book_trees[section.label]
            tree.delete(*tree.get_children())
            for book in section.books:
                if is_audiobook_section(section.label):
                    values = (
                        book.number,
                        book.title,
                        format_duration(book.start_page),
                        format_duration(book.end_page),
                        format_duration(remaining_units(book, section.label)),
                        format_duration(total_units(book, section.label)),
                    )
                else:
                    values = (
                        book.number,
                        book.title,
                        book.start_page,
                        book.end_page,
                        "" if book.current_page is None else book.current_page,
                        book.pages,
                        pages_remaining(book),
                    )
                tree.insert(
                    "",
                    "end",
                    iid=str(book.number),
                    values=values,
                )

    def refresh_group_entries(self) -> None:
        for section in self.sections:
            self.group_vars[section.label].set(groups_to_text(section.simultaneous_groups))

    def refresh_session_books(self) -> None:
        section = self.section_by_label(self.session_section_var.get())
        self.session_progress_label.configure(
            text="Time left" if is_audiobook_section(section.label) else "Current page"
        )
        values = [self.book_choice(book) for book in section.books]
        self.session_book_combo.configure(values=values)
        if values and self.session_book_var.get() not in values:
            self.session_book_var.set(values[0])
        elif not values:
            self.session_book_var.set("")
        self.refresh_session_remaining()

    def refresh_session_remaining(self) -> None:
        selected = self.selected_session_book()
        if selected is None:
            self.session_remaining_var.set("No book selected.")
            return
        section, book = selected
        try:
            target_date = parse_date(self.session_date_var.get().strip())
        except ValueError:
            self.session_remaining_var.set("Enter a valid session date.")
            return
        try:
            deadline = self.session_deadline(section, book)
        except ValueError as error:
            self.session_remaining_var.set(f"Target unavailable: {error}")
            return
        if deadline is None:
            self.session_remaining_var.set(f"{book.title}: no target available.")
            return
        self.session_remaining_var.set(
            self.session_target_message(section, book, deadline, target_date)
        )

    def session_deadline(
        self, section: BookSection, book: Book
    ) -> BookDeadline | None:
        start_date, end_date, _end_label, _end_name = self.current_dates()
        section_plans, _total_pages, _highest_daily_pace, _overall_status = (
            build_remaining_section_plans(
                self.sections, start_date, end_date, rest_days=self.rest_days
            )
        )
        section_plan = section_plan_by_label(section_plans, section.label)
        for deadline in section_plan.deadlines:
            if deadline.book is book:
                return deadline
        return None

    def session_target_message(
        self,
        section: BookSection,
        book: Book,
        deadline: BookDeadline,
        target_date: date,
    ) -> str:
        audiobook = is_audiobook_section(section.label)
        unit_name = "time left" if audiobook else "page"
        current = "not started"
        if book.current_page is not None:
            current = (
                format_duration(remaining_time_at_current(book, book.current_page))
                if audiobook
                else display_value(section.label, book.current_page)
            )
        if target_date < deadline.start_date:
            daily_pace = target_daily_pace_text(section.label, deadline.daily_pages)
            first_target = target_display_value(
                book,
                section.label,
                target_units_for_date(
                    book, section.label, deadline, deadline.start_date, self.rest_days
                ),
            )
            return (
                f"{book.title}: target starts {deadline.start_date.isoformat()}; "
                f"first target {unit_name} {first_target} ({daily_pace})."
            )

        target = target_display_value(
            book,
            section.label,
            target_units_for_date(
                book, section.label, deadline, target_date, self.rest_days
            ),
        )
        daily_pace = target_daily_pace_text(section.label, deadline.daily_pages)
        if audiobook:
            return (
                f"{book.title}: current time left {current}; "
                f"target time left for "
                f"{target_date.isoformat()}: {target} ({daily_pace})."
            )
        return (
            f"{book.title}: current page {current}; target page for "
            f"{target_date.isoformat()}: {target} ({daily_pace})."
        )

    def refresh_session_table(self) -> None:
        self.session_tree.delete(*self.session_tree.get_children())
        for section_index, section in enumerate(self.sections):
            for book_index, book in enumerate(section.books):
                for session_index, session in enumerate(book.reading_sessions):
                    iid = f"{section_index}:{book_index}:{session_index}"
                    self.session_tree.insert(
                        "",
                        "end",
                        iid=iid,
                        values=(
                            session.date.isoformat(),
                            section.label,
                            f"{book.number}. {book.title}",
                            (
                                format_duration(
                                    remaining_time_at_current(book, session.current_page)
                                )
                                if is_audiobook_section(section.label)
                                else display_value(section.label, session.current_page)
                            ),
                            display_value(section.label, session.pages_read),
                        ),
                    )

    def refresh_plan(self, autosave: bool) -> None:
        try:
            start_date, end_date, end_label, end_name = self.current_dates()
        except ValueError as error:
            self.cached_plan = None
            self.clear_plan_output()
            self.set_status(str(error), error=True)
            return

        try:
            section_plans, total_pages, highest_daily_pace, overall_status = (
                build_remaining_section_plans(
                    self.sections, start_date, end_date, rest_days=self.rest_days
                )
            )
        except ValueError as error:
            self.cached_plan = None
            self.clear_plan_output()
            self.set_status(str(error), error=True)
            return

        stats_options = self.current_stats_options()
        self.cached_plan = (
            section_plans,
            total_pages,
            highest_daily_pace,
            overall_status,
            start_date,
            end_date,
            end_label,
            end_name,
            stats_options,
        )
        self.render_summary(
            section_plans,
            total_pages,
            highest_daily_pace,
            overall_status,
            start_date,
            end_date,
            end_label,
            end_name,
            stats_options,
        )
        self.render_plan_tables(section_plans)
        if autosave:
            self.autosave_json()
        elif not any(section.books for section in self.sections):
            self.set_status("Add at least one book")

    def render_summary(
        self,
        section_plans,
        total_pages: int,
        highest_daily_pace: float,
        overall_status: str,
        start_date: date,
        end_date: date,
        end_label: str,
        end_name: str,
        stats_options: SummaryStatsOptions,
    ) -> None:
        physical_plan = section_plan_by_label(section_plans, PHYSICAL_BOOKS_LABEL)
        digital_plan = section_plan_by_label(section_plans, DIGITAL_BOOKS_LABEL)
        audiobook_plan = section_plan_by_label(section_plans, AUDIOBOOKS_LABEL)
        lines = [
            "Reading plan",
            f"Start date: {start_date.isoformat()}",
            f"{end_label}: {end_date.isoformat()}",
            f"Remaining pages: {total_pages}",
            f"Physical remaining pages: {physical_plan.total_pages}",
            f"Digital remaining pages: {digital_plan.total_pages}",
            f"Audiobook remaining time: {format_duration(audiobook_plan.total_pages)}",
            f"Highest remaining daily pace: {highest_daily_pace:.2f} pages/day",
            f"Audiobook remaining daily time: {format_duration(audiobook_plan.daily_pace)}/day",
            f"Status: {overall_status}",
        ]
        for label, value in optional_summary_stat_rows(
            section_plans,
            start_date,
            end_date,
            highest_daily_pace,
            stats_options,
            self.rest_days,
        ):
            lines.append(f"{label}: {value}")

        detail_lines = list(lines)
        for section_plan in section_plans:
            detail_lines.append("")
            detail_lines.append(section_plan.section.label)
            if not section_plan.deadlines:
                detail_lines.append("No books.")
                continue
            detail_lines.append(f"Remaining daily pace: {section_daily_pace(section_plan)}")
            detail_lines.append(
                final_result_message(
                    section_plan.deadlines[-1].deadline, end_date, end_name
                )
            )
        self.set_text(self.summary_text, "\n".join(lines) + "\n")
        self.set_text(self.plan_text, "\n".join(detail_lines) + "\n")

    def render_plan_tables(self, section_plans) -> None:
        for section_plan in section_plans:
            table = self.plan_tables[section_plan.section.label]
            for child in table.winfo_children():
                child.destroy()
            columns = plan_columns(section_plan.section.label)
            for column_index, column in enumerate(columns):
                self.add_plan_table_cell(
                    table,
                    text=column,
                    row=0,
                    column=column_index,
                    column_name=column,
                    is_header=True,
                )
            for row_index, deadline in enumerate(section_plan.deadlines, start=1):
                book = deadline.book
                if is_audiobook_section(section_plan.section.label):
                    values = {
                        "Book": book.number,
                        "Title": book.title,
                        "Daily time": format_duration(deadline.daily_pages),
                        "Start time": format_duration(book.start_page),
                        "End time": format_duration(book.end_page),
                        "Duration": format_duration(total_units(book, section_plan.section.label)),
                        "Remaining time": format_duration(remaining_units(book, section_plan.section.label)),
                        "Start date": deadline.start_date.isoformat(),
                        "Deadline": deadline.deadline.isoformat(),
                        "Days allocated": deadline.days_allocated,
                        "Status": deadline.status,
                    }
                else:
                    values = {
                        "Book": book.number,
                        "Title": book.title,
                        "Daily pages": f"{deadline.daily_pages:.2f}",
                        "Start page": book.start_page,
                        "End page": book.end_page,
                        "Current page": (
                            "" if book.current_page is None else book.current_page
                        ),
                        "Pages": book.pages,
                        "Remaining": pages_remaining(book),
                        "Start date": deadline.start_date.isoformat(),
                        "Deadline": deadline.deadline.isoformat(),
                        "Days allocated": deadline.days_allocated,
                        "Status": deadline.status,
                    }
                for column_index, column in enumerate(columns):
                    self.add_plan_table_cell(
                        table,
                        text=str(values[column]),
                        row=row_index,
                        column=column_index,
                        column_name=column,
                        is_header=False,
                    )

    def add_plan_table_cell(
        self,
        parent: tk.Frame,
        text: str,
        row: int,
        column: int,
        column_name: str,
        is_header: bool,
    ) -> None:
        is_daily_pages = column_name in {"Daily pages", "Daily time"}
        background = "#f3f4f6" if is_header else "#ffffff"
        foreground = "#111827"
        if is_daily_pages:
            background = DAILY_PAGES_PURPLE_DARK if is_header else DAILY_PAGES_PURPLE
            foreground = "#ffffff"
        cell = tk.Label(
            parent,
            text=text,
            anchor="w",
            padx=8,
            pady=5,
            width=PLAN_COLUMN_WIDTHS[column_name],
            bg=background,
            fg=foreground,
            bd=1,
            relief="solid",
            font=("TkDefaultFont", 9, "bold" if is_header else "normal"),
        )
        cell.grid(row=row, column=column, sticky="nsew")

    def clear_plan_output(self) -> None:
        for table in self.plan_tables.values():
            for child in table.winfo_children():
                child.destroy()
        self.set_text(self.summary_text, "")
        self.set_text(self.plan_text, "")

    def autosave_json(self) -> None:
        if self.suspend_autosave:
            return
        try:
            start_date, end_date, end_label, _end_name = self.current_dates()
            write_json_plan(
                str(self.file_path),
                self.sections,
                start_date,
                end_date,
                end_label,
                self.current_stats_options(),
                self.rest_days,
            )
        except (OSError, ValueError) as error:
            self.set_status(f"Autosave failed: {error}", error=True)
            return
        self.file_var.set(str(self.file_path))
        self.set_status(f"Saved {self.file_path}")

    def current_plan_for_save(self):
        self.refresh_plan(autosave=False)
        if self.cached_plan is None:
            raise ValueError("plan cannot be calculated")
        return self.cached_plan

    def set_text(self, widget: tk.Text, value: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", value)
        widget.configure(state="disabled")

    def set_status(self, message: str, error: bool = False) -> None:
        self.status_var.set(message)
        self.status_label.configure(foreground="#a11" if error else "#164")

    def section_by_label(self, label: str) -> BookSection:
        for section in self.sections:
            if section.label == label:
                return section
        raise ValueError(f"unknown section: {label}")

    def book_choice(self, book: Book) -> str:
        return f"{book.number}. {book.title}"

    def selected_session_book(self) -> tuple[BookSection, Book] | None:
        try:
            section = self.section_by_label(self.session_section_var.get())
        except ValueError:
            return None
        raw_choice = self.session_book_var.get()
        if not raw_choice:
            return None
        try:
            book_number = int(raw_choice.split(".", 1)[0])
        except ValueError:
            return None
        for book in section.books:
            if book.number == book_number:
                return section, book
        return None

    def add_session(self) -> None:
        selected = self.selected_session_book()
        if selected is None:
            self.show_error("Select a book first")
            return
        section, book = selected
        try:
            session_date = parse_date(self.session_date_var.get().strip())
            if is_audiobook_section(section.label):
                current_page = current_time_from_remaining(
                    book, parse_duration(self.session_current_page_var.get().strip())
                )
            else:
                current_page = int(self.session_current_page_var.get().strip())
            add_reading_session(book, session_date, current_page, section.label)
        except ValueError as error:
            self.show_error(str(error))
            return
        self.session_current_page_var.set("")
        self.after_state_change()

    def delete_session(self) -> None:
        selection = self.session_tree.selection()
        if not selection:
            self.show_error("Select a session first")
            return
        try:
            section_index, book_index, session_index = (
                int(part) for part in selection[0].split(":")
            )
            book = self.sections[section_index].books[book_index]
            remove_reading_session(book, session_index)
        except (IndexError, ValueError) as error:
            self.show_error(str(error))
            return
        self.after_state_change()

    def selected_book_index(self, label: str) -> int | None:
        tree = self.book_trees[label]
        selection = tree.selection()
        if not selection:
            return None
        try:
            return int(selection[0]) - 1
        except ValueError:
            return None

    def load_selected_book(self, label: str) -> None:
        index = self.selected_book_index(label)
        if index is None:
            return
        section = self.section_by_label(label)
        if index >= len(section.books):
            return
        book = section.books[index]
        self.title_vars[label].set(book.title)
        self.start_page_vars[label].set(display_value(label, book.start_page))
        self.end_page_vars[label].set(display_value(label, book.end_page))

    def read_book_fields(
        self,
        label: str,
        default_title: str | None = None,
        default_start_page: int | None = None,
        default_end_page: int | None = None,
    ) -> tuple[str, int, int] | None:
        title = self.title_vars[label].get().strip() or (default_title or "")
        if not title:
            self.show_error("Book title is required")
            return None
        raw_start_page = self.start_page_vars[label].get().strip()
        raw_end_page = self.end_page_vars[label].get().strip()
        try:
            if is_audiobook_section(label):
                start_page = (
                    default_start_page
                    if not raw_start_page and default_start_page is not None
                    else parse_duration(raw_start_page)
                )
                end_page = (
                    default_end_page
                    if not raw_end_page and default_end_page is not None
                    else parse_duration(raw_end_page)
                )
            else:
                start_page = (
                    default_start_page
                    if not raw_start_page and default_start_page is not None
                    else int(raw_start_page)
                )
                end_page = (
                    default_end_page
                    if not raw_end_page and default_end_page is not None
                    else int(raw_end_page)
                )
        except ValueError:
            if is_audiobook_section(label):
                self.show_error("Start time and end time must be HH:MM or HH:MM:SS")
            else:
                self.show_error("Start page and end page must be whole numbers")
            return None
        if is_audiobook_section(label) and start_page < 0:
            self.show_error("Start time cannot be negative")
            return None
        if not is_audiobook_section(label) and start_page < 0:
            self.show_error("Start page cannot be negative")
            return None
        if end_page < start_page:
            if is_audiobook_section(label):
                self.show_error("End time must be on or after the start time")
            else:
                self.show_error("End page must be on or after the start page")
            return None
        return title, start_page, end_page

    def add_book(self, label: str) -> None:
        section = self.section_by_label(label)
        position = len(section.books) + 1
        values = self.read_book_fields(
            label,
            default_title=f"Book {position}",
            default_start_page=0 if is_audiobook_section(label) else 1,
        )
        if values is None:
            return
        title, start_page, end_page = values
        section.books.append(
            Book(
                number=position,
                title=title,
                start_page=start_page,
                end_page=end_page,
            )
        )
        renumber_books(section.books)
        self.after_book_edit(label, select_index=position - 1)

    def insert_book_before_selection(self, label: str) -> None:
        section = self.section_by_label(label)
        index = self.selected_book_index(label)
        if index is None:
            self.show_error("Select a book first")
            return
        position = index + 1
        if insertion_splits_simultaneous_group(position, section.simultaneous_groups):
            self.show_error("Insert before or after the simultaneous group instead")
            return
        values = self.read_book_fields(
            label,
            default_title=f"Book {position}",
            default_start_page=0 if is_audiobook_section(label) else 1,
        )
        if values is None:
            return
        title, start_page, end_page = values
        section.books.insert(
            index,
            Book(
                number=position,
                title=title,
                start_page=start_page,
                end_page=end_page,
            ),
        )
        renumber_books(section.books)
        section.simultaneous_groups = remap_simultaneous_groups_after_addition(
            section.simultaneous_groups, position, section.books
        )
        self.after_book_edit(label, select_index=index)

    def replace_selected_book(self, label: str) -> None:
        section = self.section_by_label(label)
        index = self.selected_book_index(label)
        if index is None:
            self.show_error("Select a book first")
            return
        old_book = section.books[index]
        values = self.read_book_fields(
            label,
            default_title=old_book.title,
            default_start_page=old_book.start_page,
            default_end_page=old_book.end_page,
        )
        if values is None:
            return
        title, start_page, end_page = values
        current_page = (
            old_book.current_page
            if old_book.current_page is not None
            and start_page <= old_book.current_page <= end_page
            else None
        )
        reading_sessions = (
            old_book.reading_sessions
            if start_page == old_book.start_page and end_page == old_book.end_page
            else []
        )
        section.books[index] = Book(
            number=old_book.number,
            title=title,
            start_page=start_page,
            end_page=end_page,
            current_page=current_page,
            reading_sessions=reading_sessions,
            baseline_schedule=old_book.baseline_schedule,
        )
        self.after_book_edit(label, select_index=index)

    def delete_selected_book(self, label: str) -> None:
        section = self.section_by_label(label)
        index = self.selected_book_index(label)
        if index is None:
            self.show_error("Select a book first")
            return
        deleted_book_id = index + 1
        section.books.pop(index)
        renumber_books(section.books)
        section.simultaneous_groups = remap_simultaneous_groups_after_deletion(
            section.simultaneous_groups, deleted_book_id, section.books
        )
        next_index = min(index, len(section.books) - 1)
        self.after_book_edit(label, select_index=next_index if next_index >= 0 else None)

    def move_selected_book(self, label: str, offset: int) -> None:
        section = self.section_by_label(label)
        index = self.selected_book_index(label)
        if index is None:
            self.show_error("Select a book first")
            return
        selected_book = section.books[index]
        old_group_book_ids = [
            [id(section.books[book_id - 1]) for book_id in group]
            for group in section.simultaneous_groups
        ]
        start, end = self.move_block_range(section, index)
        if offset < 0:
            if start == 0:
                return
            adjacent_start, adjacent_end = self.move_block_range(section, start - 1)
            moving_block = section.books[start : end + 1]
            adjacent_block = section.books[adjacent_start : adjacent_end + 1]
            section.books[adjacent_start : end + 1] = moving_block + adjacent_block
        else:
            if end == len(section.books) - 1:
                return
            adjacent_start, adjacent_end = self.move_block_range(section, end + 1)
            moving_block = section.books[start : end + 1]
            adjacent_block = section.books[adjacent_start : adjacent_end + 1]
            section.books[start : adjacent_end + 1] = adjacent_block + moving_block

        renumber_books(section.books)
        section.simultaneous_groups = self.remap_groups_by_book_identity(
            section.books, old_group_book_ids
        )
        selected_index = next(
            index
            for index, book in enumerate(section.books)
            if book is selected_book
        )
        self.after_book_edit(label, select_index=selected_index)

    def move_block_range(self, section: BookSection, index: int) -> tuple[int, int]:
        book_id = index + 1
        for group in section.simultaneous_groups:
            if book_id in group:
                return group[0] - 1, group[-1] - 1
        return index, index

    def remap_groups_by_book_identity(
        self, books: list[Book], old_group_book_ids: list[list[int]]
    ) -> list[tuple[int, ...]]:
        new_book_ids = {id(book): book.number for book in books}
        remapped_groups = [
            tuple(sorted(new_book_ids[book_identity] for book_identity in group))
            for group in old_group_book_ids
        ]
        return validate_simultaneous_groups(books, remapped_groups)

    def apply_groups(self, label: str) -> None:
        section = self.section_by_label(label)
        try:
            groups = validate_simultaneous_groups(
                section.books, parse_group_text(self.group_vars[label].get())
            )
        except ValueError as error:
            self.show_error(str(error))
            return
        section.simultaneous_groups = groups
        section.baseline_needs_recalculation = True
        self.after_state_change()

    def clear_groups(self, label: str) -> None:
        section = self.section_by_label(label)
        section.simultaneous_groups = []
        section.baseline_needs_recalculation = True
        self.after_state_change()

    def after_book_edit(self, label: str, select_index: int | None = None) -> None:
        self.section_by_label(label).baseline_needs_recalculation = True
        self.refresh_book_tables()
        self.refresh_group_entries()
        if select_index is not None:
            section = self.section_by_label(label)
            if 0 <= select_index < len(section.books):
                tree = self.book_trees[label]
                iid = str(select_index + 1)
                tree.selection_set(iid)
                tree.focus(iid)
                tree.see(iid)
                self.load_selected_book(label)
        self.refresh_session_books()
        self.refresh_session_table()
        self.refresh_plan(autosave=True)

    def after_state_change(self) -> None:
        self.refresh_all(autosave=True)

    def show_error(self, message: str) -> None:
        self.set_status(message, error=True)
        messagebox.showerror("Reading Plan", message)


def main() -> None:
    app = ReadingPlanApp()
    app.mainloop()


if __name__ == "__main__":
    main()
