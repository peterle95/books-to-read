# Reading Plan web app

This early web app stores a text draft separately from an imported desktop bundle. It does not edit the structured bundle or synchronize with other apps. Clearing site data or losing the device can erase both; keep backups.

## Transfer a bundle

Select `plan.json`, `books.json`, `sessions.json`, and `manifest.json` together, then import. Validation runs before confirmation; confirming replaces the previously stored bundle, not the text draft. To transfer back, download the bundle ZIP, extract its four files into an empty folder, and open that folder in the desktop app. The original file bytes are preserved.

There is no merge or automatic sync. Use one active editor at a time: finish and export from one app before importing into the other, and keep a backup before replacement. Changes made independently in two places cannot be combined here.

## Schedule the plan

After importing a bundle, set the plan start and finish dates and add any rest-day ranges. **Calculate schedule** stores a baseline schedule for every book in all three sections: physical and digital books are measured in pages, audiobooks in seconds. Rest days remove reading days from the pace without moving the baseline dates.

The table keeps two separate values. The **baseline per day** is the persisted target created when the schedule was calculated. **Required now** is the amount needed each reading day, from today to that book's baseline finish, to finish the remaining work; it never changes the baseline. Editing the plan dates or rest days marks the schedule as changed and leaves the saved baseline alone until you calculate again. Importing a bundle resets the saved schedule because it belongs to the replaced bundle.

Simultaneous groups stored in a bundle are scheduled together, as in the desktop app. To plan one, choose a section, tick two or more adjacent books, and select **Group selected books**. The members share a start date and finish while their daily targets are split in proportion to their remaining work. A group change marks the schedule as changed and applies on the next calculation; removing a group returns its books to the ordinary order.

A **deadline override** gives one book an independent schedule immediately: its baseline finish becomes the override date and its target is recalculated from its remaining work. When the book belongs to a group, the other members stay grouped with their shared schedule. **Clear** returns the book to the plan finish date, or to the group's shared finish when another group member still supplies one.

Groups and overrides belong to the imported bundle's saved schedule: they persist across reloads and are cleared when a bundle is imported. Start-date overrides saved by another app stay in the bundle but are not editable here.

## Plan the next quarter

Each imported bundle can carry a next-quarter plan. Set the quarter start to 1 January, 1 April, 1 July or 1 October, then add planned books with a section, title and page or second range. **Save quarter start** and **Add planned book**, like **Remove**, write the plan into `books.json` and re-checksum the bundle; the other files keep their imported bytes.

Rollover runs once, automatically, when the app opens or is used on or after the planned start date. Unfinished books carry forward first with their stable IDs and reading history, completed books leave the plan, and the baseline schedule is recalculated for the quarter containing today. Rest-day ranges that end before the new start date are dropped. The activated plan, its recalculated baseline and the trimmed rest days are written to the bundle, so an export after rollover transfers the activated plan to the desktop app.

## Deploy and install

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. A push to `main` or a manually started **Deploy web app** workflow publishes this directory. Confirm the workflow succeeds and open its Pages URL over HTTPS. On Android, use the browser's **Install app** or **Add to Home screen** menu. Wording and availability depend on the browser.

## Verify on a real device

1. Open the Pages URL online on Android and install the app from the browser menu.
2. Open the installed app, save a plan, and reload to check it remains.
3. Wait for the initial load to finish, close the app, enable airplane mode, and reopen it. Check the plan is still there and can be edited and saved.
4. Disable airplane mode and confirm the original native and desktop apps have not been changed.

Real-device verification has not been performed by the automated tests. PWA installation and offline storage behavior vary by browser and operating system.

## Automated checks

From the repository root, run `npm ci`, `npx playwright install chromium`, and `npm run test:web`. The tests serve the app at a repository-like subpath, verify persistence and an offline reload in Chromium, and compare the browser's baseline schedules, simultaneous groups, deadline overrides, required pace and quarter rollover with the desktop calculation model in `reading_plan.py`, so Python must be available as `python`.
