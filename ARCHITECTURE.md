# Architecture

Remember Me (ذكرني) is an offline-first Electron app for Windows. Up to v1.4 it was named "Waqt"
internally, a name that survives in the app ID and the test variables. It is plain
JavaScript with no framework and no build step: `src/` runs in the main process, `ui/` is loaded
as-is into sandboxed windows, and `node --test` runs the unit tests directly against the sources.

The sections below describe responsibilities. This table is the one place that says which file
holds each one, so after files move or split, update the right-hand column and the sections stay
true (see "Keeping this document current").

| Responsibility | Where |
|---|---|
| App lifecycle: data folder, log, single-instance lock, start and quit | `src/main/index.js` |
| Main and alert windows, theme, page options | `src/main/windows.js` |
| Tray icon, menu (pause, About, Report a problem, exit) and tooltip | `src/main/tray.js` |
| Scan loop, alert queue, sounds, early notices, preview and undo window | `src/main/scheduler.js` |
| Interface text in the main process (`tr()`, `errorText()`) | `src/main/i18n.js` |
| Crash and error capture, the "Report this problem" offer | `src/main/problems.js` |
| IPC entry point and handler registry | `src/main/handlers/index.js` |
| IPC handlers, one file per area | `src/main/handlers/*.js` |
| IPC allowlists and payload checks | `src/main/ipc.js` |
| Bridge into the pages (`window.waqt`) | `src/main/preload.js` |
| Task logic and data validation (`saveTask`, `completeTask`, `validateState`, …) | `src/core/tasks.js` |
| The data.json file layer (`Store`, `writeDurable`) | `src/core/store.js` |
| When a repeating task comes back (`nextOccurrence`) | `src/core/repeat.js` |
| Attachment ids, record checks and limits | `src/core/records.js` |
| English errors with a translation key (`UserError`) | `src/core/errors.js` |
| "Remind me again" sound timer | `src/core/repeat-beep.js` |
| Alert window placement next to the taskbar | `src/core/placement.js` |
| Pausing reminders from the tray | `src/core/pause.js` |
| "Coming up" notifications, each once and kept clickable | `src/core/early-notices.js` |
| Attachment files: import, lookup, orphan cleanup, backup export | `src/data/attachments.js` |
| Backup reading, verification, restore, rotation | `src/data/backups.js` |
| Google Drive folder backups | `src/data/drive-backup.js` |
| Image thumbnails | `src/data/image-preview.js` |
| CSV and iCalendar import and export | `src/data/interchange.js` |
| Local log | `src/platform/logger.js` |
| Moving the data folder from `Waqt` to `Remember Me` | `src/platform/data-folder.js` |
| Start with Windows entry | `src/platform/login-item.js` |
| Update checks, download and install policy | `src/platform/updates.js` |
| About card: link allowlist and diagnostic info | `src/platform/about.js` |
| Pre-filled GitHub issue for a problem report, with redacted log lines | `src/platform/problem-report.js` |
| Palette colors for window backgrounds, read from `ui/styles/theme.css` | `src/platform/themes.js` |
| The two pages (main window, sticky alert) | `ui/index.html`, `ui/alert.html` |
| Main window scripts: plain scripts loaded in order, sharing one scope (state, render, cards, editors, trash, settings, events, boot) | `ui/main/*.js` |
| Alert window script | `ui/alert/alert.js` |
| Shared by both windows: languages (`translate.js`, `i18n.js`), helpers and icons (`shared.js`), keeping keyboard focus when lists are rebuilt (`focus.js`), search, alert formatting | `ui/lib/*.js` |
| Stylesheets and theme tokens | `ui/styles/*.css` |
| Translations | `ui/locales/*.json` |
| Packaging, installer, winget manifests, icon generator, screenshots, website images | `tools/` |
| Website (GitHub Pages, English and Arabic, no scripts) | `site/` |
| Unit tests (`node --test`) and Playwright desktop suites (`*-desktop.cjs`, `desktop-smoke.cjs`) | `tests/` |
| Lint rules (folder-agnostic) and editor settings | `eslint.config.cjs`, `.editorconfig` |

## Processes and windows

The main process holds a single-instance lock, creates the main window (hidden to the tray when closed),
the tray icon and, when reminders are due, a frameless always-on-top alert window. Both windows use
`contextIsolation`, `sandbox`, `nodeIntegration: false`, a strict CSP in their HTML, and deny new
windows, navigation, webviews and every browser permission request.

The preload script exposes these functions to the pages:

- `window.waqt.call(action, payload)` invokes the single `waqt:action` IPC channel and resolves to
  `{ ok: true, value }` or `{ ok: false, error }` (the error text is already in the UI language);
- `window.waqt.onUpdate(callback)` fires when the main process sends `waqt:update` after a change;
- `window.waqt.onShow(callback)` fires on `waqt:show` with a section name (only `'about'`), the
  tray's "About Remember Me".

Main sends it once the page has loaded, so it also works when the tray recreates the window.

The tray's "New task" and the alert's "Open task" leave an open request (`'new'` or a task ID)
that the next `state` read returns as `openTask`; the main window then opens that editor. This also
works for a window that is still being created.

## IPC actions and validation

Every request goes through one `ipcMain.handle('waqt:action')`, registered by the handler registry,
which:

1. accepts it only from the main window or the alert window, and only when the sending frame is the
   window's own bundled page (`fromPage`);
2. runs `checkRequest(action, payload, { fromAlert })`, which rejects unknown actions (`ACTIONS`),
   limits the alert window to `ALERT_ACTIONS`, requires a plain-object payload, requires a short
   string `id` for `ID_ACTIONS`, checks `expectedDueAt` for `DUE_ACTIONS`, and accepts `openLink`
   only with a `link` ID from the About module's fixed list;
3. runs the action's handler. Anything that changes data goes through `store.change()`, after which
   the scheduler rescans and both windows are told to refresh, unless the handler is `readOnly`.

Each area's handler file exports `(ctx) => ({ action: { run(payload, { event, fromAlert }), readOnly } })`.
`ctx` is the main process's shared context: the store, windows, services, `tr()` and Electron's
`dialog`, `shell` and `clipboard` (passed in so the handlers load in plain Node tests). At startup the
registry throws if an allowed action has no handler, has two, or a handler is not allowed;
`tests/handlers.test.js` checks the same and pins the `readOnly` set.

| Group | Actions |
|---|---|
| Read | `state`, `alerts`, `language`, `locale`, `undoable`, `storage` |
| Tasks | `saveTask`, `complete`, `skip`, `snooze`, `undoComplete`, `reopen`, `toggleStep` |
| Trash | `deleteTask`, `restoreTask`, `purgeTask`, `deleteNote`, `restoreNote`, `purgeNote`, `emptyTrash` |
| Notes | `saveNote` |
| Attachments | `attachFiles`, `openAttachment`, `imagePreview`, `cleanOrphans` |
| Backups | `export`, `restore`, `chooseDriveFolder`, `driveBackupNow`, `driveAutomatic`, `driveKeep`, `driveHelp`, `openDriveFolder` |
| Updates | `updateConsent`, `checkUpdates`, `installUpdate`, `dismissUpdate` |
| About | `openLink`, `copyDiagnostics`, `reportProblem`, `openLogs` |
| App | `settings`, `relaunch`, `preview`, `dataFolder`, `open` |

The alert window may only use `alerts`, `language`, `locale`, `complete`, `skip`, `undoComplete`,
`undoable`, `snooze`, `open` (optionally with the shown task's `id`), `openAttachment` and
`imagePreview`. It can open or preview only attachments of a
reminder it is currently showing.

`complete`, `skip` and `snooze` carry the `expectedDueAt` the user saw. When the task has moved on
(a double click, or an action from the other window), core ignores the call: `completeTask` returns
`null`, `skipOccurrence` and `snoozeTask` return `false`.

## Data: data.json

Everything lives in the data folder, `%APPDATA%\Remember Me` (overridable only in test mode through
`WAQT_TEST=1` and `WAQT_DATA_DIR`):

```
data.json, data.json.bak        the current data and the previous good copy
data.json.damaged-<time>        a file that failed to load, kept untouched
attachments/<id>/<name>         one folder per attachment
backups/RememberMe-backup-<time>/  automatic backups (older ones are named Waqt-backup-)
backups/RememberMe-before-*/    safety copies made before a restore or an update
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
    repeatFrom?: ISO,         // the series anchor: every repeat's time of day, and where monthly/yearly
                              // count from; only a new time or repeat mode moves it. Absent before v1.5
                              // for other modes (then the current occurrence's time is used)
    remindBefore?: 5|10|15|30|60|1440,  // minutes, for the early notification
    tags?: [string],          // up to 10 short labels
    checklist?: [{ id, text, done }],  // up to 50 steps
    snoozeCount?: 1-999,      // snoozes of the current occurrence; reset when it is done, skipped or moved
    snoozedAt: ISO|null, completedAt: ISO|null, deletedAt?: ISO|null,
    sourceId?: id,            // on completed copies of a repeating task
    attachments: [attachmentId], createdAt, updatedAt
  }],
  notes: [{ id, title, body, color: 'cream'|'yellow'|'orange'|'red'|'pink'|'purple'|'blue'|'green'|'gray'|'white',
           style?: 'plain'|'sticky'|'lined',  // absent (v1.4.0 notes) shows as plain
           attachments, createdAt, updatedAt, deletedAt? }],
  attachments: [{ id, name, size, addedAt }],
  settings: {
    sound: true, startAtLogin: false, alertSide: 'right'|'left', language: 'en'|'ar'|'es'|…,  // a code from LOCALES in ui/lib/translate.js; new installs use 'en'
    weekStart: 6|0|1, theme: 'system'|'light'|'dark',
    palette: 'lavender'|'ocean'|'forest'|'sunset'|'graphite'|'contrast',  // ui/styles/theme.css
    autoUpdate: null|true|false,  // consent to background update checks; null means not asked yet
    remindAgain?: 0|2|5|15,   // minutes between repeated alert sounds; absent means off
    pausedUntil: null|'<ISO time>'|'manual'  // reminders paused from the tray; null means not paused
  }
}
```

Fields marked `?` are optional and absent in older files. Data written by v1.4.0 loads unchanged
apart from defaults for settings it did not have; the removed `settings.hijri` and
`settings.digits` are deleted on load. Completing a repeating task keeps the task and adds a
completed copy with `repeat: 'none'` and `sourceId`. Deleted items get `deletedAt` and stay in the
trash for 30 days.

### Moving the data folder

Up to v1.4 the data folder was `%APPDATA%\Waqt`. At startup, before anything else touches the data
folder (even the single-instance lock), the data-folder module moves it to `%APPDATA%\Remember Me`
when the new folder has no data yet: it renames the whole folder, or, if the folder is locked, copies
it, checks the copy, and renames the old folder to `Waqt.migrated-<time>`. An empty new folder (left
by a development build, say) is set aside as `Remember Me.unused-<time>` first. The old data is never
deleted. If anything fails the old folder is used as it is, and the move is retried on the next
start. `drive-backup.json` paths that pointed into the old folder are rewritten to the new one.

## Interface languages

Source text is English: pages and scripts hold English strings, and each English string is the key
into `ui/locales/<code>.json` (a `key@context` suffix separates identical English words with different
translations). `ui/lib/translate.js` lists the languages (`LOCALES`: code, own name, direction, Intl and
Chromium locale) and formats messages, including plural forms through `Intl.PluralRules` and
`{name}` placeholders. Missing keys fall back to English.

- The main process reads the locale files and serves them to the windows through the `locale`
  action, since the pages have no file access. `tr()` in the main process (`src/main/i18n.js`) translates the tray, dialogs
  and errors; modules throw English errors (`UserError` in `src/core/errors.js` carries a key and values).
- In the pages, `setLanguage()` in `ui/lib/i18n.js` translates static text and attributes on each switch
  and sets `lang` and `dir`; user content sits in `translate="no"` containers. Scripts call `tr()`.
- Dates and numbers always use Western digits (`-u-nu-latn`). CSS uses logical properties, so the
  layout mirrors for right-to-left languages.
- `tools/i18n-keys.cjs` collects every key from the code; `tests/i18n.test.js` checks that each
  locale has every key with the same placeholders and plural forms.

## Scheduler

`scan()` runs every second, on resume and on unlock, and never throws (a failure is logged and the
next tick tries again). Each scan:

1. shows early notifications from `upcomingTasks()` (`remindBefore` minutes before `dueAt`), once per
   task and due time. A notice moment at or before the task's `updatedAt` is skipped, so a snooze,
   a late Done or an edit that moves the time into the lead window doesn't announce it at once;
2. builds the alert queue with `alertQueue(state, preview)`: every active, untrashed task whose
   `dueAt` has passed, oldest first. The preview alert shows only when nothing real is due, and a real
   reminder drops it for good;
3. creates or shows the alert window while the queue is not empty, beeps once for a newly due
   reminder, and feeds `createRepeatBeep()` so an unanswered alert beeps again every `remindAgain`
   minutes (at most 6 times, in memory only);
4. destroys the alert window once the queue is empty (after the short undo window for a Done made
   in the alert), and swaps the tray icon to its dotted variant only when the waiting state changes.

While reminders are paused from the tray (`settings.pausedUntil`, handled by the pause module), the
scan opens no alert window, plays no sound and sends no early notices (they are recorded, so none
arrive in a burst afterwards). Due reminders stay queued and
appear, with one sound, when the pause ends. An ended pause clears itself on the next scan.

Overdue reminders survive restarts because they are simply tasks whose `dueAt` is in the past.
Completing a repeating task moves `dueAt` and `scheduleAt` to `nextOccurrence(scheduleAt, repeat,
now, task)`, which never schedules in the past and rebuilds each occurrence from a calendar day plus
the time of day of `repeatFrom`. So the local wall-clock time holds across DST changes: an
occurrence that falls in a spring-forward gap fires an hour later, and the next one is back on time. A second timer, every minute, runs the Drive backup tick and removes trash older than 30 days.

## Backups, Google Drive and restore

- **Export** (`exportBackup`) writes a new folder with `data.json`, every referenced attachment and
  `backup.json`, which lists a SHA-256 checksum for each file. `data.json` is written last, so a
  folder that has it is complete. An attachment whose file is missing is left out (and dropped from
  the copied `data.json`), reported as `skipped`, and never blocks the backup.
- **Restore** (`readBackup`, `restoreBackup`) verifies every file against its checksum (older
  backups without checksums are checked for presence and size), exports a safety copy of the current
  data, copies the attachments in, and replaces the state in one `Store` commit. Settings about this
  PC (`autoUpdate`, `startAtLogin`, `pausedUntil`) keep their current values; the rest come from the
  backup and apply at once.
- **Google Drive** (`DriveBackup`) needs no Google account access: the user picks a folder synced
  by Google Drive for desktop, and the app copies a fresh local snapshot there once a day (or on
  demand). If the folder is unavailable, the snapshot stays pending and is retried; a pending
  snapshot is reused only while the data is unchanged and it is under a day old. Settings warns when
  the folder has been missing for more than a day. Optional rotation keeps only the newest automatic
  copies; manual exports and safety copies are never rotated.

## Start with Windows

The login-item module registers the executable with `--background`, so the app starts hidden in the
tray. After an upgrade the entry may still point at the old `Waqt.exe` or an old install folder, so
at startup (packaged builds, setting on) the old entries are removed and the current executable is
registered again, keeping the entry disabled if the user disabled it in Task Manager.

## Updates

The updates module wraps electron-updater with the app's policy:

- New versions come from this repository's GitHub Releases over HTTPS. The feed is set in code and
  in `resources/app-update.yml`. Downloads are checked against the SHA-512 in the release's
  `latest.yml`; once releases are code-signed, the publisher name will be checked too.
- Background checks need consent (`settings.autoUpdate === true`, asked once): about 30 seconds after
  start, then once a day. "Check now" in Settings works either way. Prereleases and downgrades are
  never offered.
- A downloaded update installs only when the user chooses "Restart now", or on the next normal quit.
  The app never restarts on its own. Either way a safety copy of the data
  (`RememberMe-before-update-<time>`) is made first; if it fails, nothing is installed.
- Test mode replaces the updater with a stub that never contacts GitHub. So does a copy without
  `Uninstall Remember Me.exe` next to its exe (the portable build, or one Scoop unpacked): its
  updates come from elsewhere, so it reports updates as unavailable and the window asks no consent.

## About

Settings ends with an About card (also opened by "About Remember Me" in the tray menu): the icon,
name, version and links, "Check for updates" (the same `checkUpdates` action and status text as the
Updates card), "Copy diagnostic info" and "Open log folder".

- Links: the page sends `openLink` with an ID (`github`, `repo`, `releases`, `issues`, `privacy`,
  `license`), never a URL. The About module maps the ID to an exact `https://github.com/...` address
  and main passes only that to `shell.openExternal`. An unknown ID is rejected in `checkRequest`.
- `copyDiagnostics` builds the text in main and writes it with Electron's `clipboard` (the pages
  have no clipboard permission): the app, Electron, Chromium and Node versions, the Windows version
  and architecture, the UI language and the theme. Never tasks, notes, file names or paths.
- `openLogs` creates `logs/` if needed and opens it in File Explorer.
- `reportProblem` opens a problem report (see Problem reports). The same report opens from the
  flag button in the main window's top bar and from "Report a problem" in the tray menu.

The alert window can use none of these actions.

## Logging

The logger appends one JSON line per event to `logs/remember-me.log` in the data folder,
rotating at 1 MB and keeping three files (at most 3 MB), so a user can attach it to a bug report.
Settings' "Open data folder" and About's "Open log folder" show it. It records:

- `start` (version, whether packaged, and task, note and attachment counts), `quit` and `resume`;
- `data-folder-migrated` (renamed or copied) and `data-folder-migration-failed`, and
  `login-item-refresh-failed`;
- `update` on each change of update state (checking, downloading, ready, installing, latest,
  unavailable, error), with the current and next version only, never feed URLs or paths;
- `data-recovered-from-bak` when `data.json` could not be read and the `.bak` copy was loaded;
- `start-failed`, `scan-failed` (once per distinct error, then at most every 10 minutes) and
  `trash-purge-failed`;
- `action-failed` with the IPC action name, for any request that returned an error;
- `export`, `restore`, `clean-orphans`, `trash-purged`, `drive-backup`, `drive-backup-failed` and
  `backup-rotation-failed`, with counts;
- `uncaught-exception`, `unhandled-rejection`, `render-process-gone` and `child-process-gone`
  (process type, reason and exit code; a warning for a clean exit or a kill), and
  `problem-report-opened` (kind, line count, whether the log was cut).

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

## Problem reports

`src/main/problems.js` listens for `uncaughtException` and `unhandledRejection` on the main process
and for Electron's `render-process-gone` and `child-process-gone`, and logs them. A crash (an
uncaught exception, or a process that ended as `crashed`, `oom`, `launch-failed`,
`integrity-failure` or `abnormal-exit`), or 3 logged errors within 10 minutes, shows a dialog
offering "Report this problem", at most once per run and never in test runs. Users can also open a
report at any time from the About card, the top bar or the tray.

A report only calls `shell.openExternal` with `.../Remember-Me/issues/new?title=...&body=...`; the
app has no reporting endpoint and sends nothing. `src/platform/problem-report.js` builds the body: an
empty "What happened?" section, the app version, Windows version and architecture, UI language and
theme, and the last 30 log lines. Each line is re-parsed as the logger's JSON (anything else is
dropped), only numbers, booleans and strings are kept, and every string has the data folder, the
user profile and any other `X:\Users\<name>` path replaced, then goes through the logger's
`redact()`. The oldest lines are dropped until the URL is at most 7000 characters, and the body
says how many were left out.

## Packaging and releases

- `pnpm run package` (`tools/package.mjs`) runs `@electron/packager` into `release/v<version>/`,
  producing `Remember Me.exe`. It bundles only `package.json`, `LICENSE`, `src/`, `ui/` and
  `assets/`, plus the runtime dependencies (electron-updater and what it needs) copied in as one flat
  `node_modules` folder, since pnpm links packages instead of nesting them. It keeps only the Chromium
  locales of the interface languages and writes `resources/app-update.yml` for the updater. Finally it
  sets Electron fuses on the exe and reads them back: no running as Node.js, no `NODE_OPTIONS`, no
  `--inspect`, app code only from the checked `app.asar`. `WAQT_DESKTOP_TEST_BUILD=1` keeps
  `--inspect` allowed, because Playwright attaches through it.
- `pnpm run installer` (`tools/installer.cjs`) turns that folder into a per-user NSIS installer,
  `release/installer/Remember-Me-Setup-<version>-x64.exe`, with the `latest.yml` and `.blockmap`
  files the updater reads. The installer keeps the v1.4 app ID, so it upgrades older installs.
- `.github/workflows/test.yml` runs the unit tests and ESLint on Windows for every pull request.
  `.github/workflows/desktop.yml` packages a desktop test build and runs `tests/desktop-smoke.cjs`
  against it with Playwright.
  `.github/workflows/release.yml` has two jobs. `build`, with a read-only token that isn't kept in
  the checkout, checks a `v*` tag against `package.json`, runs the tests, builds the installer,
  writes `SHA256SUMS.txt` and winget manifests (`tools/winget-manifest.mjs`) and uploads them as
  artifacts. `publish` runs only for tag pushes, in the `release` environment, and runs no
  repository code: it checks the checksums, attests the installer and publishes the GitHub release
  with `latest.yml` and the `.blockmap`. Actions are pinned to commit SHAs, kept current by
  Dependabot. `RELEASING.md` is the release checklist.
- `tools/build-assets.cjs` (`pnpm run assets`, run by Electron) regenerates the icons. A hidden
  sandboxed window's preload (`tools/build-assets-preload.cjs`) draws each SVG at its exact pixel
  size on a canvas and sends the PNGs back over IPC. It writes `assets/icon.ico` (PNG entries at
  16, 20, 24, 32, 40, 48, 64, 96, 128 and 256 px; 32 px and below use the simplified
  `icon-small.svg` glyph), `icon.png` (256 px, for notifications and the pages), the tray images
  `tray.png` and `tray-waiting.png` (16 px, with `@1.5x` and `@2x` files that `nativeImage` loads on
  scaled displays) and `docs/icon-preview.png`. Windows use `icon.ico`, the tray uses the tray
  images, and the packager and installer embed `icon.ico`. `tests/icons.test.js` checks the sizes.
- Colors: `ui/styles/theme.css` defines every color as a token (`--accent`, `--surface`, `--ink`…) for each
  palette in light and dark (`[data-palette]` on <html>, `prefers-color-scheme` from nativeTheme), plus
  the note papers (`[data-paper]`). `styles.css` and `alert.css` only use tokens. `tests/theme.test.js`
  checks WCAG contrast for every palette and mode and fails on hard-coded colors in those stylesheets.

## Keeping this document current

- A module moved, split or added: update the table at the top.
- An IPC action added or removed: update the actions table (a unit test fails while any action in
  the allowlist is missing from it).
- A field added to `data.json`: update the shape above and say what an absent value means, so
  older files keep loading (a unit test fails while a default setting is missing from the shape).
- A new log event: add it to the list in Logging, with the ids or counts it records.
