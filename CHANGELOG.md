# Changelog

## v1.5.0 (2026-10-25)

Everything since v1.4.0. Your tasks, notes, attachments and settings from v1.4.0 load unchanged, and the data folder moves from `%APPDATA%\Waqt` to `%APPDATA%\Remember Me` by itself the first time v1.5.0 starts.

### Highlights

- **A new name:** Waqt is now **Remember Me** (ذكرني in Arabic), and your data comes with it automatically. [#10]
- **Automatic updates,** only if you allow them, and never a restart you didn't choose. [#10]
- **More ways to repeat:** chosen weekdays, every few days, monthly and yearly, plus **Skip this time** and **Only this time**. [#7] [#8]
- **Trash and Undo** for deleted items and for Done. [#7]
- **Pause reminders** from the notification area. [#16]
- **Dark mode and six color palettes,** plus notes as sticky notes, lined paper or cards in ten paper colors. [#7] [#35]
- **Verified backups** with restore from Settings. [#5]
- **12 interface languages,** with English as the new default and a full right-to-left layout in Arabic. [#36]
- **A redesigned alert:** one reminder at a time with its status at a glance, smart snooze choices on the 1–6 keys, **Snooze all** and **Open task**. [#36]
- **Tags and checklists:** tag tasks and filter the list by tag, sort it by title, and break a task into steps you tick off. [#36]
- **Better keyboard and screen-reader support:** focus that stays put, visible focus rings, higher contrast and named controls. [#43]

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
- The interface in 12 languages: English, العربية, Español, Français, Deutsch, Português (Brasil), Русский, 中文 (简体), 日本語, Türkçe, हिन्दी and Bahasa Indonesia, each listed in its own name. New installs start in English and existing installs keep Arabic. The tray menu, dialogs and error messages follow the chosen language, text missing in a language falls back to English, and the layout mirrors for right-to-left. The translations beyond English and Arabic are machine-assisted and were reviewed by native-level reviewers. [#36]
- The redesigned alert window [#36]:
  - chips for how long a reminder is overdue, its priority, its repeat and how many times it was snoozed, with the next occurrence under **Done** for repeating tasks;
  - **Remind me again** with 10 min, 1 hour, This evening (until 17:00), Tomorrow 9 AM, Next week and **Pick a time…**, on the 1–6 keys; **S** skips a repeat;
  - a *1 of N* counter with previous and next when several reminders wait, and **Snooze all** for an hour;
  - **Open task** opens that task's editor in the main window;
  - a gentle nudge after three snoozes of the same occurrence;
  - screen-reader support (an alert dialog that announces each reminder) and keyboard use: Enter is Done, the arrows move through the queue, and Escape never dismisses it. Shortcuts act only after you interact with the alert, so typing in another window can't complete or snooze a reminder that just appeared.
- Tags on tasks: up to ten per task, typed with commas and suggested from the tags you already use. They show on task cards, every tag in use becomes a filter above the list, and search finds them. [#36]
- Sort tasks by title, besides due time, priority and newest first. [#36]
- Checklists: up to 50 steps in a task, added in the editor (Enter adds the next one) and ticked straight from the task card. A repeating task starts each occurrence with its steps unticked, and the copy under *Completed* keeps its ticks. [#36]
- **Settings → Appearance:** six color palettes (Lavender, Ocean, Forest, Sunset, Graphite and High contrast), each in light and dark, picked from preview cards and applied at once to the main window and the alert. [#35]
- Notes come in ten paper colors, picked from swatches, and three styles: plain card, sticky note or lined paper. The editor shows a live preview. [#35]
- The logo inside the app follows the chosen palette and light or dark mode (issue #18). [#35]

### Changed

- The app is called Remember Me everywhere: `Remember Me.exe`, the installer, its shortcuts and the Apps & features entry. [#10]
- Data moves from `%APPDATA%\Waqt` to `%APPDATA%\Remember Me` automatically the first time the app starts. If the folder is locked it is copied and checked instead, and the original is kept as `Waqt.migrated-<date>`. The old data is never deleted. [#10]
- Start with Windows is pointed at the renamed executable on startup. [#10]
- New backup folders are named `RememberMe-backup-…` and `RememberMe-before-restore-…`. Backups named `Waqt-…` still restore and rotate. [#10]
- Dates, times and numbers always use Western digits (0-9), in the Arabic interface too. [#9]
- New installs start in English. Installs updated from v1.4.0 keep Arabic, and **Settings** switches between all 12 languages. [#36]
- The alert sits next to the taskbar wherever it is (bottom, top, left or right), on scaled and secondary displays, and moves when displays change. [#7]
- Sharper icons at every size, with a simpler bell at small sizes and dedicated notification-area images. [#22]
- A smaller installer: it bundles only the app's own files and the Chromium language files of its interface languages. [#3]
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
- An early notice no longer pops up right after you snooze, finish, skip or move a task into its lead time, and resuming after a pause brings no burst of notices. [#25]
- Clicking an early notice, also later in Action Center, opens the app reliably. [#25]
- While an update downloads, the windows refresh only every 10% instead of every second, and the alert is never redrawn for it. [#25]
- **Undo** after completing a repeating task brings back its checklist ticks, and an editor left open while the alert completes the task no longer ticks steps of the next occurrence. [#41]
- The alert's **Undo** keeps working after you undo a different task in the main window. [#41]
- Restoring an item that the 30-day cleanup already removed from the Trash says so, and open windows refresh after the cleanup. [#41]
- Date, time and number fields follow the app's language and always show digits 0-9, also on Windows set to Arabic. When a new language needs it, Remember Me offers **Restart now**. [#41]
- Tags typed in Japanese or Chinese stay separate when you save the task again, and tag filters ignore upper and lower case. [#42]
- The alert's shortcuts unlock only after a navigation key such as Tab or an arrow, so typing into an alert that just took the focus can't complete it. [#42]
- Ctrl+N and Ctrl+K work with Arabic, Russian and other non-Latin keyboard layouts. [#42]
- The Google Drive backup error, number range errors, file sizes and the badge of a file without an extension appear in the interface language, and labels such as *Edit* or *Delete* with a title read as whole sentences in every language. [#42]
- A title or file name in the other writing direction keeps its punctuation in place inside a sentence, and the alert's title and note line up with the interface. [#42]
- Windows open in the saved language and direction, with no flash of English. [#42]
- The alert lists the weekdays of a repeat starting from your first day of the week. [#42]
- A note whose title matches an interface word, such as *Today*, is no longer translated in the editor's preview. [#42]

### Accessibility

- The keyboard focus stays in place when a list refreshes, moving to the next row when its own row is gone, and closing a dialog returns it to the button that opened it. [#43]
- Switches, checkboxes, radio buttons and the sort menu show a focus ring, and switches that are off are easier to see. [#43]
- Higher contrast for accent text on tinted backgrounds, placeholders and the buttons on each row, in every palette, light and dark. A test checks every text and background pair. [#43]
- The **Undo** message stays for 10 seconds, waits while the pointer or the focus is on it, answers Ctrl+Z, and is read out by screen readers. [#43]
- Dialogs, the confirmation prompt and checklist steps have names, the Edit, Delete and Restore buttons name their item, and the navigation and filters tell screen readers which one is selected. [#43]
- Date and time pickers follow light or dark mode, and Windows' reduce-motion setting also stops decorative animations. [#43]
- In the alert, Escape in **Pick a time** puts the focus back on that button, and after the last **Done** the focus moves to **Undo** while a screen reader hears that nothing else is due. [#42]
- Keyboard and screen-reader use in the main window: focus stays on the task, step or button you were on when the list refreshes, and after Done or Delete it moves to the next task; switches and checkboxes show a focus ring; **Undo** also works with Ctrl+Z, waits while you point at it or tab to it, and stays 10 seconds; dialogs and repeated buttons are named with their item; text, placeholders and switches meet WCAG contrast in every palette. [#43]

### Security

- Every request from the app's windows is checked (a known action, valid data, the app's own page), and the alert window may use only its own small set of actions. [#2]
- More risky file types open in File Explorer instead of running, including script hosts, installers, disk images, shortcuts and Office add-ins, and names like `report.pdf.exe` or ones hidden with right-to-left override characters. [#2]
- Windows theme and visual-style files, update packages (`.msu`), Python zip apps (`.pyzw`), and Visual Studio and Office extensions are also shown in File Explorer instead of opened. [#23]
- All browser permission requests are denied, embedded web views are blocked, and the content security policy is stricter. [#2]
- Updates come only over HTTPS from this repository's GitHub Releases, are checked against the release's SHA-512, and are never pre-releases or downgrades. [#10]
- About can open only six fixed GitHub addresses; the window can't ask for any other link. [#22]
- The log leaves out user names, folder names and file names, also from error messages, stack traces and paths without quotes. [#41]
- The main process never runs code inside the app's pages, and a lint rule keeps it that way. [#16] [#17]
- The installed `Remember Me.exe` can't be started as a Node.js interpreter or attached to a debugger, and refuses to run if its app files were changed (Electron fuses and asar integrity). [#25]

### Removed

- Nothing that v1.4.0 had. A Hijri date and a digit-style option tried during development were dropped before this release in favor of Western digits everywhere. [#9]

### For contributors

- [ARCHITECTURE.md](ARCHITECTURE.md), ESLint (`pnpm lint`) and a smoke test of the packaged app in CI. [#15]
- A code signing policy, a release checklist ([RELEASING.md](RELEASING.md)) and winget manifests. [#11] [#12] [#13]
- The release workflow builds with a read-only token and publishes, attests and verifies in a separate job, only for version tags; all GitHub Actions are pinned to commit SHAs. [#25]
- The source is split by area: `src/main` (with one IPC handler file per area), `src/core`, `src/data` and `src/platform`, and `ui/main`, `ui/alert`, `ui/lib` and `ui/styles` for the pages. A structure test catches broken paths, and [ARCHITECTURE.md](ARCHITECTURE.md) maps every file. [#37] [#38]
- A release QA suite, `pnpm test:release-qa`, drives a packaged test build through first start, every repeat type, the alert, notes, tags, checklists, all palettes, About, updates, attachments, backups and the translations. [#39]
- `pnpm run screenshots` retakes the README pictures from made-up sample data in test mode, and the release notes for GitHub live in `docs/release-notes`. [#40]

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
[#25]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/25
[#35]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/35
[#36]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/36
[#37]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/37
[#38]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/38
[#39]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/39
[#40]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/40
[#41]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/41
[#42]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/42
[#43]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/43
[#43]: https://github.com/sarmadiq9090-coder/Remember-Me/pull/43
