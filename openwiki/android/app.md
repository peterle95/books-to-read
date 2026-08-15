---
type: platform application
title: Android reading-plan application
description: Android client composition, shared-document editing, Storage Access Framework lifecycle, build contract, and platform limits.
tags: [android, mobile, persistence]
---

# Android reading-plan application

`MainActivity` is the exported launcher declared by `AndroidManifest.xml`. It composes Session, Plan, Books, Charts, and Settings surfaces and delegates model behavior to `BookModels`, `BookCollections`, `PlanPrimitives`, `ReadingPlanScheduler`, `ReadingSessionEntries`, and the specialized view/report classes. The Android implementation is independent Java code but targets the same schema 8 JSON contract; see [persistence](../persistence/json.md).

On `onCreate`, the activity selects next-quarter defaults, builds the root/tab UI, restores the persisted Storage Access Framework `Uri`, and loads the document. `onResume` checks for external changes; `onPause` flushes pending saves; `onDestroy` cancels delayed callbacks. `saveHandler`/`pendingSave` debounce writes, while `loadedHash`, `loadedRevision`, and `localDirty` prevent blind overwrites. `writeJsonDocument` writes UTF-8 through the selected SAF `Uri`; the provider owns replacement/atomicity, because the app does not implement a filesystem transaction. Revision/hash checks reject stale documents, but atomic persistence is provider-dependent and has no automated test. SAF URI permissions and Android preferences are the platform-specific access boundary; file-picker cancellation, unavailable URIs, malformed documents, and conflict dialogs are failure paths to exercise manually.

Build configuration in `reading-plan-android/app/build.gradle` uses namespace/application ID `com.petermolnar.readingplan`, compile/target SDK 35, min SDK 26, version 1.0, and Java 17. From `reading-plan-android`, use `gradlew.bat assembleDebug` (or `./gradlew assembleDebug` on Unix) with a matching Android SDK. The manifest declares the launcher and app theme; no network service is required.

There are no Android unit or UI test sources under `app/src`; Gradle compilation proves packaging, not scheduler, parser, SAF, lifecycle, or visual correctness. Cross-client changes therefore require Python contract tests plus Android build/manual load-edit-save-reopen and conflict checks. Metrics/reporting ownership is described in [metrics](../reporting/metrics.md).
