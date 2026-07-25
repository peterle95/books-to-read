package com.petermolnar.readingplan.model;

import java.util.List;

public class PlanSummary {
    public final List<SectionPlan> sectionPlans;
    public final int totalPages;
    public final double highestDailyPace;
    public final String overallStatus;

    public PlanSummary(List<SectionPlan> sectionPlans, int totalPages, double highestDailyPace, String overallStatus) {
        this.sectionPlans = sectionPlans;
        this.totalPages = totalPages;
        this.highestDailyPace = highestDailyPace;
        this.overallStatus = overallStatus;
    }
}