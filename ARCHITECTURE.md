# Architecture

Remember Me (ذكرني, internally "Waqt") is an offline-first Electron app for Windows. It is plain
JavaScript with no framework and no build step: `src/` runs in the main process, `ui/` is loaded
as-is into sandboxed windows, and `node --test` runs the unit tests directly against the sources.

The sections below describe responsibilities. This table is the one place that says which file
holds each one, so after files move or split, update the right-hand column and the sections stay
true (see "Keeping this document current").

| Responsibility | Where |
|---|---|
| App lifecycle, windows, tray, scheduler loop, IPC handler | `src/main.js` |
| Bridge into the pages (`window.waqt`) | `src/preload.js` |
| IPC allowlists and payload checks | `src/ipc.js` |
| Task logic, data validation, durable `Store` | `src/core.js` |
| "Remind me again" sound timer | `src/repeat-beep.js` |
| Alert window placement next to the taskbar | `src/placement.js` |
| Attachments: import, lookup, orphan cleanup, backup export | `src/attachments.js` |
| Backup reading, verification, restore, rotation | `src/backups.js` |
| Google Drive folder backups | `src/drive-backup.js` |
| Image thumbnails | `src/image-preview.js` |
| Local log | `src/logger.js` |
| Main window and sticky alert pages, shared scripts and CSS | `ui/` |
| Packaging, installer, icon and dark-theme generators | `tools/` |
| Unit tests (`node --test`) and Playwright desktop suites (`*-desktop.cjs`, `desktop-smoke.cjs`) | `tests/` |
| Lint rules (folder-agnostic) and editor settings | `eslint.config.cjs`, `.editorconfig` |

## Processes and windows

The main process holds a single-instance lock, creates the main window (hidden to the tray when closed),
the tray icon and, when reminders are due, a frameless always-on-top alert window. Both windows use
`contextIsolation`, `sandbox`, `nodeIntegration: false`, a strict CSP in their HTML, and deny new
windows, navigation, webviews and every browser permission request.

The preload script exposes two functions to the pages:

- `window.waqt.call(action, payload)` invokes the single `waqt:action` IPC channel and resolves to
  `{ ok: true, value }` or `{ ok: false, error }` (the error text is already in the UI language);
- `window.waqt.onUpdate(callback)` fires when the main process sends `waqt:update` after a change.

## IPC actions and validation

Every request goes through one `ipcMain.handle('waqt:action')` handler, which:

1. accepts it only from the main window or the alert window, and only when the sending frame is the
   window's own bundled page (`fromPage`);
2. runs `checkRequest(action, payload, { fromAlert })`, which rejects unknown actions (`ACTIONS`),
   limits the alert window to `ALERT_ACTIONS`, requires a plain-object payload, requires a short
   string `id` for `ID_ACTIONS`, and checks `expectedDueAt` for `DUE_ACTIONS`;
3. runs the action. Anything that changes data goes through `store.change()`, after which the
   scheduler rescans and both windows are told to refresh.

| Group | Actions |
|---|---|
| Read | `state`, `alerts`, `language`, `undoable`, `storage` |
| Tasks | `saveTask`, `complete`, `skip`, `snooze`, `undoComplete`, `reopen` |
| Trash | `deleteTask`, `restoreTask`, `purgeTask`, `deleteNote`, `restoreNote`, `purgeNote`, `emptyTrash` |
| Notes | `saveNote` |
| Attachments | `attachFiles`, `openAttachment`, `imagePreview`, `cleanOrphans` |
| Backups | `export`, `restore`, `chooseDriveFolder`, `driveBackupNow`, `driveAutomatic`, `driveKeep`, `driveHelp`, `openDriveFolder` |
| App | `settings`, `preview`, `dataFolder`, `open` |

The alert window may only use `alerts`, `language`, `complete`, `skip`, `undoComplete`, `undoable`,
`snooze`, `open`, `openAttachment` and `imagePreview`. It can open or preview only attachments of a
reminder it is currently showing.

`complete`, `skip` and `snooze` carry the `expectedDueAt` the user saw. When the task has moved on
(a double click, or an action from the other window), core ignores the call: `completeTask` returns
`null`, `skipOccurrence` and `snoozeTask` return `false`.

## Data: data.json

Everything lives in the data folder, `%APPDATA%\Waqt` (overridable only in test mode through
`WAQT_TEST=1` and `WAQT_DATA_DIR`):

```
data.json, data.json.bak        the current data and the previous good copy
data.json.damaged-<time>        a file that failed to load, kept untouched
attachments/<id>/<name>         one folder per attachment
backups/Waqt-backup-<time>/     automatic and safety backups
drive-backup.json               Google Drive backup settings and status
logs/remember-me.log[.1|.2]     the local log (see Logging)
```

`Store` validates every change before writing it: it copies `data.json` to
`data.json.bak` with an fsync, writes `data.json.tmp`, fsyncs it, and renames it into place, retrying
briefly when antivirus or the search indexer has the file locked (`writeDurable`,
`renameWithRetry`). A failed change leaves both the file and the in-memory state unchanged. On
startup a damaged `data.json` is quarantined and the `.bak` copy is loaded instead.

`validateState` normalizes odd values rather than rejecting the file, so one bad field never hides
all data. The shape (`version` is always `1`):

```js
{
  version: 1,
  tasks: [{
    id, title, body, priority: 'normal'|'medium'|'high', category: 'personal'|'work'|'study',
    dueAt: ISO|null,          // when the reminder fires; moved by snooze and "only this time"
    scheduleAt: ISO|null,     // the series anchor the next occurrence is computed from
    repeat: 'none'|'daily'|'weekly'|'days'|'interval'|'monthly'|'yearly',
    repeatDays?: [0-6],       // only for 'days' (0 = Sunday)
    repeatEvery?: 2-365,      // only for 'interval'
    repeatFrom?: ISO,         // only for 'monthly'/'yearly': the date the count starts from
    remindBefore?: 5|10|15|30|60|1440,  // minutes, for the early notification
    snoozedAt: ISO|null, completedAt: ISO|null, deletedAt?: ISO|null,
    sourceId?: id,            // on completed copies of a repeating task
    attachments: [attachmentId], createdAt, updatedAt
  }],
  notes: [{ id, title, body, color: 'cream'|'green'|'blue'|'pink', attachments, createdAt, updatedAt, deletedAt? }],
  attachments: [{ id, name, size, addedAt }],
  settings: {
    sound: true, startAtLogin: false, alertSide: 'right'|'left', language: 'ar'|'en',
    weekStart: 6|0|1, theme: 'system'|'light'|'dark',
    remindAgain?: 0|2|5|15    // minutes between repeated alert sounds; absent means off
  }
}
```

Fields marked `?` are optional and absent in older files. Data written by v1.4.0 loads unchanged
apart from defaults for settings it did not have; the removed `settings.hijri` and
`settings.digits` are deleted on load. Completing a repeating task keeps the task and adds a
completed copy with `repeat: 'none'` and `sourceId`. Deleted items get `deletedAt` and stay in the
trash for 30 days.

## Scheduler

`scan()` runs every second, on resume and on unlock, and never throws (a failure is logged and the
next tick tries again). Each scan:

1. shows early notifications from `upcomingTasks()` (`remindBefore` minutes before `dueAt`), once per
   task and due time;
2. builds the alert queue with `alertQueue(state, preview)`: every active, untrashed task whose
   `dueAt` has passed, oldest first. The preview alert shows only when nothing real is due, and a real
   reminder drops it for good;
3. creates or shows the alert window while the queue is not empty, beeps once for a newly due
   reminder, and feeds `createRepeatBeep()` so an unanswered alert beeps again every `remindAgain`
   minutes (at most 6 times, in memory only);
4. destroys the alert window once the queue is empty (after the short undo window for a Done made
   in the alert), and swaps the tray icon to its dotted variant only when the waiting state changes.

Overdue reminders survive restarts because they are simply tasks whose `dueAt` is in the past.
Completing a repeating task moves `dueAt` and `scheduleAt` to `nextOccurrence(scheduleAt, repeat,
now, task)`, which keeps the local wall-clock time across DST changes and never schedules in the
past. A second timer, every minute, runs the Drive backup tick and removes trash older than 30 days.

## Backups, Google Drive and restore

- **Export** (`exportBackup`) writes a new folder with `data.json`, every referenced attachment and
  `backup.json`, which lists a SHA-256 checksum for each file. `data.json` is written last, so a
  folder that has it is complete. An attachment whose file is missing is left out (and dropped from
  the copied `data.json`), reported as `skipped`, and never blocks the backup.
- **Restore** (`readBackup`, `restoreBackup`) verifies every file against its checksum (older
  backups without checksums are checked for presence and size), exports a safety copy of the current
  data, copies the attachments in, and replaces the state in one `Store` commit.
- **Google Drive** (`DriveBackup`) needs no Google account access: the user picks a folder synced
  by Google Drive for desktop, and the app copies a fresh local snapshot there once a day (or on
  demand). If the folder is unavailable, the snapshot stays pending and is retried; a pending
  snapshot is reused only while the data is unchanged and it is under a day old. Settings warns when
  the folder has been missing for more than a day. Optional rotation keeps only the newest automatic
  copies; manual exports and safety copies are never rotated.

## Logging

The logger appends one JSON line per event to `logs/remember-me.log` in the data folder,
rotating at 1 MB and keeping three files (at most 3 MB), so a user can attach it to a bug report.
Settings' "Open data folder" shows it. It records:

- `start` (version, whether packaged, and task, note and attachment counts), `quit` and `resume`;
- `data-recovered-from-bak` when `data.json` could not be read and the `.bak` copy was loaded;
- `start-failed`, `scan-failed` (once per distinct error, then at most every 10 minutes) and
  `trash-purge-failed`;
- `action-failed` with the IPC action name, for any request that returned an error;
- `export`, `restore`, `clean-orphans`, `trash-purged`, `drive-backup`, `drive-backup-failed` and
  `backup-rotation-failed`, with counts.

It never records task, note or attachment titles, bodies or file names. Callers pass only ids,
counts and outcomes. Error messages have every «…», "…" and '…' quotation blanked, because the
app's messages and Node's file errors put names and paths there, and stack frames keep only
`file:line:column`, so the Windows user name in the install path is not logged. Logging never
throws.

Chromium's own files: Electron starts no crash reporter unless `crashReporter.start()` is called,
and the app never calls it, so no crash dumps are written or uploaded and no `Crashpad` folder is
created. No `debug.log` is written unless Chromium logging is turned on with `--enable-logging`.
The data folder also holds Chromium's caches (GPU and shader caches, Local Storage and so on),
which Chromium keeps bounded. Backups never include them.

## Packaging and releases

- `pnpm run package` (`tools/package.mjs`) runs `@electron/packager` into `release/v<version>/`,
  bundling only `package.json`, `LICENSE`, `src/`, `ui/` and `assets/`, and keeping only the Arabic
  and English Chromium locales.
- `pnpm run installer` (`tools/installer.cjs`) turns that folder into a per-user NSIS installer,
  `release/installer/Remember-Me-Setup-<version>-x64.exe`.
- `.github/workflows/test.yml` runs the unit tests and ESLint on Windows for every pull request.
  `.github/workflows/desktop.yml` packages the app and runs `tests/desktop-smoke.cjs` against the
  packaged build with Playwright.
  `.github/workflows/release.yml` runs on a `v*` tag: it checks the tag against `package.json`,
  runs the tests, builds the installer, writes `SHA256SUMS.txt`, attests the build provenance and
  publishes a GitHub release.
- `tools/build-assets.cjs` regenerates the icons, including the tray's "waiting" variant, and
  `tools/dark-theme.cjs` regenerates `ui/dark.css` from the light stylesheets (a test checks it is
  up to date).

## Keeping this document current

- A module moved, split or added: update the table at the top.
- An IPC action added or removed: update the actions table (a unit test fails while any action in
  the allowlist is missing from it).
- A field added to `data.json`: update the shape above and say what an absent value means, so
  older files keep loading (a unit test fails while a default setting is missing from the shape).
- A new log event: add it to the list in Logging, with the ids or counts it records.
