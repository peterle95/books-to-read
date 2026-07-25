package com.petermolnar.readingplan.model;

import java.time.LocalDate;

public class BaselineSchedule {
    public final LocalDate startDate;
    public final LocalDate deadline;
    public final double dailyTarget;

    public BaselineSchedule(LocalDate startDate, LocalDate deadline, double dailyTarget) {
        this.startDate = startDate;
        this.deadline = deadline;
        this.dailyTarget = dailyTarget;
    }
}