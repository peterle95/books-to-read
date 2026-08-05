# Reading Plans

This context defines the language for planning books across a quarterly reading period and tracking progress against that plan.

## Planning

**Reading plan**:
A dated set of books, reading relationships, deadlines, and rest days that describes the intended reading work for a planning period.
_Avoid_: Daily calculation, rolling plan

**Baseline schedule**:
The persisted schedule created when a reading plan is calculated, including each book's planned start date, deadline, and daily reading target.
_Avoid_: Current pace, estimate

**Current required pace**:
The daily amount needed from the present date to finish a book's remaining work by its deadline; it does not alter the baseline schedule.
_Avoid_: Daily target, baseline pace

**Reading day**:
A calendar day on which the plan expects reading; it is any plan day not marked as a rest day.
_Avoid_: Available day, active day

**Rest day**:
A plan-wide calendar date on which no book has a reading target.
_Avoid_: Skip day, holiday

**Deadline override**:
An explicit deadline assigned to an individual book after the baseline schedule is calculated.
_Avoid_: Custom pace, reschedule

## Book relationships

**Simultaneous group**:
A consecutive set of books planned as one shared reading stream, normally sharing a start date and deadline while their daily targets are split by their remaining work.
_Avoid_: Bundle, series

**Independent schedule**:
A book schedule that is no longer governed by a simultaneous group's shared deadline, while retaining its assigned start date.
_Avoid_: Ungrouped book, detached book

## Reading history

**Reading session**:
A recorded instance of reading part of a book on a calendar date, including the resulting page position or time remaining.
_Avoid_: Entry, log item

**Reading history**:
The collection of a book's reading sessions, used to review and manage how reading progressed over time.
_Avoid_: Entries list, activity feed

**Day group**:
A reading-history summary for one calendar date, combining that day's total reading and, when applicable, its individual reading sessions.
_Avoid_: Daily entry, date card
