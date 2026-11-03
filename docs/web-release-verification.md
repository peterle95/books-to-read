# Web switch verification — issue #44

Status: **not approved for switching yet**. Automated Chromium checks are not
actual Android/desktop device evidence. Keep the native Android and desktop apps.

## Feature inventory

| Native Android feature | Web status / remaining check |
| --- | --- |
| Physical, digital and audio books | Add/edit/delete and insert/reorder by position; verify on phone |
| Reading sessions and history | Record, review, edit/delete, backdate; canonical ordering and tombstones; verify on phone |
| Plan dates, rest days, baseline schedule, current required pace | Web forms and tables; verify exported changes on desktop |
| Simultaneous groups and deadline overrides | Web forms; verify transfer and phone usability |
| Next-quarter plan and activation | Add/edit/remove books and quarter start; stable IDs retained on edits; preview in Metrics |
| Reading projections | Central estimate and approximate 80% finish range in tables and charts; native-style All toggle and focused metrics views |
| Audiobook input | Whole seconds, HH:MM and HH:MM:SS for ranges and remaining time |
| CSV import/export | Desktop-compatible current-plan CSV; deliberately not a complete history/next-quarter backup |
| Syncthing / directory access | Not available in web; manual four-file import and ZIP export only |
| Summary settings and start-date overrides | Editable, persisted in bundles; verify on phone and desktop |
| Desktop snapshot comparison | Desktop-only, intentionally out of scope |

The reader requested all editing conveniences above; they are included in this
implementation. Chart rendering is native-style SVG, not pixel-identical to
Android, and chart display is bounded to ten years around today. The reader
must still confirm usability and numerical results on the actual devices.
Full desktop replacement is not a release goal. No native or desktop app is removed.

## One active editor and safe transfers

1. Finish saves in the source app. Close other tabs/apps that could edit this
   reading plan, including the native app and any synced desktop instance.
2. Copy the complete, stable `reading_plan_data/` directory to a backup. Do not
   select files while another app or Syncthing is changing them.
3. In web, select `plan.json`, `books.json`, `sessions.json`, and `manifest.json`
   together. Export any existing web plan before confirming replacement.
4. Check the imported books, progress, history, dates, rest days, groups,
   overrides and next-quarter plan. Check for automatic quarter activation if
   the saved next-quarter start date has already passed.
5. Make a recognizable web change, wait for its saved message, then export a
   bundle ZIP. Save it outside browser storage and verify the download exists.
6. Extract the ZIP into a **new empty directory**, never over a live/synced plan.
   Open that directory on desktop and compare all the fields in step 4,
   including the recognizable change. Preserve the previous directory.
7. Only then make desktop the active editor. For the return trip, finish saves,
   close desktop/native editors, back up, and import the complete four files
   into web again. There is no merge or automatic synchronization.

## Actual-device checklist

Use a copy of the reader's real plan, not the only copy. Record phone/computer
model, OS version, browser/version, installed vs browser-tab mode, deployed URL,
deployment commit, date, observed result, and any limitation for each run.
Do not use private/incognito browsing for the switch.

| Check | Android outcome | Desktop outcome |
| --- | --- | --- |
| HTTPS load and installation from browser menu | Pending | Pending |
| Import copied real plan; inspect all fields above | Pending | Pending |
| Close/reopen online; saved plan persists | Pending | Pending |
| After initial cache load, close, disconnect network, reopen | Pending | Pending |
| Offline add/edit/delete book and backdated reading session; reload | Pending | Pending |
| Export ZIP offline; verify download; open a copy on desktop | Pending | Pending |
| Desktop edit → four-file web import → web edit → desktop load | Pending | Pending |
| Fresh deployment: update notice, no unsolicited reload, saved data survives chosen reload | Pending | Pending |
| Restore exported backup in a disposable browser profile after clearing its site data | Pending | Pending |
| Native Android and desktop apps still operate with original data | Pending | Pending |

For the update check, use two actual deployments. Leave a form edit unsaved
while waiting for the update notice: it must remain untouched until **Reload
to update** is chosen. Save or copy that edit before choosing reload; unsaved
form edits are not a backup. Reopen/refocus online to request discovery; there
is no guaranteed update deadline. Do not substitute the automated simulated
deployment for this check.

## Storage and backup limitations

- Browser site data can be cleared by the reader, browser storage eviction,
  profile removal or device loss. Installing the PWA does not guarantee storage
  durability. A ZIP stored outside the browser is the recovery path.
- A bundle ZIP backs up structured plan data, **not the separate text draft or
  unsaved form fields**. Copy the text draft separately if it matters.
- Update discovery and install availability depend on browser/OS policy.
  Offline use requires a successful initial online load and service-worker cache.
- Downloads can be cancelled or fail after the browser starts them; check the
  ZIP really exists even if the backup reminder disappears.
- Two independently edited copies cannot be merged here. One active editor
  includes browser tabs, not just devices. Manual transfers replace state.

## Automated evidence

Run `npm run test:web` and `python -m unittest discover` from the repository
root. The web tests use an isolated browser and temporary export directories;
they do not edit the reader's authoritative `reading_plan_data/` directory.
Record final results and remaining blockers in #44. Do not close it until the
reader-used feature differences and actual-device outcomes are resolved.

Session evidence (2026-11-03): the eleven focused release workflows passed in
desktop Chromium, including offline edits in all formats, backdated history
correction/deletion, chain repair, copied real-data transfers in both directions,
clock input and planning controls, desktop CSV compatibility, and chart/metrics
navigation, book reorder/deletion, implicit-progress preservation and canonical
ordering when imported contributions already match. The real-data workflow uses a copy of revision 282 (six books,
four recorded sessions) and asserts the source files are unchanged. This is
automated transfer evidence, not desktop GUI or actual Android verification.

The baseline Python suite has two existing failures:
`test_remaining_plan_reflow_excludes_rest_days` and
`test_session_target_starts_from_today_current_page`. They predate these web
changes; retain them as release limitations until triaged, not as passing checks.
