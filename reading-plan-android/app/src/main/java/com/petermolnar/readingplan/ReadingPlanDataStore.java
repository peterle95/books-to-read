package com.petermolnar.readingplan;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

final class ReadingPlanDataStore {
    private static final String LEGACY_FILE = "reading_plan.json";
    private static final String MIME_TYPE = "application/json";
    private final ContentResolver resolver;
    private final Uri treeUri;

    ReadingPlanDataStore(ContentResolver resolver, Uri treeUri) {
        this.resolver = resolver;
        this.treeUri = treeUri;
    }

    ReadingPlanBundleCodec.ReadResult read() throws IOException, JSONException {
        byte[] manifest = readRequired("manifest.json");
        Map<String, byte[]> files = new LinkedHashMap<>();
        for (String filename : ReadingPlanBundleCodec.DATA_FILES) {
            files.put(filename, readRequired(filename));
        }
        try {
            ReadingPlanBundleCodec.Metadata metadata = ReadingPlanBundleCodec.validateManifest(manifest, files);
            return new ReadingPlanBundleCodec.ReadResult(metadata, files);
        } catch (IllegalArgumentException error) {
            throw new IOException(error.getMessage(), error);
        }
    }

    ReadingPlanBundleCodec.Metadata readMetadata() throws IOException, JSONException {
        return read().metadata;
    }

    boolean hasAnyManagedFile() throws IOException {
        for (String filename : ReadingPlanBundleCodec.DATA_FILES) {
            if (findChild(filename) != null) {
                return true;
            }
        }
        return findChild("manifest.json") != null;
    }

    boolean hasLegacyFile() throws IOException {
        return findChild(LEGACY_FILE) != null;
    }

    String readLegacy() throws IOException {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(readRequired(LEGACY_FILE)))
                    .toString();
        } catch (CharacterCodingException error) {
            throw new IOException(LEGACY_FILE + " $: file must be UTF-8", error);
        }
    }

    void write(ReadingPlanBundleCodec.Encoded encoded, ReadingPlanBundleCodec.Metadata expected)
            throws IOException, JSONException {
        try {
            ReadingPlanBundleCodec.validateManifest(encoded.manifest, encoded.files);
        } catch (IllegalArgumentException error) {
            throw new IOException(error.getMessage(), error);
        }
        verifyExpected(expected);

        Map<String, Uri> temporary = new LinkedHashMap<>();
        try {
            for (String filename : ReadingPlanBundleCodec.DATA_FILES) {
                temporary.put(filename, stage(filename, encoded.files.get(filename)));
            }
            temporary.put("manifest.json", stage("manifest.json", encoded.manifest));
            verifyExpected(expected);
            for (String filename : ReadingPlanBundleCodec.DATA_FILES) {
                if (replace(filename, temporary.get(filename))) {
                    temporary.remove(filename);
                }
            }
            if (replace("manifest.json", temporary.get("manifest.json"))) {
                temporary.remove("manifest.json");
            }
        } finally {
            for (Uri uri : temporary.values()) {
                try {
                    DocumentsContract.deleteDocument(resolver, uri);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private void verifyExpected(ReadingPlanBundleCodec.Metadata expected) throws IOException, JSONException {
        if (expected == null) {
            if (hasAnyManagedFile()) {
                throw new IOException("reading-plan data directory already exists; reload it before saving");
            }
            return;
        }
        ReadingPlanBundleCodec.Metadata current = readMetadata();
        if (!current.sameAs(expected)) {
            throw new IOException("reading-plan data changed on another device; reload or merge it before saving");
        }
    }

    private byte[] readRequired(String filename) throws IOException {
        Uri uri = findChild(filename);
        if (uri == null) {
            throw new IOException(filename + " $: file is missing");
        }
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) {
                throw new IOException(filename + " $: could not open file");
            }
            byte[] buffer = new byte[8192];
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private Uri stage(String filename, byte[] bytes) throws IOException {
        Uri parent = parentUri();
        String temporaryName = "." + filename + "." + UUID.randomUUID() + ".tmp";
        Uri uri = DocumentsContract.createDocument(resolver, parent, MIME_TYPE, temporaryName);
        if (uri == null) {
            throw new IOException(filename + " $: could not create temporary file");
        }
        try (OutputStream output = resolver.openOutputStream(uri, "wt")) {
            if (output == null) {
                throw new IOException(filename + " $: could not open temporary file");
            }
            output.write(bytes);
        } catch (IOException | RuntimeException error) {
            try {
                DocumentsContract.deleteDocument(resolver, uri);
            } catch (Exception ignored) {
            }
            throw error;
        }
        if (!Arrays.equals(bytes, read(uri))) {
            try {
                DocumentsContract.deleteDocument(resolver, uri);
            } catch (Exception ignored) {
            }
            throw new IOException(filename + " $: temporary file changed while it was being saved");
        }
        return uri;
    }

    private byte[] read(Uri uri) throws IOException {
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) {
                throw new IOException("could not open file");
            }
            byte[] buffer = new byte[8192];
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private boolean replace(String filename, Uri temporary) throws IOException {
        Uri existing = findChild(filename);
        if (existing != null) {
            byte[] bytes = read(temporary);
            try (OutputStream output = resolver.openOutputStream(existing, "wt")) {
                if (output == null) {
                    throw new IOException(filename + " $: could not open file for replacement");
                }
                output.write(bytes);
            }
            if (!Arrays.equals(bytes, read(existing))) {
                throw new IOException(filename + " $: changed while it was being replaced");
            }
            return false;
        }
        Uri renamed = DocumentsContract.renameDocument(resolver, temporary, filename);
        if (renamed == null) {
            throw new IOException(filename + " $: storage provider could not publish file");
        }
        Uri published = findChild(filename);
        if (!renamed.equals(published)) {
            try {
                DocumentsContract.deleteDocument(resolver, renamed);
            } catch (Exception ignored) {
            }
            throw new IOException(filename + " $: storage provider changed the published filename");
        }
        return true;
    }

    private Uri findChild(String filename) throws IOException {
        String documentId;
        try {
            documentId = DocumentsContract.getTreeDocumentId(treeUri);
        } catch (IllegalArgumentException error) {
            throw new IOException("data directory permission is invalid", error);
        }
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId);
        String[] projection = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        };
        Uri result = null;
        try (Cursor cursor = resolver.query(children, projection, null, null, null)) {
            if (cursor == null) {
                throw new IOException("could not list data directory");
            }
            int idIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            if (idIndex < 0 || nameIndex < 0) {
                throw new IOException("data directory does not expose file names");
            }
            while (cursor.moveToNext()) {
                if (!filename.equals(cursor.getString(nameIndex))) {
                    continue;
                }
                if (result != null) {
                    throw new IOException(filename + " $: duplicate files found");
                }
                result = DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(idIndex));
            }
        }
        return result;
    }

    private Uri parentUri() throws IOException {
        try {
            return DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    DocumentsContract.getTreeDocumentId(treeUri)
            );
        } catch (IllegalArgumentException error) {
            throw new IOException("data directory permission is invalid", error);
        }
    }
}
