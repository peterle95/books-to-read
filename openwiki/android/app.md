---
type: platform application
title: Android reading-plan application
description: Android client composition, shared four-file bundle editing, Storage Access Framework lifecycle, build contract, and platform limits.
tags: [android, mobile, persistence]
---

# Android reading-plan application

`MainActivity` is the exported launcher declared by `AndroidManifest.xml`. It composes Session, Plan, Books, Charts, and Settings surfaces and delegates model behavior to `BookModels`, `BookCollections`, `PlanPrimitives`, `ReadingPlanScheduler`, `ReadingSessionEntries`, and the specialized view/report classes. The Android implementation is independent Java code but targets the same version-1 four-file JSON bundle as Python; `ReadingPlanBundleCodec` and `ReadingPlanDataStore` are the Android persistence boundary. See [persistence](../persistence/json.md).

On `onCreate`, the activity selects next-quarter defaults, builds the root/tab UI, restores the persisted Storage Access Framework tree `Uri`, and loads the bundle. `onResume` checks for external changes; `onPause` flushes pending saves; `onDestroy` cancels delayed callbacks. `saveHandler`/`pendingSave` debounce writes, while bundle metadata and `localDirty` prevent blind overwrites. `ReadingPlanDataStore` reads `manifest.json` plus `plan.json`, `books.json`, and `sessions.json`, validates checksums and metadata, stages replacement documents, and rejects stale revisions. The provider owns SAF replacement/atomicity, so file-picker cancellation, unavailable URIs, malformed documents, and conflict dialogs remain manual failure paths.

Build configuration in `reading-plan-android/app/build.gradle` uses namespace/application ID `com.petermolnar.readingplan`, compile/target SDK 35, min SDK 26, version code 2, version name 2.0, and Java 17. From `reading-plan-android`, use `gradlew.bat :app:assembleDebug` (or `./gradlew :app:assembleDebug` on Unix) with a matching Android SDK; this is the consumer-facing packaging check, not a behavior suite. The manifest declares the launcher and app theme; no network service is required.

There are no Android unit or UI test sources under `app/src`; Gradle compilation proves packaging, not scheduler, parser, SAF, lifecycle, or visual correctness. Cross-client changes therefore require Python contract tests plus the Android build and manual load-edit-save-reopen, legacy import, malformed-bundle, and conflict checks. Metrics/reporting ownership is described in [metrics](../reporting/metrics.md).

## Change navigation

Consult this page for Android lifecycle, SAF, bundle codec, or UI changes. Start at `MainActivity`, `ReadingPlanBundleCodec`, and `ReadingPlanDataStore`; update the paired Python contract described in [persistence](../persistence/json.md). The minimal local check is `(cd reading-plan-android && ./gradlew :app:assembleDebug)`; run `python3 -m unittest test_reading_plan.py` as the cross-client contract check when persistence changes.