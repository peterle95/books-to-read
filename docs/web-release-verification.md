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
| Next-quarter plan and activation | Add/edit/remove books; the start is derived or preserved from the imported plan, not edited; stable IDs retained on edits; preview in Metrics |
| Reading projections | Central estimate and approximate 80% finish range in tables and charts; native-style All toggle and focused metrics views |
| Audiobook input | Books range fields use HH:MM or HH:MM:SS; session remaining time also accepts whole seconds. Planned-book input differences are tracked in #62 |
| CSV import/export | Desktop-compatible current-plan CSV; deliberately not a complete history/next-quarter backup |
| Syncthing / directory access | Not available in web; manual four-file import and ZIP export only |
| Summary settings and start-date overrides | Imported summary settings are preserved but have no web editor; start-date overrides are editable and persisted. Verify transfer on phone and desktop |
| Desktop snapshot comparison | Desktop-only, intentionally out of scope |

The reader requested all editing conveniences above. As of 2026-11-06, history
edit/delete dialogs with delete confirmation, the native-style simultaneous-group
picker and replacement flow, Books chooser and overrides hierarchy, and header
Settings access are implemented with automated coverage, not visual approval.
The current Android build is the reference for screen structure,
controls, chart content and interactions; chart/design divergence is **not** an
accepted release exception. Web charts use SVG and display is bounded to ten
years around today, but their presentation and behavior still need comparison
against Android. The reader must confirm usability and numerical results on
actual devices. Full desktop replacement is not a release goal. No native or
desktop app is removed.

## Android → web parity (in progress)

Compare against the **current Android build**, not an older mockup. Scope is
responsive mobile **and** desktop web layouts, with the same reader-used features
and Android screen hierarchy, controls and visual presentation. Visual differences
are not a second release exception. The only accepted exception is synchronization: Android
directory/Syncthing access becomes manual four-file import and ZIP export on web,
with one active editor and no automatic merge or sync.

Browser-native controls are **not** an approved exception. Custom Android-style
calendar and selection controls are integrated and covered by automated tests;
their integration is not visual sign-off.

| Area | Web implementation / parity evidence | Remaining before release |
| --- | --- | --- |
| Session | Session entry, targets and history actions implemented; focused browser contract covers page/audio corrections and deletions | Compare layout, history sheet and interactions with Android; actual-device check |
| Plan | Dates, rest days, next quarter and New plan flows implemented; transactional next-quarter editor and stale-draft guard covered, including rollover; browser workflows cover draft retention and export | Compare Android controls, schedule values and responsive presentation; actual-device check |
| Books | Three formats, Today reading, ordering, native-style chooser, overrides hierarchy and simultaneous-group picker/replacement implemented; browser workflows cover these controls, moves, completion and transfer | Compare editing on phone and desktop web against Android; actual-device check |
| Charts | Single-book selection, All, projection toggle and Metrics action in the chart header implemented; focused browser checks cover chart elements and header placement | Compare plots, labels, scales and visual design against Android; numerical and actual-device check |
| Settings | Header Settings access with wrench icon, bundle transfer and imported summary-option preservation implemented; browser checks cover header navigation and backup flow | Compare Android screen structure and backup flow; actual-device check |
| History / metrics sheets | History edit/delete dialogs with delete confirmation and focused metrics tables with current required pace implemented; browser checks cover cancellation, validation, stale targets, pace calculations and sheet controls | Compare sheet content, gestures, dimensions and mobile/desktop behavior with Android; actual-device check |

Reference evidence collected so far: Android emulator screenshots of Session,
Plan, Books, Charts and Settings were saved in external temporary storage; web
captures of Session, Plan, Books and Charts were also saved there. Browser visual
tests in `web-tests/visual-parity.spec.js` capture all five screens at mobile,
tablet and desktop viewports and check geometry/containment and navigation. They
do not compare screenshots with Android references and do not load populated
plan fixtures. Populated synthetic fixtures now cover first-fold layout at
360×732 and chooser, group and history controls in
`web-tests/visible-layout-parity.spec.js`; these layout changes are implemented
with automated coverage, **not visual approval**. A fresh same-data Android/web
comparison is actively pending, including populated books, groups, overrides,
history, charts and open dialogs/sheets.
The comparisons in `docs/evidence/issue-51/verification.md` preserve native and
web images and record unresolved differences; the native clock was not frozen and
the native bundle bytes are unknown, so they do not establish complete parity.
A 2026-11-07 round against supplied current-build references resolved the
rest-day separator and label text, blank date fields (no `YYYY-MM-DD`
placeholder), colon-free Session targets, the equal-width All/Metrics header and
the 48 px Session control row; see `docs/evidence/issue-51/round2/capture.json`
for measured geometry. The web-only text draft, the Settings presentation and
all actual-device checks remain unresolved.
The History origin mismatch has a bounded automated correction and comparison
in `docs/evidence/issue-45/verification.md`; actual-device confirmation remains
pending. Known visual residuals remain:
the Quarter dialog's surrounding elevation shadow is a measured CSS
approximation, not a dp conversion (#49; see
`docs/evidence/issue-49/verification.md`). Quarter footer text was previously
2 physical px lower than native; the measured correction leaves a one-physical-
pixel residual in the other direction (#50). Android fades the year scrollbar
after about a second while the web overlay thumb stays painted.
Planned-book and Remove button shadows now follow Android's `clipToPadding`
clipping at the content box; see `docs/evidence/issue-48/verification.md`. The year list now uses Android's 1900–2100 window
and a `ScrollBarUtils`-sized overlay thumb; paired captures in
`docs/evidence/issue-47/verification.md` put the initial and selected-year thumb
offsets at 209 and 212.33 px with a 4 px width and at most one physical pixel of
height difference. Calendar ink alignment was re-measured in
`docs/evidence/issue-46/verification.md` against a fresh API 35 capture: month,
weekday and day ink centres are within 0.5 CSS px (1.5 physical px), and the
header/date and year-list geometry match. The remainder is Chromium/Skia glyph
rasterization rather than layout. The earlier 622.188 px quarter
height discrepancy is historical: the latest verified snapshot covers measured
mobile/desktop quarter geometry, including the native-source **27dp label box**
and regular **400 footer weight**. This bounded geometry coverage is not visual
approval. These residuals remain unresolved parity checks, not accepted exceptions.
These captures are comparison inputs, **not**
proof of visual equivalence or actual-device sign-off. Do not link local temp
paths in release notes; retain evidence with the verification run instead.

**Hard release gate:** do not approve the web switch until Session, Plan, Books,
Charts and Settings, their history/metrics sheets, and all reader-used features
match the current Android build in behavior and acceptable mobile/desktop visual
presentation (apart from the manual-transfer-only sync exception). Review the
Android emulator reference and web visual fixtures side by side; resolve
differences rather than accepting chart/design divergence. Run the automated
checks and complete the actual Android phone and desktop-browser checklist below,
including safe two-way transfer and offline/update/backup checks. Record results
and remaining limitations in #44. **Parity and device sign-off remain pending.**

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

Prior automated run (2026-11-03): `npm run test:web` — **28 passed**. JavaScript
syntax checks (`node --check` for every `web/*.js` file) passed. There is no
configured TypeScript/typechecking task. At that point both review axes had no
remaining implementation blockers within the older functional scope after the
history-order and implicit-progress fixes. The 28-test result and that review
conclusion are historical, not evidence that the current Android parity scope
passes or has no blockers. They do not close the parity and actual-device gate
above.

The previously recorded baseline Python run reported two existing failures:
`test_remaining_plan_reflow_excludes_rest_days` and
`test_session_target_starts_from_today_current_page`. They predate these web
changes according to that prior evidence; they have not been newly rerun for
this documentation update. Retain them as release limitations until triaged,
not as passing checks.

Historical supplied automated evidence (2026-11-06): full `npm run test:web` —
**103 passed**, one worker, zero retries, terminal exit code **0**, in **5.5
minutes**. Syntax checks (`node --check`) passed for all **11** `web/*.js`
files, and the whitespace check (`git diff --check`) passed. The external run
log is identified as `final-web-verify-20261106-121641`; no machine-specific
path is needed here. This is an earlier baseline, not the current full-suite
result. These results are supplied run evidence, not a fresh suite
run for this docs-only update, and do not establish 1:1 visual parity. Fresh
same-data comparison and actual Android/desktop device verification remain
pending; issue #44 stays open and the web switch is not approved.

Historical frozen full-suite evidence (2026-11-06), run
`frozen-web-verify-20261106-165434`: **109 passed, 1 failed** out of 110,
terminal exit code **1**, in **3.9 minutes**. The failing native-assets contract
expected weight 500 for `#open-entries` but received 400. Contract resolution
was pending at the end of that run; it is not a full-suite pass.

Source review resolves that expectation to **400**: Android
`ReadingPlanSessionView.java:31` creates Entries via `actionButton`;
`MainActivity.java:279` delegates to `ReadingPlanUi.actionButton` (lines 26–42),
which does not set a typeface or weight. `res/values/styles.xml:2–3` supplies
AppTheme's explicit `android:fontFamily` of `sans`, overriding Material's
medium button family. The stale test expectation was corrected, not the CSS.
The focused rerun of `web-tests/native-assets.spec.js`, one worker, zero retries,
on isolated port 44271: **4 passed**, terminal exit code **0**, in **10.6 seconds**;
external log identifier `native-assets-contract-44271`. Only the test and this
document changed for that correction; frozen web source hash
`9571bbfd5dcf2d82b10094228f42a209fec0bf192689295bd0e4fd30962778fb`
was unchanged for that correction. That focused run did not establish a
full-suite pass; the settled complete run below now supersedes this historical
109/110 result and any intermediate 154/155 result, not the visual release gate.

### Historical pre-quarter complete web verification — AUTOMATED ONLY

Verified supplied evidence (2026-11-06), run
`final-fullverification-20261106-233923-154a7e05`: **157 total, 157 passed,
0 failed, 0 skipped**, terminal exit code **0**, in **6.1 minutes**.
`execution.txt`, `playwright-line.log` and `results/.last-run.json` record the
completed run, not an in-progress count. Command: `npm.cmd run test:web --
--workers=1 --retries=0 --reporter=line` with an external temporary output
directory. Environment: `CI=1`, one worker, zero retries, ephemeral port
**58303**, `reuseExistingServer=false`.

`node-check.log` records **49 JavaScript files checked, 0 failures** across web
and browser-test scripts. `git-diff-check.log` records whitespace-check exit
**0**, with `reading_plan_data/` excluded. The start/end SHA-256 manifests and
`stability.txt` record **145 source/configuration/documentation/asset files,
0 hash differences** during the run; this documentation update follows that
snapshot. Live `reading_plan_data/` is outside that source manifest; its
separate metadata snapshots record **0 differences** during the run. This is
run-local stability evidence, not a claim that the working tree or live data
matches Git HEAD.

### Latest settled complete web verification — AUTOMATED ONLY

Verified supplied evidence (2026-11-07), run
`quarter-full-verification-20261107-000852-90d9f808`: **159 total, 159 passed,
0 failed, 0 skipped**, terminal exit code **0**, in **4.1 minutes**.
`FINAL-REPORT.md`, `execution.txt`, `playwright-line.log` and
`results/.last-run.json` confirm terminal completion. The run started at
**00:08:59 +01:00** and ended at **00:13:05 +01:00**. Command:
`npm.cmd run test:web -- --workers=1 --retries=0 --reporter=line` with an
external temporary output directory. Environment: `CI=1`, one worker, zero
retries, fresh ephemeral port **50545**, `reuseExistingServer=false`.

`node-check.log` records **49 JavaScript files checked, 0 failures**.
`git-diff-check.log` records whitespace-check exit **0**, excluding
`reading_plan_data/`. The before/after SHA-256 manifests record **174
source/configuration/documentation/test/native/asset files, 0 hash differences**.
Both manifest files have SHA-256
`d10806adae385b1190615511ca1d24b9568cc4f3d7da8956450a592df6c5f9f1`.
Separate user-data metadata snapshots record **0 differences**; live user JSON
contents were **not read or hashed**. Metadata stability does not establish
content equivalence. The manifest identifies the tested dirty-working-tree
snapshot, not Git HEAD or any later edits. This documentation update and any
subsequent calendar/product changes are outside that verified snapshot.

The 157-test pass above is historical pre-quarter evidence. An older quarter
run with **159 total, 158 passed, 1 failed** had a conflicting assertion, now
reconciled against the native-source 27dp label geometry and 400 footer weight;
it was not a full-suite pass. The settled 159/159 run supersedes those results
for its snapshot only, not the visual release gate.

This is **AUTOMATED ONLY**, not 1:1 Android/web visual parity or switch approval.
No actual-device/deployment verification, Python suite rerun or native build was
performed for this update. The previously recorded Python failures remain
unverified, not newly passing. Visual residuals and the device checklist above
remain open; issue #44 stays open. No GitHub comment, issue closure or commit
is part of this documentation update.
