# Releasing

A checklist for publishing v1.5.0. Later releases follow the same steps with their own version number.

Releases are built only by `.github/workflows/release.yml` on GitHub Actions, never on a personal PC. Pushing a `v*` tag builds, attests and publishes the release; running the workflow by hand only builds the files, with no release and no attestation. The build job runs with a read-only token. Only the publish job, which runs no repository code, can create the release; it uses the `release` environment, where **Settings → Environments → release → Required reviewers** can add a manual approval before anything is published.

## 1. Prepare

- [ ] Everything planned for the release is merged into `main`, and the **Tests** workflow is green.
- [ ] In `package.json`, set `"version": "1.5.0"`. The lockfile doesn't change.
- [ ] In `CHANGELOG.md`, replace `## v1.5.0 (unreleased)` with `## v1.5.0 (YYYY-MM-DD)` and check the entries match what's merged.
- [ ] Check the entry against `git log v1.4.0..main --oneline` and the merged pull requests: every user-visible change since the last release needs a line with its PR. Replace or delete every **TODO** line and the 'Before release' note.
- [ ] If the interface changed, run `pnpm run screenshots` and commit the new `docs/screenshots` (sample data only), then `pnpm run site-assets` for the website's copies.
- [ ] On the website, change the version and the installer name in `site/index.html` and `site/ar/index.html` (the visible text and `softwareVersion`), and `lastmod` in `site/sitemap.xml`. `pnpm test` fails until the pages match `package.json`.
- [ ] In the README's "Verify the download" section, change the example file name to `Remember-Me-Setup-1.5.0-x64.exe` in both commands, and the attestation's `--source-ref` to `refs/tags/v1.5.0`.
- [ ] Merge these changes through a pull request, and wait for **Tests** to pass on `main`.

## 2. Dry run (recommended)

- [ ] In GitHub, open **Actions → Release → Run workflow** and run it on `main`. It builds and uploads files but publishes nothing.
- [ ] Download the `installer` artifact. It must contain `Remember-Me-Setup-1.5.0-x64.exe`, `Remember-Me-Setup-1.5.0-x64.exe.blockmap`, `latest.yml` and `SHA256SUMS.txt`.
- [ ] Download the `winget-manifests` artifact (three `Sarmad.RememberMe*.yaml` files) and run `winget validate --manifest <folder>`.

## 3. Tag and publish

```powershell
git switch main
git pull
git tag -a v1.5.0 -m "Remember Me 1.5.0"
git push origin v1.5.0
```

- [ ] Watch **Actions → Release**. The `build` job stops if the tag doesn't match `package.json`, if any test fails, or if `latest.yml` or the `.blockmap` is missing. The `publish` job then checks the checksums, attests the installer and creates the release.
- [ ] When it finishes, open the new release and edit its notes if needed:
  - Replace the generated notes with `docs/release-notes/v1.5.0.md`: `gh release edit v1.5.0 --notes-file docs/release-notes/v1.5.0.md`. It has the highlights, the full CHANGELOG entry, the line saying v1.4.0 users install this version by hand once, and the code signing policy link.
  - For a later release without such a file: paste the CHANGELOG entry and link the [code signing policy](README.md#code-signing-policy): `See the [code signing policy](https://github.com/sarmadiq9090-coder/Remember-Me#code-signing-policy).` SignPath requires it on every release page.

## 4. Verify the release

- [ ] The release lists exactly four files: the installer, its `.blockmap`, `latest.yml` and `SHA256SUMS.txt`.
- [ ] The release is marked **Latest** and is not a pre-release or draft. The app's updater only follows the latest full release.
- [ ] `latest.yml` says `version: 1.5.0`, and its `path` and `url` are `Remember-Me-Setup-1.5.0-x64.exe`.
- [ ] The checksum and attestation match. Download the installer and `SHA256SUMS.txt` into one folder, then:

```powershell
Get-FileHash .\Remember-Me-Setup-1.5.0-x64.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
gh attestation verify .\Remember-Me-Setup-1.5.0-x64.exe --repo sarmadiq9090-coder/Remember-Me --source-ref refs/tags/v1.5.0 --signer-workflow sarmadiq9090-coder/Remember-Me/.github/workflows/release.yml
```

- [ ] The SHA-512 in `latest.yml` matches the installer. The updater refuses the download otherwise:

```powershell
[Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes("$PWD\Remember-Me-Setup-1.5.0-x64.exe")))
```

## 5. Smoke install

Use a Windows 10 or 11 PC or VM where you can install and uninstall freely, ideally with a separate Windows user.

- [ ] **Fresh install:** run the installer, choosing **More info → Run anyway** at the SmartScreen prompt (the installer isn't signed yet).
  - After the language choice, the license page shows the privacy notice in that language, then the MIT license.
  - The Start menu and desktop shortcuts are called **Remember Me**.
  - Apps & features shows **Remember Me** version 1.5.0.
  - The process is `Remember Me.exe`, and data is in `%APPDATA%\Remember Me`.
- [ ] **First start:** the update card appears. Choose **Allow**, then **Settings → Updates → Check now**. It should report the latest version.
- [ ] **Reminders:** add a task with a reminder a minute away and wait for the alert. Choose Done, snooze one, and close and reopen the window.
- [ ] **Start with Windows:** turn it on, sign out and back in, and check Remember Me starts in the background.
- [ ] **Quit:** use **Exit** in the notification-area menu.
- [ ] **Upgrade from v1.4.0** (optional, as v1.4.0 had no downloads):
  - Install v1.4.0, add a task, a note with an attachment and an exported backup, and turn on Start with Windows.
  - Install v1.5.0 over it.
  - Everything is still there. `%APPDATA%\Waqt` is gone, or kept as `Waqt.migrated-<date>`. The shortcuts point at `Remember Me.exe`, and the Start with Windows entry in Task Manager's Startup apps points at `Remember Me.exe`.
- [ ] **Uninstall** from Apps & features. The first page says the data in `%APPDATA%\Remember Me` is kept and shows the full path, and the folder is still there afterwards.

The automatic update itself can only be tested end to end once v1.5.1 exists: install v1.5.0, allow updates, publish v1.5.1, then check that the banner appears and **Restart now** installs it after saving a `RememberMe-before-update-` copy in the backups folder.

## 6. After the release

- [ ] Submit the `winget-manifests` artifact to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) under `manifests/s/Sarmad/RememberMe/1.5.0/`. See [docs/distribution/winget](docs/distribution/winget/README.md).
- [ ] Add a new `## vX.Y.Z (unreleased)` heading at the top of `CHANGELOG.md` for the next version.

## If something is wrong

- **The workflow failed before publishing:** fix the problem on `main`, delete the tag (`git push origin :refs/tags/v1.5.0` and `git tag -d v1.5.0`), then tag again.
- **A published release is broken:** edit it and mark it as a pre-release. The updater only follows GitHub's latest full release, so it stops offering the broken version right away. Then publish a fixed version with a higher number. Don't reuse a version number: installs that already downloaded it would keep it.
