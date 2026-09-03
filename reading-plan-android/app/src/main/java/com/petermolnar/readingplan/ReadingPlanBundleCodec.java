package com.petermolnar.readingplan;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class ReadingPlanBundleCodec {
    static final int SCHEMA_VERSION = 1;
    static final List<String> DATA_FILES = Arrays.asList("plan.json", "books.json", "sessions.json");

    private ReadingPlanBundleCodec() {
    }

    static final class Metadata {
        final int revision;
        final String lastModified;
        final String modifiedBy;
        final String manifestHash;
        final Map<String, String> fileHashes;

        Metadata(int revision, String lastModified, String modifiedBy, String manifestHash, Map<String, String> fileHashes) {
            this.revision = revision;
            this.lastModified = lastModified;
            this.modifiedBy = modifiedBy;
            this.manifestHash = manifestHash;
            this.fileHashes = new LinkedHashMap<>(fileHashes);
        }

        boolean sameAs(Metadata other) {
            return other != null
                    && revision == other.revision
                    && manifestHash.equals(other.manifestHash)
                    && fileHashes.equals(other.fileHashes);
        }
    }

    static final class ReadResult {
        final Metadata metadata;
        final Map<String, byte[]> files;

        ReadResult(Metadata metadata, Map<String, byte[]> files) {
            this.metadata = metadata;
            this.files = files;
        }
    }

    static final class Encoded {
        final Map<String, byte[]> files;
        final byte[] manifest;

        Encoded(Map<String, byte[]> files, byte[] manifest) {
            this.files = files;
            this.manifest = manifest;
        }
    }

    static Encoded encodeLegacy(String raw, String defaultModifiedBy, int revision) throws JSONException {
        JSONObject legacy = new JSONObject(raw);
        String lastModified = legacy.optString("last_modified", "");
        if (lastModified.isEmpty()) {
            lastModified = OffsetDateTime.now().withNano(0).toString();
        }
        String modifiedBy = defaultModifiedBy == null || defaultModifiedBy.isEmpty()
                ? legacy.optString("modified_by", "unknown")
                : defaultModifiedBy;
        return encodeLegacy(legacy, lastModified, modifiedBy, revision);
    }

    private static Encoded encodeLegacy(
            JSONObject legacy,
            String lastModified,
            String modifiedBy,
            int revision
    ) throws JSONException {
        JSONObject plan = new JSONObject();
        plan.put("schema_version", SCHEMA_VERSION);
        copyIfPresent(legacy, plan, "start_date");
        copyIfPresent(legacy, plan, "end_date");
        copyIfPresent(legacy, plan, "end_label");
        plan.put("stats_options", copyObject(legacy.optJSONObject("stats_options"), new JSONObject()));
        plan.put("rest_days", copyArray(legacy.optJSONArray("rest_days"), new JSONArray()));

        JSONObject sessions = new JSONObject();
        JSONArray booksSections = new JSONArray();
        JSONArray rawSections = legacy.optJSONArray("sections");
        if (rawSections == null) {
            rawSections = new JSONArray();
        }
        Set<String> bookIds = new LinkedHashSet<>();
        for (int sectionIndex = 0; sectionIndex < rawSections.length(); sectionIndex++) {
            JSONObject rawSection = rawSections.getJSONObject(sectionIndex);
            JSONObject section = new JSONObject();
            copyIfPresent(rawSection, section, "label");
            section.put("baseline_needs_recalculation", rawSection.optBoolean("baseline_needs_recalculation", false));
            section.put("simultaneous_groups", copyArray(rawSection.optJSONArray("simultaneous_groups"), new JSONArray()));
            JSONArray books = new JSONArray();
            JSONArray rawBooks = rawSection.optJSONArray("books");
            if (rawBooks == null) {
                rawBooks = new JSONArray();
            }
            for (int bookIndex = 0; bookIndex < rawBooks.length(); bookIndex++) {
                JSONObject rawBook = rawBooks.getJSONObject(bookIndex);
                JSONObject book = new JSONObject(rawBook.toString());
                String id = book.optString("id", "").trim();
                if (id.isEmpty()) {
                    id = java.util.UUID.randomUUID().toString();
                    book.put("id", id);
                }
                if (!bookIds.add(id)) {
                    throw new IllegalArgumentException("books.json $.sections[" + sectionIndex + "].books[" + bookIndex + "].id: duplicate book ID");
                }
                JSONArray rawBookSessions = book.optJSONArray("reading_sessions");
                book.remove("reading_sessions");
                books.put(book);
                JSONArray sessionsForBook = copyArray(rawBookSessions, new JSONArray());
                for (int sessionIndex = 0; sessionIndex < sessionsForBook.length(); sessionIndex++) {
                    JSONObject session = sessionsForBook.getJSONObject(sessionIndex);
                    if (session.optString("id", "").trim().isEmpty()) {
                        session.put("id", java.util.UUID.randomUUID().toString());
                    }
                }
                sessions.put(id, sessionsForBook);
            }
            section.put("books", books);
            booksSections.put(section);
        }

        JSONObject books = new JSONObject();
        books.put("schema_version", SCHEMA_VERSION);
        books.put("sections", booksSections);
        JSONObject sessionFile = new JSONObject();
        sessionFile.put("schema_version", SCHEMA_VERSION);
        sessionFile.put("sessions", sessions);

        Map<String, byte[]> data = new LinkedHashMap<>();
        data.put("plan.json", jsonBytes(plan));
        data.put("books.json", jsonBytes(books));
        data.put("sessions.json", jsonBytes(sessionFile));
        return withManifest(data, revision, lastModified, modifiedBy);
    }

    private static Encoded withManifest(
            Map<String, byte[]> data,
            int revision,
            String lastModified,
            String modifiedBy
    ) throws JSONException {
        JSONObject manifest = new JSONObject();
        manifest.put("schema_version", SCHEMA_VERSION);
        manifest.put("revision", revision);
        manifest.put("last_modified", lastModified);
        manifest.put("modified_by", modifiedBy);
        JSONObject hashes = new JSONObject();
        for (String filename : DATA_FILES) {
            hashes.put(filename, sha256(data.get(filename)));
        }
        manifest.put("files", hashes);
        return new Encoded(data, jsonBytes(manifest));
    }

    static Metadata validateManifest(byte[] manifestRaw, Map<String, byte[]> files) throws JSONException {
        JSONObject manifest = parseObject(manifestRaw, "manifest.json");
        requireSchema(manifest, "manifest.json");
        int revision = exactInt(manifest, "revision", "manifest.json");
        if (revision < 0) {
            throw new IllegalArgumentException("manifest.json $.revision: revision must be non-negative");
        }
        String lastModified = manifest.getString("last_modified");
        String modifiedBy = manifest.getString("modified_by");
        if (lastModified.isEmpty()) {
            throw new IllegalArgumentException("manifest.json $.last_modified: last_modified is required");
        }
        if (modifiedBy.isEmpty()) {
            throw new IllegalArgumentException("manifest.json $.modified_by: modified_by is required");
        }
        JSONObject rawHashes = manifest.getJSONObject("files");
        Set<String> names = jsonKeys(rawHashes);
        if (!names.equals(new HashSet<>(DATA_FILES))) {
            throw new IllegalArgumentException("manifest.json $.files: must list exactly plan.json, books.json, and sessions.json");
        }
        Map<String, String> hashes = new LinkedHashMap<>();
        for (String filename : DATA_FILES) {
            if (!files.containsKey(filename)) {
                throw new IllegalArgumentException(filename + " $: file is missing");
            }
            String expected = rawHashes.getString(filename).toLowerCase();
            if (!expected.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("manifest.json $.files." + filename + ": must be a SHA-256 hex digest");
            }
            String actual = sha256(files.get(filename));
            if (!actual.equals(expected)) {
                throw new IllegalArgumentException(filename + " $: checksum does not match manifest.json");
            }
            requireSchema(parseObject(files.get(filename), filename), filename);
            hashes.put(filename, actual);
        }
        return new Metadata(revision, lastModified, modifiedBy, sha256(manifestRaw), hashes);
    }

    static String toLegacyJson(ReadResult bundle) throws JSONException {
        JSONObject plan = parseObject(bundle.files.get("plan.json"), "plan.json");
        JSONObject books = parseObject(bundle.files.get("books.json"), "books.json");
        JSONObject sessionsFile = parseObject(bundle.files.get("sessions.json"), "sessions.json");
        requireSchema(plan, "plan.json");
        requireSchema(books, "books.json");
        requireSchema(sessionsFile, "sessions.json");
        String endLabel = plan.getString("end_label").trim();
        if (!"Target finish date".equals(endLabel) && !"Quarter end".equals(endLabel)) {
            throw new IllegalArgumentException("plan.json $.end_label: unsupported finish-date label");
        }

        JSONArray rawSections = books.getJSONArray("sections");
        JSONObject rawSessions = sessionsFile.getJSONObject("sessions");
        Set<String> bookIds = new LinkedHashSet<>();
        Set<String> sessionIds = new HashSet<>();
        Set<String> sectionLabels = new LinkedHashSet<>();
        Set<String> expectedSectionLabels = new HashSet<>(Arrays.asList(
                "Physical books", "Digital books", "Audiobooks"
        ));
        JSONArray sections = new JSONArray();
        for (int sectionIndex = 0; sectionIndex < rawSections.length(); sectionIndex++) {
            JSONObject rawSection = rawSections.getJSONObject(sectionIndex);
            String sectionLabel = rawSection.optString("label", "").trim();
            if (!expectedSectionLabels.contains(sectionLabel)) {
                throw new IllegalArgumentException("books.json $.sections[" + sectionIndex + "].label: unknown book section");
            }
            if (!sectionLabels.add(sectionLabel)) {
                throw new IllegalArgumentException("books.json $.sections[" + sectionIndex + "].label: duplicate book section");
            }
            JSONObject section = new JSONObject(rawSection.toString());
            JSONArray rawBooks = rawSection.getJSONArray("books");
            JSONArray booksWithSessions = new JSONArray();
            for (int bookIndex = 0; bookIndex < rawBooks.length(); bookIndex++) {
                JSONObject rawBook = rawBooks.getJSONObject(bookIndex);
                String path = "books.json $.sections[" + sectionIndex + "].books[" + bookIndex + "]";
                String id = rawBook.optString("id", "").trim();
                if (id.isEmpty()) {
                    throw new IllegalArgumentException(path + ".id: stable book ID is required");
                }
                if (!bookIds.add(id)) {
                    throw new IllegalArgumentException(path + ".id: duplicate book ID");
                }
                if (rawBook.has("reading_sessions")) {
                    throw new IllegalArgumentException(path + ".reading_sessions: reading history belongs in sessions.json");
                }
                JSONObject book = new JSONObject(rawBook.toString());
                if (!rawSessions.has(id)) {
                    throw new IllegalArgumentException("sessions.json $.sessions: missing session list for book ID " + id);
                }
                JSONArray bookSessions = new JSONArray(rawSessions.getJSONArray(id).toString());
                for (int sessionIndex = 0; sessionIndex < bookSessions.length(); sessionIndex++) {
                    JSONObject session = bookSessions.getJSONObject(sessionIndex);
                    String sessionId = session.optString("id", "").trim();
                    if (sessionId.isEmpty()) {
                        throw new IllegalArgumentException("sessions.json $.sessions[" + id + "][" + sessionIndex + "].id: stable reading session ID is required");
                    }
                    if (!sessionIds.add(sessionId)) {
                        throw new IllegalArgumentException("sessions.json $.sessions[" + id + "][" + sessionIndex + "].id: duplicate reading session ID");
                    }
                }
                book.put("reading_sessions", bookSessions);
                booksWithSessions.put(book);
            }
            section.put("books", booksWithSessions);
            sections.put(section);
        }
        if (!sectionLabels.equals(expectedSectionLabels)) {
            throw new IllegalArgumentException("books.json $.sections: must contain Physical books, Digital books, and Audiobooks");
        }
        for (String id : jsonKeys(rawSessions)) {
            if (!bookIds.contains(id)) {
                throw new IllegalArgumentException("sessions.json $.sessions: unknown book ID " + id);
            }
        }

        JSONObject legacy = new JSONObject();
        legacy.put("schema_version", 8);
        legacy.put("revision", bundle.metadata.revision);
        legacy.put("last_modified", bundle.metadata.lastModified);
        legacy.put("modified_by", bundle.metadata.modifiedBy);
        copyIfPresent(plan, legacy, "start_date");
        copyIfPresent(plan, legacy, "end_date");
        legacy.put("end_label", endLabel);
        copyIfPresent(plan, legacy, "stats_options");
        copyIfPresent(plan, legacy, "rest_days");
        legacy.put("sections", sections);
        return legacy.toString();
    }

    private static JSONObject parseObject(byte[] raw, String filename) throws JSONException {
        if (raw == null) {
            throw new IllegalArgumentException(filename + " $: file is missing");
        }
        String text = utf8(raw, filename);
        try {
            return new JSONObject(text);
        } catch (JSONException error) {
            throw new JSONException(filename + " $: invalid JSON: " + error.getMessage());
        }
    }

    private static String utf8(byte[] raw, String filename) throws JSONException {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(raw))
                    .toString();
        } catch (CharacterCodingException error) {
            throw new JSONException(filename + " $: file must be UTF-8");
        }
    }

    private static void requireSchema(JSONObject value, String filename) throws JSONException {
        int schema = exactInt(value, "schema_version", filename);
        if (schema > SCHEMA_VERSION) {
            throw new IllegalArgumentException(filename + " $.schema_version: unsupported newer schema version");
        }
        if (schema != SCHEMA_VERSION) {
            throw new IllegalArgumentException(filename + " $.schema_version: invalid schema version");
        }
    }

    private static int exactInt(JSONObject value, String key, String filename) throws JSONException {
        Object raw = value.get(key);
        if (!(raw instanceof Integer) && !(raw instanceof Long)) {
            throw new IllegalArgumentException(filename + " $." + key + ": must be a JSON integer");
        }
        long number = ((Number) raw).longValue();
        if (number < Integer.MIN_VALUE || number > Integer.MAX_VALUE) {
            throw new IllegalArgumentException(filename + " $." + key + ": integer is out of range");
        }
        return (int) number;
    }

    private static Set<String> jsonKeys(JSONObject value) {
        Set<String> keys = new LinkedHashSet<>();
        Iterator<String> iterator = value.keys();
        while (iterator.hasNext()) {
            keys.add(iterator.next());
        }
        return keys;
    }

    private static void copyIfPresent(JSONObject source, JSONObject target, String key) throws JSONException {
        if (source.has(key)) {
            target.put(key, source.get(key));
        }
    }

    private static JSONObject copyObject(JSONObject value, JSONObject fallback) throws JSONException {
        return value == null ? fallback : new JSONObject(value.toString());
    }

    private static JSONArray copyArray(JSONArray value, JSONArray fallback) throws JSONException {
        return value == null ? fallback : new JSONArray(value.toString());
    }

    private static byte[] jsonBytes(JSONObject value) throws JSONException {
        return (value.toString(2) + "\n").getBytes(StandardCharsets.UTF_8);
    }

    static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) {
                result.append(String.format(java.util.Locale.ROOT, "%02x", value));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new AssertionError(error);
        }
    }
}
