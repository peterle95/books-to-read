package com.petermolnar.readingplan;

import android.app.Instrumentation;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;

/** Run on a disposable emulator via am instrument -w .../ReadingPlanSessionDeviceCheck. */
public final class ReadingPlanSessionDeviceCheck extends Instrumentation {
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            MainActivity[] created = new MainActivity[1];
            runOnMainSync(() -> created[0] = new MainActivity());
            MainActivity activity = created[0];
            JSONObject physical = new JSONObject("{\"label\":\"Physical books\",\"books\":[{\"id\":\"physical-id\",\"title\":\"Pages\",\"start_page\":1,\"end_page\":100,\"current_page\":30,\"pages_read\":30,\"reading_sessions\":[{\"id\":\"last\",\"date\":\"2026-09-17\",\"current_page\":30,\"pages_read\":15},{\"id\":\"first\",\"date\":\"2026-09-16\",\"current_page\":10,\"pages_read\":10},{\"id\":\"middle\",\"date\":\"2026-09-17\",\"current_page\":20,\"pages_read\":10}]}]}");
            BookSection repaired = activity.bookSectionFromJson(physical, MainActivity.PHYSICAL_BOOKS_LABEL, true, true);
            require(activity.bundleRepairedThisLoad, "load must report a repaired positive chain mismatch");
            Book pages = repaired.books.get(0);
            require(pages.readingSessions.get(0).id.equals("first"), "date must sort first");
            require(pages.readingSessions.get(1).id.equals("middle"), "same-day page must sort before ID");
            require(pages.readingSessions.get(2).pagesRead == 10, "chain must repair contribution from 15 to 10");
            require(pages.currentPage == 30, "repair must preserve page progress");

            for (int invalid : new int[]{0, -1, 101}) {
                JSONObject bad = new JSONObject(physical.toString());
                bad.getJSONArray("books").getJSONObject(0).getJSONArray("reading_sessions")
                        .getJSONObject(0).put("pages_read", invalid);
                try {
                    activity.bookSectionFromJson(bad, MainActivity.PHYSICAL_BOOKS_LABEL, true, true);
                    throw new AssertionError("invalid contribution accepted: " + invalid);
                } catch (IllegalArgumentException expected) {
                    // A corrupt amount cannot be silently repaired.
                }
            }

            JSONObject audio = new JSONObject("{\"label\":\"Audiobooks\",\"books\":[{\"id\":\"audio-id\",\"title\":\"Audio\",\"start_time_seconds\":0,\"end_time_seconds\":3600,\"current_time_seconds\":1800,\"remaining_time_seconds\":1800,\"time_listened_seconds\":1800,\"reading_sessions\":[{\"id\":\"audio-last\",\"date\":\"2026-09-17\",\"current_time_seconds\":1800,\"remaining_time_seconds\":1800,\"time_listened_seconds\":1200},{\"id\":\"audio-first\",\"date\":\"2026-09-16\",\"current_time_seconds\":600,\"remaining_time_seconds\":3000,\"time_listened_seconds\":600}]}]}");
            BookSection audioSection = activity.bookSectionFromJson(audio, MainActivity.AUDIOBOOKS_LABEL, true, true);
            JSONObject plan = new JSONObject().put("schema_version", 8)
                    .put("start_date", "2026-09-01").put("end_date", "2026-09-30")
                    .put("end_label", "Target finish date");
            JSONArray sections = new JSONArray();
            sections.put(activity.bookSectionToJson(repaired));
            sections.put(activity.bookSectionToJson(new BookSection(MainActivity.DIGITAL_BOOKS_LABEL)));
            sections.put(activity.bookSectionToJson(audioSection));
            plan.put("sections", sections);
            ReadingPlanBundleCodec.Encoded encoded = ReadingPlanBundleCodec.encodeLegacy(plan.toString(), "android-test", 1);
            File directory = new File(getTargetContext().getExternalFilesDir(null), "session-contract");
            require(directory.isDirectory() || directory.mkdirs(), "create test bundle directory");
            for (Map.Entry<String, byte[]> file : encoded.files.entrySet()) {
                Files.write(new File(directory, file.getKey()).toPath(), file.getValue());
            }
            Files.write(new File(directory, "manifest.json").toPath(), encoded.manifest);
            Map<String, byte[]> loadedFiles = new LinkedHashMap<>();
            for (String name : ReadingPlanBundleCodec.DATA_FILES) {
                loadedFiles.put(name, Files.readAllBytes(new File(directory, name).toPath()));
            }
            ReadingPlanBundleCodec.Metadata metadata = ReadingPlanBundleCodec.validateManifest(
                    Files.readAllBytes(new File(directory, "manifest.json").toPath()), loadedFiles);
            JSONObject saved = new JSONObject(ReadingPlanBundleCodec.toLegacyJson(
                    new ReadingPlanBundleCodec.ReadResult(metadata, loadedFiles)));
            activity.bundleRepairedThisLoad = false;
            BookSection reloaded = activity.bookSectionFromJson(saved.getJSONArray("sections").getJSONObject(0),
                    MainActivity.PHYSICAL_BOOKS_LABEL, true, true);
            require(!activity.bundleRepairedThisLoad, "repaired bundle must reload without another repair");
            require(reloaded.books.get(0).readingSessions.get(2).pagesRead == 10, "repaired chain must persist");
            BookSection reloadedAudio = activity.bookSectionFromJson(saved.getJSONArray("sections").getJSONObject(2),
                    MainActivity.AUDIOBOOKS_LABEL, true, true);
            require(reloadedAudio.books.get(0).currentPage == 1800, "audio time must persist in seconds");

            Map<String, byte[]> desktopFiles = new LinkedHashMap<>();
            for (String name : ReadingPlanBundleCodec.DATA_FILES) {
                desktopFiles.put(name, readAsset("desktop-session-contract/" + name));
            }
            ReadingPlanBundleCodec.Metadata desktopMetadata = ReadingPlanBundleCodec.validateManifest(
                    readAsset("desktop-session-contract/manifest.json"), desktopFiles);
            JSONObject desktopPlan = new JSONObject(ReadingPlanBundleCodec.toLegacyJson(
                    new ReadingPlanBundleCodec.ReadResult(desktopMetadata, desktopFiles)));
            activity.bundleRepairedThisLoad = false;
            BookSection desktopPages = activity.bookSectionFromJson(desktopPlan.getJSONArray("sections").getJSONObject(0),
                    MainActivity.PHYSICAL_BOOKS_LABEL, true, true);
            BookSection desktopAudio = activity.bookSectionFromJson(desktopPlan.getJSONArray("sections").getJSONObject(2),
                    MainActivity.AUDIOBOOKS_LABEL, true, true);
            require(!activity.bundleRepairedThisLoad, "desktop bundle must load without repair");
            require(desktopPages.books.get(0).readingSessions.get(2).pagesRead == 10,
                    "desktop page history must retain contributions");
            require(desktopAudio.books.get(0).readingSessions.get(1).pagesRead == 1200,
                    "desktop audio history must retain seconds");
            result.putString("stream", "Session bundle checks passed; bundle: " + directory.getAbsolutePath());
            finish(0, result);
        } catch (Throwable failure) {
            result.putString("stream", "Session bundle checks failed: " + failure);
            finish(1, result);
        }
    }

    private byte[] readAsset(String name) throws Exception {
        try (InputStream input = getContext().getAssets().open(name);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
