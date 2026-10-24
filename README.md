# Remember Me

<p align="center">
  <img src="assets/icon.png" width="112" alt="Remember Me icon">
</p>

<p align="center">
  <a href="https://github.com/sarmadiq9090-coder/Remember-Me/actions"><img src="https://img.shields.io/github/actions/workflow/status/sarmadiq9090-coder/Remember-Me/test.yml?branch=main&label=tests" alt="Tests"></a>
  <a href="https://github.com/sarmadiq9090-coder/Remember-Me/releases/latest"><img src="https://img.shields.io/github/v/release/sarmadiq9090-coder/Remember-Me" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/sarmadiq9090-coder/Remember-Me" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4" alt="Windows 10 and 11">
</p>

<p align="center"><strong>A task, note and reminder app for Windows whose alerts stay on screen until you deal with them.</strong></p>

Remember Me is an open-source desktop app for 64-bit Windows. It runs without an account or a permanent internet connection, keeps your data on your own device, and shows each reminder in a sticky window above the taskbar until you mark it done or snooze it. Missed reminders don't get lost in the notification center.

<p align="center">
  <img src="docs/screenshots/main-en.png" width="68%" alt="Remember Me main window: today's tasks and the next reminder">
  <img src="docs/screenshots/alert-en.png" width="23%" alt="Sticky reminder above the taskbar with Done and Snooze">
</p>

## Features

- **Sticky reminders:** a persistent alert above the taskbar, shown on top of other windows until you choose **Done** or snooze it.
- **Flexible snooze:** 5 minutes, 15 minutes, 1 hour, 24 hours, or any date and time you pick. Snoozes survive restarts.
- **Recurring tasks:** daily or weekly. Completing one logs it under *Completed* and schedules the next occurrence at the same wall-clock time, including across daylight-saving changes.
- **No dropped alerts:** several due reminders are queued and shown one at a time, with a count of how many are waiting.
- **Notes:** colored notes you can edit, search and delete.
- **Attachments:** add PDFs, Excel sheets, documents, images or any other file to tasks and notes, up to 20 files per item and 50 MB per file. Images preview inline, including in the alert.
- **Safe file handling:** programs, scripts, installers and shortcuts are revealed in File Explorer instead of being launched.
- **Smart search (Ctrl+K):** searches tasks and notes, and matches Arabic text regardless of diacritics and common spelling variants.
- **Arabic and English interfaces:** a full right-to-left Arabic UI and a left-to-right English UI, switchable in Settings. Mixed-language text keeps its reading order.
- **Local-first data:** atomic saves, an automatic `.bak` copy and automatic recovery if the data file is damaged.
- **Backups:** export a full backup with all attachments and checksums, restore one from Settings after it's verified, or copy daily backups into a synced Google Drive folder.
- **Runs in the background:** closing the window keeps Remember Me in the notification area, and it can start with Windows.

## Install

Download the latest installer from [Releases](https://github.com/sarmadiq9090-coder/Remember-Me/releases/latest) and run it on Windows 10 or 11 (64-bit). Your personal data never goes into the repository or the installer.

### Verify the download

The installer is built by GitHub Actions from the published source. It is not code-signed yet, so Windows SmartScreen may show "Windows protected your PC". Choose **More info**, then **Run anyway**, once you've verified the file.

Compare the file's fingerprint with `SHA256SUMS.txt` from the same release:

```powershell
Get-FileHash .\Remember-Me-Setup-1.4.0-x64.exe -Algorithm SHA256
```

With the GitHub CLI you can also confirm the file was built from this repository:

```powershell
gh attestation verify .\Remember-Me-Setup-1.4.0-x64.exe --repo sarmadiq9090-coder/Remember-Me
```

### Upgrading from v1.4.0 or earlier

Older versions stored their data in `%APPDATA%\Waqt`. The first time a newer version starts, it moves that folder to `%APPDATA%\Remember Me` automatically. If the folder can't be moved, Remember Me copies it, checks the copy and keeps the original as `%APPDATA%\Waqt.migrated-<date>`. It never deletes the old folder.

## Usage

- **New task:** a title, notes, a priority and an optional reminder time.
- **Today:** tasks without a date, today's tasks and anything overdue. **Upcoming:** tasks due after today.
- **Multiple reminders:** shown one after another, with no task skipped.
- **Recurring tasks:** missed occurrences roll forward to the next future one when you complete the task. Snoozing never changes the original repeat time.
- **Attachments:** while editing a task or note, choose **Add files**. Files are copied into Remember Me's data folder, so moving or deleting the original doesn't break the attachment. Removing an attachment from one item doesn't affect other items.
- **Opening files:** click an attachment to open it with the default Windows app. Excel files need a compatible app such as Excel.
- **Settings:** alert sound, start with Windows, alert position (left or right) and interface language.
- **Shortcuts:** Ctrl+N creates a task or note, Ctrl+K focuses search.

The bell button at the top shows a **preview alert**. Snoozing a preview only closes it, while reminders you set on tasks are real.

## Running in the background

Closing the main window keeps Remember Me running next to the Windows clock. Its icon may be under the hidden-icons arrow. Click it to open the app, or right-click it to quit completely.

Turn on **Settings → Start with Windows** to start reminders automatically when you sign in. It's off by default.

Alerts can't appear while the PC is off or asleep, or while the app isn't running. Missed reminders appear as soon as you return. Remember Me doesn't wake the PC, uses your device's local time, and doesn't appear over the secure Windows lock screen.

## Data and backups

Everything is stored locally in `%APPDATA%\Remember Me\data.json`, with the previous version kept in `data.json.bak`. Settings shows the exact path and a button to open it. Saves are atomic. If the main file is ever damaged, Remember Me restores the backup automatically and keeps the damaged file for inspection.

**Export backup** creates a new folder with `data.json`, an `attachments` folder containing every file linked to your tasks and notes (including completed tasks), and `backup.json` with a SHA-256 checksum for each file.

**Restore from backup** in Settings brings a backup back:

- Remember Me checks every file against its checksum first and shows the number of tasks, notes and attachments for you to confirm.
- Before replacing anything, it saves a safety copy of your current data in the `backups` folder.
- Backups made before checksums existed can still be restored. Remember Me only checks that their files are present and the right size, and labels them "unverified".

Settings also shows how much space attachments and backups use, and can clean up attachment files that no task or note uses any more.

To restore a backup manually instead:

1. Quit Remember Me from its notification-area menu.
2. Keep a copy of your current data.
3. Copy `data.json` and the `attachments` folder from the backup into the data folder.
4. Start the app.

Don't edit the data file while the app is running.

Updating from an earlier version keeps your tasks, notes and settings automatically.

### Google Drive backups

1. In Settings, choose **Install Google Drive and sign in** to get [Google Drive for desktop](https://www.google.com/drive/download/), then sign in.
2. Create a folder inside Google Drive, for example **Remember Me Backups**. In Remember Me, choose **Choose Google Drive folder** and select that synced folder.
3. Choose **Back up now**. A full local copy is saved in `%APPDATA%\Remember Me\backups`, then copied with all images and attachments into the Drive folder.
4. Google Drive uploads it to your account. Check the Drive icon or the Drive website to confirm the upload finished.

**Automatic daily backup** creates a copy every 24 hours while the app is running. If the Drive folder is unavailable, the local copy is kept and the copy to Drive is retried every 15 minutes. If the folder stays unavailable for more than a day, for example because Drive is signed out, Settings shows a warning.

To save space, you can choose to keep only the latest 5, 10 or 30 automatic backups. By default all of them are kept. Rotation asks for confirmation, and it never deletes backups you exported yourself or safety copies. No Google Cloud keys or paid add-ons are needed: sign-in and syncing are handled by the official Google Drive app.

## Development

Built with Electron, JavaScript, HTML and CSS. The interface is isolated from Node.js (`contextIsolation`, `sandbox`, a strict Content Security Policy and validated IPC); storage and scheduling run in the main process, and the UI loads nothing from the internet.

```sh
pnpm install
pnpm start
pnpm test
pnpm run package
pnpm run installer
```

Requires Node.js 22 or newer and pnpm 10. `pnpm run package` produces a portable build in `release/v<version>`, and `pnpm run installer` produces an NSIS installer in `release/installer`.

### Tests

- `tests/core.test.js`: scheduling, repeats, snoozing, saving and recovery.
- `tests/scheduling.test.js`: repeats across daylight-saving time, time-zone changes and the clock moving backwards; 20 reminders in the same minute; a full day of missed reminders among thousands of tasks.
- `tests/ipc.test.js`: only the app's own pages are accepted, the alert window gets a limited set of actions, and payloads are validated.
- `tests/search.test.js`: Arabic-aware search matching.
- `tests/data-folder.test.js` and `tests/login-item.test.js`: moving the old `Waqt` data folder, including locked and interrupted moves, and pointing start with Windows at the renamed executable.
- `tests/attachments.test.js`, `tests/backups.test.js` and `tests/drive-backup.test.js`: copying, export, checksums, restore, rotation, migration, validation and Drive-folder recovery.
- **Desktop tests (Playwright):** `tests/desktop-smoke.cjs`, `tests/attachments-desktop.cjs` and `tests/photos-drive-desktop.cjs` drive the real Windows app with temporary data. They need Playwright (and JSZip for attachments), or the `WAQT_PLAYWRIGHT` and `WAQT_JSZIP` paths.

### Releasing

Bump `version` in `package.json` and push a matching tag, such as `v1.4.1`. `.github/workflows/release.yml` runs the tests, builds the installer and publishes it to Releases with `SHA256SUMS.txt` and build provenance. Running the workflow by hand only builds the files and publishes nothing. Code signing needs a SignPath (free for open source), Azure Trusted Signing or certificate account, which can then be added to the installer step.

## Acknowledgements

The task and note layout was inspired by [TickTick for Windows](https://www.ticktick.com/windows), and the Done and Snooze buttons by [its reminders](https://help.ticktick.com/articles/7055782395743567872). Remember Me's design and code are independent, with a particular focus on sticky alerts and snoozing to a custom time.

## Contributing and license

Contributions are welcome through Issues and Pull Requests. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) first. Remember Me is licensed under the [MIT License](LICENSE).
