# Chocolatey package

The source of the `remember-me` package for the [Chocolatey Community Repository](https://community.chocolatey.org/):

- [`remember-me.nuspec`](remember-me.nuspec): the package metadata, including the fields the community moderators check: `packageSourceUrl` (this folder), `projectSourceUrl`, `docsUrl`, `bugTrackerUrl`, `releaseNotes`, an `iconUrl` pinned to the release tag, and tags.
- [`tools/chocolateyinstall.ps1`](tools/chocolateyinstall.ps1) downloads the release installer from GitHub, checks its SHA-256 and runs it with `/S`.
- [`tools/chocolateyuninstall.ps1`](tools/chocolateyuninstall.ps1) finds the Apps & features entry and runs the app's own uninstaller with `/currentuser /S`.

Nothing is embedded in the package, so no `VERIFICATION.txt` or `LICENSE.txt` is needed.

The `remember-me` package ID was free on the community repository in October 2026.

## Things to know

- The installer installs per user, into `%LOCALAPPDATA%\Programs\Remember Me`. Chocolatey runs elevated, so it installs into the profile of whoever's administrator rights are used. On a PC where a standard user approves with another account's credentials, Remember Me lands in that other account. This is said in the package description.
- Data in `%APPDATA%\Remember Me` stays when the package is uninstalled.
- If the user allows automatic updates, the app also updates itself from GitHub, ahead of the package. `choco upgrade remember-me` still works: it runs the same version's installer again, which changes nothing.

## What the owner must do (not automated)

1. Create an account at [community.chocolatey.org](https://community.chocolatey.org/account/Register) and confirm the email address.
2. Copy the API key from the account page.
3. On a Windows PC with Chocolatey:

   ```powershell
   choco pack docs\distribution\chocolatey\remember-me.nuspec
   choco install remember-me --source . -y      # try it from the local .nupkg
   choco uninstall remember-me -y
   choco apikey --key <your API key> --source https://push.chocolatey.org/
   choco push remember-me.1.5.0.nupkg --source https://push.chocolatey.org/
   ```

4. Wait for moderation. The first version goes through the automated validator and verifier, then a human moderator, which can take several days. Answer the moderators' comments on the package page; they may ask for changes to these files.

## Each new release

Run `node tools/package-managers.mjs --sums SHA256SUMS.txt --out docs/distribution` with the release's `SHA256SUMS.txt` (the release workflow also uploads the result in the `package-managers` artifact), then `choco pack` and `choco push` the new version.
