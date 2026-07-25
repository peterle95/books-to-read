package com.petermolnar.readingplan.model;

public class StatsOptions {
    public final boolean bookCounts;
    public final boolean pageShare;
    public final boolean averagePages;
    public final boolean readingPeriod;
    public final boolean paceDriver;

    public StatsOptions(boolean bookCounts, boolean pageShare, boolean averagePages, boolean readingPeriod, boolean paceDriver) {
        this.bookCounts = bookCounts;
        this.pageShare = pageShare;
        this.averagePages = averagePages;
        this.readingPeriod = readingPeriod;
        this.paceDriver = paceDriver;
    }
}