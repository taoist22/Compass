# Calendar Connections

The connection type determines whether SNFolio can change an event. A calendar being visible does not necessarily make it editable.

## Google Calendar: read-only subscription

SNFolio uses Google's private iCal subscription because Google CalDAV requires an OAuth application flow that the plugin does not implement.

1. On a computer, open Google Calendar, then **Settings → Settings**.
2. Under **Settings for my calendars**, choose the calendar, open **Integrate calendar**, and copy **Secret address in iCal format**. Do not use the normal browser address or the public calendar page. Google documents these steps in [Sync your calendar with computer programs](https://support.google.com/calendar/answer/37648).
3. Put the address in a plain-text file; a .txt file. One calendar goes on each line:

   ```text
   Business|https://calendar.google.com/calendar/ical/.../basic.ics
   School|https://calendar.google.com/calendar/ical/.../basic.ics
   ```

4. Transfer the file to the Supernote.
5. In SNFolio, open **Feeds / Config → Calendars & Sync → Import Setup or Calendar File** and select it.
6. Delete the transferred text file after the calendars work. The secret addresses grant access to those calendars and should be treated like passwords.

A bare URL without `Name|` also works. SNFolio accepts secure `https://` and `webcal://` addresses. Subscribed events are read-only. You may create an editable local copy or hide an occurrence on the Supernote, but SNFolio does not alter the Google event.

Imported and subscribed calendars appear under **Connected Calendars**. **Remove** deletes the connection and its events from SNFolio without changing the source calendar or the setup file. Setup files are read only when explicitly imported, so retaining one for repeated development installations does not automatically restore a removed calendar.

Google Workspace administrators can disable the secret address for work or school calendars. If it is missing, the account administrator must allow it; SNFolio cannot generate that address.

## Apple iCloud Calendar: editable two-way events

1. Sign in at [account.apple.com](https://account.apple.com/), then open **Sign-In and Security → App-Specific Passwords → Generate an app-specific password**. Apple requires two-factor authentication for this feature; see [Apple's app-specific password instructions](https://support.apple.com/102654).
2. In SNFolio, open **Feeds / Config → Calendars & Sync**.
3. Select **Apple iCloud**.
4. Enter the Apple Account email and app-specific password.
5. Tap **Connect & Test iCloud CalDAV**.
6. Confirm the displayed target calendar, then use **Sync Now**.

SNFolio pushes local changes before pulling remote changes. Successful device testing covers event creation, editing, deletion, recurrence, remote creation/deletion, restart persistence, and duplicate prevention.

## Apple Reminders limitation

Modern Apple Reminders lists are not exposed through iCloud's CalDAV service. An iCloud collection advertised as `Reminders` may accept a VTODO request without showing that task in the current Reminders app.

The practical options are:

- Keep SNFolio tasks on the Supernote.
- Enable **Push tasks to my calendar as events** for dated tasks. These appear in Apple Calendar, not Reminders.
- Connect a separate service that supports CalDAV VTODO and add that same account to the Apple device. This is optional and provider-dependent.

## Custom CalDAV

Choose **Custom / Other** and provide:

- the provider's CalDAV server URL;
- the account username;
- the account or app-specific password.

SNFolio discovers the available calendar collections and selects a writable event calendar. Use the diagnostic trace only when connection or synchronization fails. VTODO task synchronization is configured separately because many calendar collections do not support tasks.

Task events mirrored to Apple Calendar carry a private SNFolio marker. They remain visible on Apple devices but are not pulled back into SNFolio as duplicate calendar events.

## Imported `.ics` files

Use **Import Setup or Calendar File** and select an `.ics` file. SNFolio copies its contents into private plugin storage, so moving the original file does not remove the imported calendar. This is a snapshot rather than a live subscription; import a newer file when the source changes.

## Terms

- **ICS / iCalendar** is a calendar data format.
- **iCal feed** is a URL that publishes ICS data. In SNFolio it is read-only.
- **CalDAV** is an account protocol that can read and write calendars.
- **VTODO** is the task component of iCalendar. Provider support varies.
- **App-specific password** is a revocable password created for a third-party application instead of using the main account password.

If the primary Apple Account password is changed or reset, Apple revokes its app-specific passwords. Generate a new one before reconnecting SNFolio.
