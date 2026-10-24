# Changelog

## v1.5.0 (unreleased)

Everything since v1.4.0. Your tasks, notes, attachments and settings from v1.4.0 load unchanged, and the data folder moves from `%APPDATA%\Waqt` to `%APPDATA%\Remember Me` by itself the first time v1.5.0 starts.

> **Before release:** replace each **TODO** line below with the merged work and its PR, or delete it. PRs up to #23 are included. Then check this entry against `git log v1.4.0..main --oneline` (see RELEASING.md).

### Highlights

- **A new name:** Waqt is now **Remember Me** (ذكرني in Arabic), and your data comes with it automatically. [#10]
- **Automatic updates,** only if you allow them, and never a restart you didn't choose. [#10]
- **More ways to repeat:** chosen weekdays, every few days, monthly and yearly, plus **Skip this time** and **Only this time**. [#7] [#8]
- **Trash and Undo** for deleted items and for Done. [#7]
- **Pause reminders** from the notification area. [#16]
- **Dark mode.** [#7]
- **Verified backups** with restore from Settings. [#5]
- **TODO:** the interface in 12 languages.
- **TODO:** the redesigned alert window.
- **TODO:** color themes and note pickers.

### Added

- Repeats on chosen weekdays (with Sun–Thu and Mon–Fri shortcuts), every N days, monthly and yearly. Repeats on the 31st or on February 29 fall back to the last day of the month without drifting. [#7]
- **Skip this time** on a repeating task moves it to its next occurrence without marking it done. [#8]
- **Only this time** in the editor moves one occurrence of a repeating task and keeps the rest of the series. [#8]
- A Trash view: deleted tasks and notes stay there for 30 days and can be restored. Deleting shows an **Undo** button, and only permanent deletes ask for confirmation. [#7]
- **Undo** after Done, in the main window and in the alert. After the last reminder the alert stays for a few seconds so you can undo. [#7]
- An optional early notice: a Windows notification from 5 minutes to 1 day before a reminder is due. [#7]
- **Remind me again:** while an alert is unanswered, its sound repeats every 2, 5 or 15 minutes, up to 6 times. Off by default. [#8]
- **Pause reminders** from the notification-area menu: for 1 hour, until tomorrow at 8:00, or until you resume. Reminders that come due meanwhile appear when the pause ends. [#16]
- Appearance setting: Light, Dark or Same as Windows. [#7]
- First day of the week setting (Saturday, Sunday or Monday), used by the weekday picker. Saturday is the default. [#7] [#9]
- A warning in Settings, and a one-time banner, when Start with Windows is off but reminders are still to come. [#8]
- The notification-area icon shows a dot while reminders are waiting. [#8]
- Automatic updates from GitHub Releases, only after you allow them. Remember Me asks once, then checks about 30 seconds after starting and once a day, downloads in the background and installs when you choose **Restart now** or the next time you quit. It saves a safety copy of your data first. **Settings → Updates** has the switch and **Check now**. [#10]
- **Restore from backup** in Settings: checks every file, shows what the backup holds, and saves a safety copy of your current data before replacing it. [#5]
- Backups include a SHA-256 checksum for every file. [#5]
- Keep only the latest 5, 10 or 30 automatic backups. All are kept by default, and backups you export yourself are never removed. [#5]
- Settings shows the space attachments and backups use, and can clean up attachments that no task or note uses. [#5]
- A warning when the Google Drive backup folder has been unavailable for more than a day. [#5]
- Arabic-aware search that ignores diacritics and tatweel and matches spelling variants such as أ/إ/آ/ا, ة/ه and ى/ي. [#3]
- **Settings → About** (also **About Remember Me** in the tray menu): the version, the developer, links to the source code, release notes, problem reports, privacy notice and license, **Check for updates**, **Open log folder**, and **Copy diagnostic info** with versions, language and theme only. [#22]
- A local log in the data folder's `logs` folder, to attach to a problem report. It never records task or note titles, text or file names. [#15]
- The installer shows the privacy notice and the license, in English or Arabic, and the uninstaller says your data folder is kept. [#14]
- Release installers come with `SHA256SUMS.txt` and GitHub build provenance, so you can check a download. [#3]
- **TODO:** 12 interface languages.
- **TODO:** the redesigned alert window.
- **TODO:** color themes and note pickers in **Settings → Appearance**.

### Changed

- The app is called Remember Me everywhere: `Remember Me.exe`, the installer, its shortcuts and the Apps & features entry. [#10]
- Data moves from `%APPDATA%\Waqt` to `%APPDATA%\Remember Me` automatically the first time the app starts. If the folder is locked it is copied and checked instead, and the original is kept as `Waqt.migrated-<date>`. The old data is never deleted. [#10]
- Start with Windows is pointed at the renamed executable on startup. [#10]
- New backup folders are named `RememberMe-backup-…` and `RememberMe-before-restore-…`. Backups named `Waqt-…` still restore and rotate. [#10]
- Dates, times and numbers always use Western digits (0-9), in the Arabic interface too. [#9]
- The alert sits next to the taskbar wherever it is (bottom, top, left or right), on scaled and secondary displays, and moves when displays change. [#7]
- Sharper icons at every size, with a simpler bell at small sizes and dedicated notification-area images. [#22]
- A smaller installer: it bundles only the app's own files and the Arabic and English Chromium language files. [#3]
- A data file with an out-of-range value is corrected when it loads instead of being treated as damaged. [#2]
- The executable's file properties name Sarmad as the publisher and include the copyright. [#23]

### Fixed

- Double-clicking Done or Snooze, or acting on the same reminder from both windows, no longer skips an occurrence or records it twice. [#6]
- An editor left open no longer undoes a snooze or Done made in the alert. [#6]
- A missing attachment file no longer stops a backup: the file is skipped, you're told which one, and the backup can still be restored. [#6]
- Google Drive no longer receives an outdated backup that was waiting for the folder to come back. [#6]
- Turning on or changing a repeat on a snoozed task starts the series at the time the editor shows. [#6]
- The preview alert no longer waits behind a real reminder. [#6]
- Saving retries when antivirus or the search indexer briefly locks the data file. [#2]
- One failed reminder check no longer stops later reminders, and shutting down or signing out of Windows no longer waits on the app. [#2]
- Text in the other language keeps its reading order, the English sidebar and statistics no longer overflow, and the main window comes back if it was closed unexpectedly. [#3]
- A monthly or yearly repeat no longer drifts to an earlier day after you edit the task's text, use **Only this time**, or snooze it. [#23]
- A daylight-saving change moves only the one occurrence that falls in the skipped hour, not every later one. [#23]
- Automatic local and Google Drive backups keep running after the PC's clock moves backwards. [#23]
- Restoring a backup keeps this PC's own settings (start with Windows, automatic updates, a pause) and refreshes the tray, alert position and theme. [#23]
- **TODO:** the remaining fixes from QC round 1.

### Security

- Every request from the app's windows is checked (a known action, valid data, the app's own page), and the alert window may use only its own small set of actions. [#2]
- More risky file types open in File Explorer instead of running, including script hosts, installers, disk images, shortcuts and Office add-ins, and names like `report.pdf.exe` or ones hidden with right-to-left override characters. [#2]
- Windows theme and visual-style files, update packages (`.msu`), Python zip apps (`.pyzw`), and Visual Studio and Office extensions are also shown in File Explorer instead of opened. [#23]
- All browser permission requests are denied, embedded web views are blocked, and the content security policy is stricter. [#2]
- Updates come only over HTTPS from this repository's GitHub Releases, are checked against the release's SHA-512, and are never pre-releases or downgrades. [#10]
- About can open only six fixed GitHub addresses; the window can't ask for any other link. [#22]
- The main process never runs code inside the app's pages, and a lint rule keeps it that way. [#16] [#17]

### Removed

- Nothing that v1.4.0 had. A Hijri date and a digit-style option tried during development were dropped before this release in favor of Western digits everywhere. [#9]

### For contributors

- [ARCHITECTURE.md](ARCHITECTURE.md), ESLint (`pnpm lint`) and a smoke test of the packaged app in CI. [#15]
- A code signing policy, a release checklist ([RELEASING.md](RELEASING.md)) and winget manifests. [#11] [#12] [#13]

### Upgrading

- v1.4.0 has no updater: install v1.5.0 by hand once. Later versions update automatically.

[#2]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/2
[#3]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/3
[#5]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/5
[#6]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/6
[#7]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/7
[#8]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/8
[#9]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/9
[#10]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/10
[#11]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/11
[#12]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/12
[#13]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/13
[#14]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/14
[#15]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/15
[#16]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/16
[#17]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/17
[#22]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/22
[#23]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/23
