package com.sncalendar;

import android.content.ComponentName;
import android.content.Intent;
import android.text.TextUtils;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * Writes plain-text files to device storage.
 *
 * The plugin SDK has no writeFile: FileUtils.exists() works but listFiles()
 * and any write are absent, so exporting a note as Markdown or text is not
 * possible through sn-plugin-lib. This is the minimum native surface needed —
 * a single text write — rather than pulling in react-native-fs, which has no
 * precedent in this workspace.
 */
public class CalendarFileModule extends ReactContextBaseJavaModule {

    CalendarFileModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "CalendarFile";
    }

    /**
     * Opens a .note in the editor, optionally at a specific page.
     *
     * FileUtils.openFilePath() cannot do this — it builds a file-manager
     * intent and leaves the target in only_open_file, so it navigates to the
     * containing folder and stops. Launching the note activity directly is the
     * working route, proven in sn-lastnote on these devices.
     *
     * ACTION_VIEW is required: without it a running editor instance is reused
     * and the file_path extra is silently ignored, so you get whichever note
     * was open before. The extra key must be exactly "file_path", and "page"
     * is a 1-based int that is omitted to mean "last-used page".
     */
    @ReactMethod
    public void openNote(String filePath, int page, Promise promise) {
        if (TextUtils.isEmpty(filePath)) {
            promise.reject("E_PATH", "No path given");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setComponent(new ComponentName(
                    "com.ratta.supernote.note",
                    "com.ratta.supernote.note.view.NoteInsidePagesActivity"));
            intent.putExtra("file_path", filePath);
            if (page > 0) {
                intent.putExtra("page", page);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Throwable error) {
            promise.reject("E_OPEN", error.getMessage(), error);
        }
    }

    /**
     * Writes UTF-8 text, creating parent directories as needed.
     * Resolves with the absolute path actually written so JS can report a
     * location the user can go and find, rather than one it assumed.
     */
    @ReactMethod
    public void writeTextFile(String path, String content, Promise promise) {
        if (path == null || path.length() == 0) {
            promise.reject("E_PATH", "No path given");
            return;
        }

        try {
            File file = new File(path);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                promise.reject("E_MKDIR", "Could not create folder: " + parent.getAbsolutePath());
                return;
            }

            FileOutputStream out = new FileOutputStream(file, false);
            OutputStreamWriter writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);
            try {
                writer.write(content == null ? "" : content);
                writer.flush();
            } finally {
                writer.close();
                out.close();
            }

            promise.resolve(file.getAbsolutePath());
        } catch (Throwable error) {
            promise.reject("E_WRITE", error.getMessage(), error);
        }
    }
}
