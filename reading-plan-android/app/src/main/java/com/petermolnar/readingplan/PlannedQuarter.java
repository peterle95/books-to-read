package com.petermolnar.readingplan;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.petermolnar.readingplan.BookCollections.*;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class PlannedQuarter {
    final LocalDate startDate;
    final List<BookSection> sections;

    PlannedQuarter(LocalDate startDate, List<BookSection> sections) {
        this.startDate = startDate;
        this.sections = sections;
    }

    static PlannedQuarter fromJson(MainActivity activity, Object raw, List<BookSection> current) throws JSONException {
        if (raw == null || raw == JSONObject.NULL) return null;
        if (!(raw instanceof JSONObject)) throw new IllegalArgumentException("planned_quarter must be an object");
        JSONObject value = (JSONObject) raw;
        LocalDate start = LocalDate.parse(value.getString("start_date"));
        if (start.getDayOfMonth() != 1 || (start.getMonthValue() - 1) % 3 != 0)
            throw new IllegalArgumentException("planned quarter must start on a calendar quarter boundary");
        JSONArray rawSections = value.getJSONArray("sections");
        Set<String> labels = new HashSet<>();
        Set<String> ids = new HashSet<>();
        for (BookSection section : current) for (Book book : section.books) ids.add(book.id);
        List<BookSection> sections = new ArrayList<>();
        for (int i = 0; i < rawSections.length(); i++) {
            JSONObject rawSection = rawSections.getJSONObject(i);
            String label = rawSection.getString("label");
            if (!MainActivity.BOOK_SECTION_LABELS.contains(label) || !labels.add(label))
                throw new IllegalArgumentException("planned quarter has an invalid or duplicate section");
            JSONArray books = rawSection.getJSONArray("books");
            for (int j = 0; j < books.length(); j++) {
                JSONObject book = books.getJSONObject(j);
                String id = book.getString("id");
                if (id.trim().isEmpty() || !ids.add(id) || book.has("reading_sessions"))
                    throw new IllegalArgumentException("planned books need unique IDs and no reading history");
            }
            BookSection section = activity.bookSectionFromJson(rawSection, label, false, true);
            for (Book book : section.books) if (completedUnits(book, label) != 0)
                throw new IllegalArgumentException("planned books cannot have reading progress");
            sections.add(section);
        }
        if (labels.size() != MainActivity.BOOK_SECTION_LABELS.size())
            throw new IllegalArgumentException("planned quarter must contain all three book sections");
        return new PlannedQuarter(start, sections);
    }

    JSONObject toJson(MainActivity activity) throws JSONException {
        JSONObject value = new JSONObject();
        value.put("start_date", startDate.toString());
        JSONArray array = new JSONArray();
        for (BookSection section : sections) {
            JSONObject raw = activity.bookSectionToJson(section);
            JSONArray books = raw.getJSONArray("books");
            for (int i = 0; i < books.length(); i++) books.getJSONObject(i).remove("reading_sessions");
            array.put(raw);
        }
        value.put("sections", array);
        return value;
    }

    List<BookSection> activate(List<BookSection> current, LocalDate today) {
        if (today.isBefore(startDate)) return null;
        List<BookSection> result = blankSections();
        for (BookSection target : result) {
            for (List<BookSection> source : java.util.Arrays.asList(current, sections)) {
                BookSection section = null;
                for (BookSection candidate : source) if (candidate.label.equals(target.label)) section = candidate;
                Map<Integer, Integer> numbers = new HashMap<>();
                for (Book book : section.books) {
                    if (unitsRemaining(book, section.label) <= 0) continue;
                    int number = target.books.size() + 1;
                    numbers.put(book.number, number);
                    target.books.add(new Book(number, book.title, book.startPage, book.endPage,
                            book.currentPage, new ArrayList<>(book.readingSessions), null, null, null, null, book.id));
                }
                for (List<Integer> group : section.simultaneousGroups) {
                    List<Integer> kept = new ArrayList<>();
                    for (Integer number : group) if (numbers.containsKey(number)) kept.add(numbers.get(number));
                    if (kept.size() > 1) target.simultaneousGroups.add(kept);
                }
            }
        }
        return result;
    }
}
