# SN Calendar Supernote Plugin (`sn-calendar`)

An e-ink optimized Supernote plugin that displays a daily/weekly calendar agenda from your iCal feeds and lets you create meeting notes with pre-populated, immutable snapshot headers—or append new pages to recurring meeting notebooks.

---

## Key Features

- **iCal / `.ics` Feed Integration**: Subscribe to public or private iCal HTTPS URLs (Google Calendar, Outlook, Apple Calendar, Fastmail, Proton) or import `.ics` files.
- **E-Ink Daily Agenda**: View daily/weekly schedules with high-contrast UI, start/end times, location tags, and attendee count previews.
- **Frozen Meeting Snapshots**: One-tap action stamps a static, point-in-time snapshot onto the page containing:
  - Meeting Title & Timezone
  - Host & Full Attendee List (with RSVP status)
  - Location & Video Call links
  - Agenda / Description text
- **Recurring Meetings**: Appends a fresh page to an existing series notebook (e.g. `Series - Weekly Sync.note`), creating a chronological page-by-page ledger for recurring syncs.
- **Auto-Launch**: Immediately opens the newly created note or appended page on device so you can start hand-writing right away.

---

## How to Install on Supernote

1. Connect your Supernote Nomad (A6 X2) or Manta (A5 X2) via USB or ADB.
2. Copy `build/outputs/Calendar.snplg` to the `/MyStyle/` folder on your Supernote storage:
   ```bash
   adb push build/outputs/Calendar.snplg /storage/emulated/0/MyStyle/
   ```
3. On your Supernote device:
   - Go to **Settings → Apps → Plugins**.
   - Tap **Add Plugin** and select `Calendar.snplg`.
4. Open any **NOTE** or **DOC** file. You will see the new **Calendar** plugin button on your toolbar.

---

## How to Use

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

- **No date or time found → it becomes a task**, dated today, rather than an appointment.
- Ambiguous dates such as `09/10` are flagged with a warning, since they could be Sep 10 or
  9 Oct. Dates like `22/09` resolve themselves. The order used for ambiguous dates follows your
  device's region setting by default, and can be overridden in **Feeds / Config**.
- Numeric dates accept `/`, `-` and `.` separators; times accept `10:00A`, `10am`, `14:00` and
  `14h00`.

### 1. Subscribe to Your Calendar Feeds
1. Tap the **Calendar** icon on your toolbar to open the plugin panel.
2. Tap **Feeds / Config** in the top-right corner.
3. Paste an HTTPS `.ics` feed URL from Google Calendar, Outlook, or Apple Calendar, then tap **Subscribe**.
4. *(Out of the box, the plugin includes sample meetings so you can test immediately without a feed URL).*

### 2. Navigate Your Schedule
- Use the **‹ Prev** and **Next ›** buttons to move between days, or tap the date title to return to **Today**.
- Meetings display start/end times, locations, attendee lists, and agenda previews.

### 3. Create a Single Meeting Note
- For single meetings, tap **📝 Create Meeting Note**.
- The plugin automatically:
  1. Creates a new `.note` file named `YYYY-MM-DD - Meeting Title.note` in `/Note/Meetings/`.
  2. Stamps the frozen snapshot header at the top of Page 1.
  3. Opens the note so you can start writing your handwritten notes immediately.

### 4. Append a Page for Recurring Meetings
- For recurring meetings (e.g. Weekly Standup), tap **➕ Append Meeting Page**.
- The plugin automatically:
  1. Locates the existing notebook `Series - Meeting Title.note` in `/Note/Meetings/`.
  2. Appends a new page to the end of the notebook.
  3. Stamps that specific day's updated snapshot header at the top of the new page.
  4. Opens the notebook straight to the new page.

---

## Notes Directory

Created notes are saved in your Supernote note directory:
```
/storage/emulated/0/Note/Meetings/
```
You can view, move, or organize these notebooks in Supernote's built-in Note app anytime.

---

## Attribution & Credits

- Author: `taoist22`
- Icon: <a href="https://www.flaticon.com/free-icons/calendar" title="calendar icons">Calendar icons created by srip - Flaticon</a>
