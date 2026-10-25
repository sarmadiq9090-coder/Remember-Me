# Scoop manifest

[`remember-me.json`](remember-me.json) installs Remember Me with [Scoop](https://scoop.sh), following the [ScoopInstaller/Extras](https://github.com/ScoopInstaller/Extras) conventions for electron-builder apps:

- Scoop unpacks the NSIS installer with 7-Zip (`#/dl.7z`, then `$PLUGINSDIR\app-64.7z`) instead of running it. No admin rights, no registry entries, and a Start menu shortcut named Remember Me.
- `post_install` removes the installer's leftovers, including `Uninstall Remember Me.exe`. Without that file the app knows it didn't come from its installer, so its own updater stays off (`src/platform/updates.js`) and Scoop alone updates it. Otherwise the app would install a second copy in `%LOCALAPPDATA%\Programs`.
- There is no `persist`: tasks, notes and settings live in `%APPDATA%\Remember Me`, outside Scoop's folder, so they survive updates and `scoop uninstall`.
- `checkver` follows the latest GitHub release, and `autoupdate` takes the hash from the release's `SHA256SUMS.txt`.

## Where to publish it

**ScoopInstaller/Extras isn't possible yet.** Its package-request form asks for apps that are "reasonably well-known and widely used", for a GitHub project at least 100 stars and/or 50 forks; the repository has 2 stars. Extras also needs an approved package-request issue before any pull request.

Until then, the owner can publish a bucket of their own:

1. Create a public repository, for example `sarmadiq9090-coder/scoop-bucket`, from [ScoopInstaller/BucketTemplate](https://github.com/ScoopInstaller/BucketTemplate). Its GitHub Actions run the same checkver/autoupdate job (Excavator) as Extras.
2. Copy `remember-me.json` into its `bucket/` folder.
3. Users install with:

   ```powershell
   scoop bucket add remember-me https://github.com/sarmadiq9090-coder/scoop-bucket
   scoop install remember-me/remember-me
   ```

Once the project qualifies for Extras: open a [package request](https://github.com/ScoopInstaller/Extras/issues/new/choose), wait for a maintainer to approve it, then open a pull request titled `remember-me: Add version 1.5.0` (or the current version) with this file as `bucket/remember-me.json`, and comment `/verify` on it.

## Updating and testing

- After a release, `node tools/package-managers.mjs --sums SHA256SUMS.txt --out docs/distribution` rewrites this file for the new version. The release workflow also uploads it in the `package-managers` artifact. In a bucket, `autoupdate` does this by itself.
- To try it locally: `scoop install .\docs\distribution\scoop\remember-me.json`, then check that the app starts, that **Settings → Updates** says updates work in the installed app only, and that `scoop uninstall remember-me` leaves `%APPDATA%\Remember Me` in place.
