# Android same-data reference — 2026-11-06

Successful real Android runtime captures, not mockups. This directory is external temporary evidence only. No web captures or parity verdict produced.

## Identity

- Disposable AVD created here from existing API 35 Google APIs tablet system image, customized to phone raster. Serial `emulator-5580`; only this owned emulator was shut down afterward with `adb emu kill`. Existing offline `emulator-5554` was not reset or used.
- Raster **1080×2340**, physical density **480 dpi**, font scale **1.0**. Total raster equals **360×780 dp**, DPR **3**. Raw uncropped screenshots include native system bars; do not blindly equate this with web content viewport. `window-insets.txt` and accompanying screenshot XML preserve native bounds.
- Device local date **2026-11-06**, timezone **Europe/Berlin**, offset **+0100**, captures approximately 11:45–11:55 local. Clock unchanged. Same calendar day as frozen UTC fixture, not identical instant/timezone.
- Build fingerprint `google/sdk_gtablet_x86_64/emu64xa:15/AE3A.240806.046.T1/13135149:userdebug/dev-keys`.
- Current repository HEAD `541957e0caa5bfafec90bf6804082dcc5461646a`. Android source copied to `build-source/`, built offline successfully with existing Gradle/Java/SDK; copied source hashes still match repository files (`source_copy_differences: []`). No native source edits. Build outputs stayed external; the pre-existing repository `.gradle-user-home` cache was reused and Gradle may update ignored cache entries there.
- Fresh debug APK `build-source/app/build/outputs/apk/debug/app-debug.apk`; application `com.petermolnar.readingplan`, version **2.1 (3)**. SHA256 **88c6e7e6e4e0239153f96cff089c5ba8991fb9d95dc0ea727364a60934404913**. See `gradle-build.log`, `capture-metadata.json`, `package-installed.txt`.

## Same fixture

Imported ONLY the four immutable `../populated-bundle/` files through Android SAF directory picker into the fresh app, granting only `Documents/parity-reference-v2-20261106` on the disposable device. Host and post-capture device hashes match exactly:

| File | SHA256 |
|---|---|
| plan.json | `2c8e9ed3838cf03cb1c6dd2dd473e0ec96d8385c2df365c35a5f9a987bc08b1e` |
| books.json | `93731590354418d4a45b92e5bd940a9a3f927352cd32289f5c7cf711310fc4c9` |
| sessions.json | `ca127144d7d6b2ac81bfe511df9827c4d2e304eb06028c6dc85a353896afe48f` |
| manifest.json | `835966a4415a13635e91ab6bd5cf8d515a3c4ce3b979fb19b7949c5a80b947ef` |

All four books observed through Session format selectors and Books tables. Physical history displays current page 30, 30%, total recorded 30, last read 2026-11-06, same-day 20 pages / two sessions, previous-day 10 pages. No recalculation, reorder, group Apply, session Save, or Delete confirmation committed. No repair/rollover message observed.

## Capture index

- Base screens: `android-session.png`, `android-plan.png`, `android-books.png`, `android-charts.png`, `android-settings.png`.
- Session formats: `android-session-digital.png`, `android-session-audio.png`.
- SAF chooser: `android-directory-chooser.png`.
- Book chooser: `android-book-chooser.png`.
- Groups: `android-books-groups-section.png`, `android-group-picker.png`. Picker captured without an edit-book selection, so both boxes are unchecked despite the fixture's existing group; this is observed native behavior, not missing fixture data.
- History: `android-history.png`, `android-history-expanded.png`, `android-history-edit.png`, `android-history-delete.png`. Edit and delete canceled.
- Charts: `android-charts-all.png` (All on, projection on), `android-charts-all-projection-off.png` (All on, projection off), `android-chart-book-chooser.png`, `android-chart-metrics.png`. Base `android-charts.png` is first physical book, projection on. Native projection reports insufficient history (0/7 reading days); do not invent a projected line.
- Additional diagnostic: `android-books-scrolled-after-audio.png` (not a group dialog); `picker-debug.png` (root SAF debugging only).
- Each named Android PNG has matching XML. Exact PNG hashes and source/build/fixture provenance are in `capture-metadata.json`.

## Limits

This is a bounded synthetic phone-sized emulator reference, not exhaustive Android coverage or final 1:1 web sign-off. A tablet system image at phone dimensions still reports Pixel Tablet model. Long labels and chart geometry exhibit real native clipping, preserved unchanged. Native system clock text changes between screenshots. No dependencies installed, no live reader data accessed, no original AVD modified, no unknown process killed. Only the fresh app APK was installed into the disposable emulator. The original handoff is intentionally not overwritten.
