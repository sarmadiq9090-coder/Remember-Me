# Changelog

## v1.5.0 (unreleased)

### Added

- Automatic updates from GitHub Releases, only after you allow them. Remember Me asks once, then checks about 30 seconds after starting and once a day, downloads in the background and installs when you choose **Restart now** or the next time you quit. It saves a safety copy of your data first and never restarts on its own. **Settings → Updates** has the switch and **Check now**.
- **Pause reminders** from the notification-area menu: for 1 hour, until tomorrow at 8:00, or until you resume. Reminders that come due meanwhile appear when the pause ends.
- **Settings → About** (also **About Remember Me** in the tray menu): the version, the developer, links to the source code, release notes, problem reports, privacy notice and license, **Check for updates**, **Open log folder**, and **Copy diagnostic info** with versions, language and theme only.

### Changed

- Sharper icons: `icon.ico` now has 10 sizes from 16 to 256 px instead of one 256 px image, with a simpler, heavier bell and a larger check at 32 px and below. The notification-area icon has its own 16, 24 and 32 px images, for the normal and the waiting state.
- The app is called Remember Me everywhere: `Remember Me.exe`, the installer, its shortcuts and the Apps & features entry.
- The installer shows the privacy notice and the license, in English or Arabic, before installing. The uninstaller says your data in `%APPDATA%\Remember Me` is kept.
- Data moves from `%APPDATA%\Waqt` to `%APPDATA%\Remember Me` automatically the first time the app starts. If the folder is locked it is copied and checked instead, and the original is kept as `Waqt.migrated-<date>`. The old data is never deleted.
- Start with Windows is pointed at the renamed executable on startup.
- New backup folders are named `RememberMe-backup-…` and `RememberMe-before-restore-…`. Backups named `Waqt-…` still restore and rotate.

### Upgrading

- v1.4.0 has no updater: install v1.5.0 by hand once. Later versions update automatically.
