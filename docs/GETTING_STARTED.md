# Getting Started with Compass

Compass does not require an online account. Start with the pieces that solve a problem for you and add the rest later.

## Install

1. Copy `Compass.snplg` to the Supernote `MyStyle` folder.
2. Open **Settings → Apps → Plugins** on the device.
3. Choose **Add Plugin** and select `Compass.snplg`.
4. Open a note, document, or supported file and tap **Compass** in the plugin toolbar.

Installing an update under the same Compass plugin identity preserves its stored data. When producing a development build, clean the previous generated build artifacts first so stale native output cannot be packaged accidentally.

## Choose a calendar setup

| What you want | Recommended setup | What to expect |
|---|---|---|
| Use Compass without an online calendar | No connection | Events and tasks remain on the Supernote. |
| See Google Calendar | Google **Secret address in iCal format** | Read-only subscription. Google events cannot be edited or deleted from Compass. |
| Edit events from Compass and Apple devices | iCloud CalDAV | Two-way event creation, editing, deletion, and recurrence. |
| Use another writable calendar service | Custom CalDAV | Two-way events when the provider supports standard CalDAV. |
| Import a calendar snapshot | Import an `.ics` file | Compass retains a private copy; it does not continuously update from the source. |

See [Calendar Connections](CALENDAR_CONNECTIONS.md) for setup instructions and limitations.

## First useful actions

1. Open **Month** and tap a date to enter **Day View**.
2. Tap **+ Event** or **+ Task** and create a test item.
3. Tap an event to open its details, then choose **Create Note**.
4. Open **PARA** and create one Project for an outcome you are actively working toward.

That is enough to use Compass. Note folders, templates, event types, Areas, and Resources can wait until you have a reason to configure them.

## Add an item from handwriting

Write the date, time, and title on one line, select it with the native lasso, and tap **Add to Calendar**:

```text
08-20-2026 10:00A Meeting B
```

Compass shows both the recognized text and its interpretation before saving. If no date or time is recognized, it opens as an undated task. Splitting the information across lines makes Supernote handwriting recognition substantially less reliable.

## Understand the main views

- **Month** shows the calendar and dated tasks.
- **Day View** shows the time grid, daily journal, tasks, and event-note actions.
- **PARA** organizes Projects, Areas, Resources, and Archive.
- **Feeds / Config** contains calendar connections, note folders, appearance, help, and diagnostics.

If setup does not behave as expected, continue with [Troubleshooting](TROUBLESHOOTING.md).
