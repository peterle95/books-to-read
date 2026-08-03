package com.petermolnar.readingplan;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.petermolnar.readingplan.BookCollections.validateSimultaneousGroups;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingPlanScheduler {
    private final MainActivity activity;

    ReadingPlanScheduler(MainActivity activity) {
        this.activity = activity;
    }

    void calculateBaselineSchedules(List<BookSection> planSections, LocalDate planStart, LocalDate planEnd) {
        for (BookSection section : planSections) {
            int sectionUnits = 0;
            for (Book book : section.books) {
                sectionUnits += totalUnits(book, section.label);
            }
            double dailyPace = section.books.isEmpty()
                    ? 0.0
                    : activity.availableReadingDaysCount(planStart, planEnd) == 0
                    ? 0.0
                    : (double) sectionUnits / activity.availableReadingDaysCount(planStart, planEnd);
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

    void recalculateBaselineSchedules(List<BookSection> planSections, LocalDate planStart, LocalDate planEnd) {
        for (BookSection section : planSections) {
            int sectionUnits = 0;
            for (Book book : section.books) {
                sectionUnits += unitsRemaining(book, section.label);
            }
            double dailyPace = section.books.isEmpty()
                    ? 0.0
                    : activity.availableReadingDaysCount(planStart, planEnd) == 0
                    ? 0.0
                    : (double) sectionUnits / activity.availableReadingDaysCount(planStart, planEnd);
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

    void applyDeadlineOverride(BookSection section, Book book, LocalDate override, LocalDate planEnd) {
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
        LocalDate paceStart = activity.effectiveRemainingStartDate(start, deadline, LocalDate.now());
        int availableDays = activity.availableReadingDaysCount(paceStart, deadline);
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
                LocalDate groupStart = activity.effectiveRemainingStartDate(reference.startDate, reference.deadline, LocalDate.now());
                int groupDays = activity.availableReadingDaysCount(groupStart, reference.deadline);
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

    void applyStartDateOverride(BookSection section, Book book, LocalDate override, LocalDate planStart) {
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
        LocalDate paceStart = activity.effectiveRemainingStartDate(start, deadline, LocalDate.now());
        int availableDays = activity.availableReadingDaysCount(paceStart, deadline);
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

    void invalidateBaselineSchedules(BookSection section) {
        section.baselineNeedsRecalculation = true;
    }

    PlanSummary buildRemainingPlans() {
        List<SectionPlan> plans = new ArrayList<>();
        for (BookSection section : activity.sections) {
            plans.add(buildRemainingSectionPlan(section, activity.startDate, activity.endDate, LocalDate.now()));
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
        LocalDate remainingStart = activity.effectiveRemainingStartDate(start, end, today);
        int periodDays = activity.availableReadingDaysCount(remainingStart, end);
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
            LocalDate paceStart = activity.effectiveRemainingStartDate(baseline.startDate, baseline.deadline, today);
            int availableDays = activity.availableReadingDaysCount(paceStart, baseline.deadline);
            int remaining = unitsRemaining(deadline.book, plan.section.label);
            double dailyPages = remaining == 0 || availableDays == 0 ? 0.0 : (double) remaining / availableDays;

            deadlines.add(new BookDeadline(
                    deadline.book,
                    deadline.cumulativePages,
                    baseline.startDate,
                    baseline.deadline,
                    activity.availableReadingDaysCount(baseline.startDate, baseline.deadline),
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
        int periodDays = activity.availableReadingDaysCount(start, end);
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
        List<LocalDate> readingDates = activity.availableReadingDays(start, end);
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
}
