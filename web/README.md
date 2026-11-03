# Reading Plan web app

An offline web app for structured reading plans, books, reading history, schedules and projections. It also keeps a separate text draft. There is no automatic synchronization. Clearing site data or losing the device can erase saved data; keep exported backups outside the browser.

## Transfer a bundle

Select `plan.json`, `books.json`, `sessions.json`, and `manifest.json` together, then import. Validation runs before confirmation; confirming replaces the previously stored bundle, not the text draft. To transfer back, download the bundle ZIP, extract its four files into a new empty folder, and open that folder in the desktop app. Unedited files retain their original bytes. Structured edits update the affected files and manifest checksums. Positive session-chain amount mismatches are repaired in canonical session order; invalid or regressing progress is rejected before replacement.

There is no merge or automatic sync. Use one active editor at a time, including browser tabs: finish saves and export from one app before importing into the other, and keep a backup before replacement. Changes made independently in two places cannot be combined here. The native Android and desktop apps remain available.

## Books and reading history

Add, edit or delete physical, digital and audio books. Set a position to insert or reorder a book within its format; book edits retain stable IDs and history. Groups that would no longer be consecutive are removed. Page ranges are inclusive. Audiobook range and time-left fields accept whole seconds, `HH:MM` or `HH:MM:SS`.

Record a reading session using a date and page reached, or audiobook time left. History supports backdated and same-day sessions, correction and deletion. Active sessions must advance in canonical order (date, position, stable ID). Contributions are recalculated after edits; deletions retain tombstones and recalculate the remaining history. Progress updates never replace the baseline schedule. Wait for the saved message before closing or transferring.

## CSV compatibility

Import a desktop CSV plan or export the current plan to CSV, including ranges, progress, rest days and simultaneous groups. Import validates before confirmation and replaces current books and history; an existing next-quarter plan is retained. CSV does not contain history, stable IDs, overrides or planned books, so it is not a complete backup. Use bundle ZIPs for complete transfers. Only open trusted CSVs in spreadsheet software, which may interpret titles as formulas.

## Back up

**Export bundle ZIP** backs up the complete structured plan using the four desktop-compatible files, including web edits. It does not include the separate text draft or unsaved form fields; copy those separately if needed. The reminder appears when no backup has been requested on this device or the last request was more than a week ago; exporting resets it. Verify the download completed and keep the ZIP somewhere other than this browser. Installation does not protect browser storage from eviction or deletion.

## Schedule the plan

After importing a bundle, set the plan start and finish dates and add any rest-day ranges. **Calculate schedule** stores a baseline schedule for every book in all three sections: physical and digital books are measured in pages, audiobooks in seconds. Rest days remove reading days from the pace without moving the baseline dates.

The table keeps two separate values. The **baseline per day** is the persisted target created when the schedule was calculated. **Required now** is the amount needed each reading day, from today to that book's baseline finish, to finish the remaining work; it never changes the baseline. Editing the plan dates or rest days marks the schedule as changed and leaves the saved baseline alone until you calculate again. Saved dates, rest days, groups, overrides and baselines are included in bundle exports. Importing a bundle replaces the previous plan and schedule.

Simultaneous groups stored in a bundle are scheduled together, as in the desktop app. To plan one, choose a section, tick two or more adjacent books, and select **Group selected books**. The members share a start date and finish while their daily targets are split in proportion to their remaining work. A group change marks the schedule as changed and applies on the next calculation; removing a group returns its books to the ordinary order.

A **deadline override** gives one book an independent schedule immediately: its baseline finish becomes the override date and its target is recalculated from its remaining work. When the book belongs to a group, the other members stay grouped with their shared schedule. **Clear** returns the book to the plan finish date, or to the group's shared finish when another group member still supplies one.

Set or clear a **start-date override** in the schedule table to choose an independent start while retaining the book's deadline. Its target uses remaining work and available reading days. Overrides persist across recalculation and transfer. Summary settings control the optional metrics and are saved in `plan.json`.

## Reading projections

After importing a bundle, **Reading projections** estimates when each book will be finished from its recorded reading history, separately from the baseline schedule and deadline. The estimate and its approximate 80% range follow the Android forecast in [docs/reading-projections.md](../docs/reading-projections.md): they use the whole history, treat same-day sessions as one day, exclude deleted and future-dated sessions, and skip rest days. A range needs seven completed observation days and positive mean progress; otherwise the table says why it is unavailable. Projections never change the baseline schedule, required pace or stored bundle, and the range is an estimate rather than a guarantee.

**Charts** overlays the baseline plan, actual progress, read/required per day, central projection and approximate 80% range. The left axis is pages/time; the right is pages/time per day. **All** defaults off (slate): only started, unfinished books appear. Turn it on (green) to include completed and unstarted books. Chart display is bounded to ten years around today. **Metrics** opens book schedules and one focused detail view at a time: Summary metrics, Schedule information or Key metrics. A saved next-quarter plan can be previewed without activating it.

## Plan the next quarter

Each imported bundle can carry a next-quarter plan. Set the quarter start to 1 January, 1 April, 1 July or 1 October, then add planned books with a section, title and page or time range. **Edit** changes a planned book while retaining its stable ID; **Remove** deletes it. These actions write the plan into `books.json` and re-checksum the bundle; the other files keep their imported bytes.

Rollover runs once, automatically, when the app opens or is used on or after the planned start date. Unfinished books carry forward first with their stable IDs and reading history, completed books leave the plan, and the baseline schedule is recalculated for the quarter containing today. Rest-day ranges that end before the new start date are dropped. The activated plan, its recalculated baseline and the trimmed rest days are written to the bundle, so an export after rollover transfers the activated plan to the desktop app.

## Deploy and install

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. A push to `main` or a manually started **Deploy web app** workflow publishes this directory. Confirm the workflow succeeds and open its Pages URL over HTTPS. On Android, use the browser's **Install app** or **Add to Home screen** menu. Wording and availability depend on the browser.

## Update the app

Every deployment publishes a new app version. The app looks for an update when it opens or regains focus, but discovery timing is a browser decision and is not promised. When an update is found, a notice at the top of the page says so and the app keeps running: nothing reloads on its own, so an edit in progress is not interrupted. **Reload to update** applies the update when you choose.

Updates replace only the cached app files. The text draft, reading schedule and imported bundle stay in this browser across versions, so no migration step is needed between current versions.

## Release verification

Use the [feature inventory, transfer procedure and actual-device checklist](../docs/web-release-verification.md) for #44. Real-device outcomes are still pending; automated Chromium tests do not approve the switch.

### Verify on a real device

1. Open the Pages URL online on Android and install the app from the browser menu.
2. Open the installed app, import a copied real plan, save a structured book/session edit, and reload to check it remains.
3. Wait for the initial load to finish, close the app, enable airplane mode, and reopen it. Check books, history, schedules, charts and planned books remain available and can be edited and saved.
4. Disable airplane mode and confirm the original native and desktop apps have not been changed.
5. After a new deployment, reopen or refocus the installed app until the update notice appears. Leave an edit unsaved, check the app has not reloaded by itself, then use **Reload to update** and confirm the saved plan, schedule and bundle are still there.
6. Import a bundle, export it, and confirm the backup reminder disappears; open the exported ZIP in the desktop app. Confirm the reminder returns once a week has passed without an export.

Real-device verification has not been performed by the automated tests. PWA installation, update discovery and offline storage behavior vary by browser and operating system.

## Automated checks

From the repository root, run `npm ci`, `npx playwright install chromium`, and `npm run test:web`. Python must be available as `python`. Tests serve the app at a repository-like subpath and cover offline edits, schedules, groups, overrides, history repair, quarter rollover, charts/metrics, CSV, and desktop bundle loading. The release test transfers a copy of the checked-in real plan both ways and checks the source files were untouched. This JavaScript project has no TypeScript/typecheck configuration; use `node --check` for script syntax checks.

The update test publishes a simulated deployment through the test server, then checks that the notice appears without reloading the page, that an edit is untouched, and that saved data survives applying the update. The backup test checks the export, the reminder, and that the reminder returns once the last backup is a week old.
