package com.petermolnar.readingplan.model;

import java.time.LocalDate;

public class RestDayRange {
    public final LocalDate startDate;
    public final LocalDate endDate;

    public RestDayRange(LocalDate startDate, LocalDate endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
    }
}