# Changelog

## v1.5.0 (unreleased)

### Added

- Automatic updates from GitHub Releases, only after you allow them. Remember Me asks once, then checks about 30 seconds after starting and once a day, downloads in the background and installs when you choose **Restart now** or the next time you quit. It saves a safety copy of your data first and never restarts on its own. **Settings → Updates** has the switch and **Check now**.

### Changed

- The app is called Remember Me everywhere: `Remember Me.exe`, the installer, its shortcuts and the Apps & features entry.
- Data moves from `%APPDATA%\Waqt` to `%APPDATA%\Remember Me` automatically the first time the app starts. If the folder is locked it is copied and checked instead, and the original is kept as `Waqt.migrated-<date>`. The old data is never deleted.
- Start with Windows is pointed at the renamed executable on startup.
- New backup folders are named `RememberMe-backup-…` and `RememberMe-before-restore-…`. Backups named `Waqt-…` still restore and rotate.

### Upgrading

- v1.4.0 has no updater: install v1.5.0 by hand once. Later versions update automatically.
