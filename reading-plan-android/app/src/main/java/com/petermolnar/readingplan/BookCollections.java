package com.petermolnar.readingplan;
import java.util.*;

final class BookCollections {
    private BookCollections() {
    }

    static List<List<Integer>> remapGroupsByBookIdentity(List<Book> books, List<List<Book>> oldGroups) {
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
    static List<List<Integer>> validateSimultaneousGroups(List<Book> books, List<List<Integer>> groups) {
        return validateSimultaneousGroups(books, groups, true);
    }
    static List<List<Integer>> validateSimultaneousGroups(List<Book> books, List<List<Integer>> groups, boolean requireConsecutive) {
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
                if (requireConsecutive && group.get(i) != group.get(0) + i) {
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
    static List<List<Integer>> remapGroupsAfterDeletion(List<List<Integer>> groups, int deletedBookId, List<Book> books) {
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
    static List<List<Integer>> remapGroupsAfterAddition(List<List<Integer>> groups, int newBookPosition, List<Book> books) {
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
    static List<Integer> insertionSplitsSimultaneousGroup(int position, List<List<Integer>> groups) {
        for (List<Integer> group : groups) {
            if (group.get(0) < position && position <= group.get(group.size() - 1)) {
                return group;
            }
        }
        return null;
    }
    static List<List<Integer>> parseGroupText(String rawText) {
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
    static List<List<Integer>> parseCsvGroups(List<Book> books, String rawGroups, String label) {
        try {
            return validateSimultaneousGroups(books, parseGroupText(rawGroups));
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("invalid " + label + " simultaneous groups: " + ex.getMessage());
        }
    }
    static BookSection sectionByLabelFromList(List<BookSection> list, String label) {
        for (BookSection section : list) {
            if (section.label.equals(label)) {
                return section;
            }
        }
        throw new IllegalArgumentException("unknown section: " + label);
    }
    static SectionPlan sectionPlanByLabel(List<SectionPlan> plans, String label) {
        for (SectionPlan plan : plans) {
            if (plan.section.label.equals(label)) {
                return plan;
            }
        }
        throw new IllegalArgumentException("unknown section: " + label);
    }
    static List<BookSection> blankSections() {
        List<BookSection> list = new ArrayList<>();
        list.add(new BookSection(MainActivity.PHYSICAL_BOOKS_LABEL));
        list.add(new BookSection(MainActivity.DIGITAL_BOOKS_LABEL));
        list.add(new BookSection(MainActivity.AUDIOBOOKS_LABEL));
        return list;
    }
    static void renumberBooks(List<Book> books) {
        for (int i = 0; i < books.size(); i++) {
            books.get(i).number = i + 1;
        }
    }
}
