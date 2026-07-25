package com.petermolnar.readingplan.model;

import java.util.ArrayList;
import java.util.List;

public class BookSection {
    public final String label;
    public final List<Book> books = new ArrayList<>();
    public List<List<Integer>> simultaneousGroups = new ArrayList<>();
    public boolean baselineNeedsRecalculation;

    public BookSection(String label) {
        this.label = label;
    }
}