# Compass for Supernote

An e-ink optimized planning, PARA, calendar, task, and note workspace for Supernote. The repository retains its original `sn-calendar` directory and internal plugin identity so existing installations and stored data continue to upgrade safely.

## Start Here

- [Getting Started](docs/GETTING_STARTED.md) — install Compass and choose the simplest setup for your needs.
- [Calendar Connections](docs/CALENDAR_CONNECTIONS.md) — Google feeds, iCloud CalDAV, custom CalDAV, and what is editable.
- [PARA and Notes](docs/PARA_AND_NOTES.md) — what Projects, Areas, Resources, and Archive mean in Compass.
- [Troubleshooting](docs/TROUBLESHOOTING.md) — common setup, sync, folder, and note-opening problems.

Compass works without an online account. Calendar connections and PARA organization are optional and can be added later.

---

## Key Features

- **iCal / `.ics` Feed Integration**: Subscribe to public or private iCal HTTPS URLs (Google Calendar, Outlook, Apple Calendar, Fastmail, Proton) or import `.ics` files.
- **E-Ink Calendar**: Navigate high-contrast month and day views, including a 15-day quick-jump strip, overlapping events, all-day items, locations, and attendee previews.
- **CalDAV Two-Way Sync**: Synchronize calendar events and, through an optional independent VTODO-capable account, tasks including completion, priorities, undated items, remote deletions, and conflict-protected edits when the server supplies ETags.
- **PARA Workspace**: Organize actionable Projects, ongoing Areas, reference Resources, and a unified Archive. Projects, Areas, and Resources can each link to a folder of Supernote notes and other files.
- **Daily and PARA Notes**: Open or create daily journals and create, browse, and open notes and other files connected to Projects, Areas, and Resources, alongside event-linked notes.
- **Recurring Meetings**: Handle common RRULE schedules, cancellations, and moved occurrences, then append a fresh page using the configured template to the series notebook.
- **Repeat Controls**: Create daily, weekly, monthly, or yearly series; choose intervals and weekly days; end on a date or after a count; edit a series; and delete one occurrence or the entire series.
- **Auto-Launch**: Immediately open a newly created note or appended page on device so you can start handwriting right away.

---

## How to Install on Supernote

1. Connect your Supernote Nomad (A6 X2) or Manta (A5 X2) via USB or ADB.
2. Copy `build/outputs/Compass.snplg` to the `/MyStyle/` folder on your Supernote storage:
   ```bash
   adb push build/outputs/Compass.snplg /storage/emulated/0/MyStyle/
   ```
3. On your Supernote device:
   - Go to **Settings → Apps → Plugins**.
   - Tap **Add Plugin** and select `Compass.snplg`.
4. Open any **NOTE** or **DOC** file. You will see the **Compass** plugin button on your toolbar.

---

## How to Use

For a first-time walkthrough, use [Getting Started](docs/GETTING_STARTED.md). The sections below are a feature reference.

### Adding Events and Tasks by Handwriting

Write the item in any note, lasso it with the native lasso tool, then tap **Add to Calendar** on
the lasso toolbar. The plugin recognises the writing, pulls out a date and time, and opens the
creation form already filled in. Saving returns you to your note.

**Write the date, time and title on a single line:**

```
08-20-2026 10:00A Meeting B
```

> **Known limitation.** Splitting the date, time and title across separate lines confuses the
> handwriting recogniser. In on-device testing, `11:00AM` written on its own line was read as
> `/ 1:00AM` — a ten-hour error — while the identical text on one line parsed perfectly. This is
> a recogniser behaviour, not a parsing bug; the same content simply recognises far better as one
> line.

The creation form always shows what was read and how it was interpreted, so check it before
saving:

```
read: "08-20-2026 10:00A Meeting B"
→ Event · Thu, Aug 20, 2026 · 10:00 AM
```

Rules worth knowing:

- **No date or time found → it becomes an undated task**, rather than inventing an appointment or due date.
- Ambiguous dates such as `09/10` are flagged with a warning, since they could be Sep 10 or
  9 Oct. Dates like `22/09` resolve themselves. The order used for ambiguous dates follows your
  device's region setting by default, and can be overridden in **Feeds / Config**.
- Numeric dates accept `/`, `-` and `.` separators; times accept `10:00A`, `10am`, `14:00` and
  `14h00`.

### 1. Subscribe to Your Calendar Feeds
1. Tap the **Compass** icon on your toolbar to open the plugin panel.
2. Tap **Feeds / Config** in the top-right corner.
3. Paste an HTTPS `.ics` feed URL from Google Calendar, Outlook, or Apple Calendar, then tap **Subscribe**. `webcal://` URLs are accepted and upgraded to HTTPS; plaintext HTTP is rejected.

To avoid typing long private feed addresses on the device, create a text file on a computer and import it with **Import Setup or Calendar File**. Use one feed per line, either as a bare address or `Calendar Name|https://…`. Blank lines and lines beginning with `#` are ignored. Delete the setup file after confirming the feeds, because it contains the private addresses in plaintext. You can also import an `.ics` file directly; the plugin keeps a private app-owned copy so the calendar remains available after the original file is moved.

Subscribed feeds are read-only. Tapping one of their events shows its source and offers **Copy as Editable** or **Hide on Supernote**; neither action changes Google. Hidden items can be restored from **Calendars & Sync**. Identical copies of the same event from multiple subscribed calendars are collapsed conservatively by title, time, all-day state, and location.
4. Alternatively, import an `.ics` file or a `.txt` file containing one HTTPS/webcal URL per line.

Private subscription URLs and CalDAV passwords are stored through Android Keystore-backed encryption rather than shared plugin storage.

### CalDAV Events and Tasks

Use **Feeds / Config → Calendars & Sync** to connect iCloud or another CalDAV server for events. **Sync Now** pushes local changes first and then pulls remote changes.

Modern iCloud Reminders lists are not exposed through iCloud's CalDAV endpoint. Although iCloud may advertise and accept writes to a legacy collection named `Reminders`, those tasks do not appear in the current Reminders app. To synchronize tasks through VTODO, configure the plugin's separate **Task CalDAV Account** using a provider that supports VTODO, and add that same account to the Reminders app on the Apple device. Existing iCloud reminders are not moved. Alternatively, keep tasks local and enable the task-to-calendar event mirror for dated tasks. Mirrored events include an alert at the due time; date-only tasks use 9:00 AM.

After a manual sync, the Calendar & Sync page shows each source's result, pending uploads, and the time of the last fully successful sync.

Time entry is tap-only for device usability: choose an hour, quarter-hour minute, and AM/PM, with ±5-minute adjustment when needed. Events use common duration buttons and expose an exact-end picker for unusual lengths.

### PARA Workspace

The **PARA** tab now represents all four categories:

- **Projects** are actionable outcomes with due dates, progress, tasks, linked meeting notes, and a folder of supporting files. **Finish** records completion; **Archive** removes unfinished work from the active view without claiming it was completed.
- **Areas** are ongoing responsibilities that contain active projects and can carry their own folder of notes and reference files. Archiving an Area asks whether its active Projects should also be archived or should remain active and become unfiled.
- **Resources** are non-actionable reference topics backed by folders. Link an existing folder by choosing any file inside it; Compass lists the same regular files the device exposes, including `.note`, PDF, EPUB, Office, text, and image files. Compass can also create additional `.note` files. New Resources default to `/Note/Compass/Resources/<Resource name>`.
- **Archive** combines finished or archived Projects, retired Areas, and archived Resources. Each can be restored; restoring a Project also restores its Area when necessary.
- Projects, Areas, and Resources share the same **Refresh Files**, **+ New Note**, and **Choose Folder** workflow. Defaults are `/Note/Compass/Projects/<name>`, `/Note/Compass/Areas/<name>`, and `/Note/Compass/Resources/<name>`; existing Project notebooks migrate to their current containing folder.
- The left pane follows PARA order—Projects, Areas, Resources, Archive—and each section expands into its items. Selecting an Area opens its projects; selecting a Resource lists the actual files in its folder on the right.
- Archiving an Area asks whether its active Projects should also be archived or should remain active and become unfiled.

### 2. Navigate Your Schedule
- Use the **‹ Prev** and **Next ›** buttons to move between days, or tap the date title to return to **Today**.
- Meetings display start/end times, locations, attendee lists, and agenda previews.

### 3. Create a Single Meeting Note
- Tap an event and choose **Create Note**. Taller Day View blocks also show the command directly.
- The plugin automatically:
  1. Creates a new `.note` file in the configured meeting-note folder, using the selected meeting template. An event type can override both settings.
  2. Links the note to the event.
  3. Opens the note so you can start handwriting immediately.

### 4. Append a Page for Recurring Meetings
- Tap an occurrence and choose **Create Note**. Compass recognizes the series and appends rather than creating a separate notebook.
- The plugin automatically:
  1. Locates the existing series notebook in the configured meeting-note folder.
  2. Appends a new page using the configured meeting template.
  3. Opens the notebook straight to the new page.

---

## Notes Directory

By default, meeting notes are saved in:
```
/storage/emulated/0/Note/Meetings/
```

You can change the meeting-note folder and template under **Feeds / Config → Notes & Storage**. Event types can use their own folder and template.

Device release checks are tracked in [TEST_MATRIX.md](TEST_MATRIX.md), including recurrence, persistence, deletion, synchronization, and series notebooks.
You can view, move, or organize these notebooks in Supernote's built-in Note app anytime.

---

## Attribution & Credits

- Author: `taoist22`
- Icon: <a href="https://www.flaticon.com/free-icons/calendar" title="calendar icons">Calendar icons created by srip - Flaticon</a>
