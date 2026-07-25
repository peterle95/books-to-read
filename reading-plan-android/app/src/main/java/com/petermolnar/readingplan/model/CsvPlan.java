package com.petermolnar.readingplan.model;

import java.time.LocalDate;
import java.util.List;

public class CsvPlan {
    public final List<BookSection> sections;
    public final LocalDate startDate;
    public final LocalDate endDate;
    public final String endLabel;
    public final StatsOptions statsOptions;
    public final List<RestDayRange> restDays;

    public CsvPlan(List<BookSection> sections, LocalDate startDate, LocalDate endDate, String endLabel, StatsOptions statsOptions, List<RestDayRange> restDays) {
        this.sections = sections;
        this.startDate = startDate;
        this.endDate = endDate;
        this.endLabel = endLabel;
        this.statsOptions = statsOptions;
        this.restDays = restDays;
    }
}