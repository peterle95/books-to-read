package com.petermolnar.readingplan.model;

import java.util.List;

public class SectionPlan {
    public final BookSection section;
    public final List<BookDeadline> deadlines;
    public final double dailyPace;
    public final int totalPages;
    public final double requiredPace;
    public final String overallStatus;

    public SectionPlan(BookSection section, List<BookDeadline> deadlines, double dailyPace, int totalPages, double requiredPace, String overallStatus) {
        this.section = section;
        this.deadlines = deadlines;
        this.dailyPace = dailyPace;
        this.totalPages = totalPages;
        this.requiredPace = requiredPace;
        this.overallStatus = overallStatus;
    }
}