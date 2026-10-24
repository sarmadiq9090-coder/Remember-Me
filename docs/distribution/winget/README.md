# winget manifests

The [Windows Package Manager](https://learn.microsoft.com/windows/package-manager/) installs Remember Me with `winget install Sarmad.RememberMe` once its manifests are accepted into [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs).

`tools/winget-manifest.mjs` writes the three manifest files winget needs (version, installer, and the en-US default locale) in manifest schema 1.12.0. The installer manifest points at the per-user NSIS installer on the GitHub release.

- **For a release:** the release workflow runs `node tools/winget-manifest.mjs --sums release/installer/SHA256SUMS.txt --out release/winget` and uploads the result as the `winget-manifests` artifact, with the installer's real SHA-256 and the release date.
- **[1.5.0](1.5.0)** in this folder is the same output for v1.5.0 with a placeholder instead of the hash, for review. `tests/winget-manifest.test.js` keeps it in sync with the script. Regenerate it with `node tools/winget-manifest.mjs --version 1.5.0 --out docs/distribution/winget/1.5.0`.

## Submitting (after the release is published)

1. Download the `winget-manifests` artifact from the release's workflow run.
2. Check it with `winget validate --manifest <folder>`. To test an install locally, run `winget settings --enable LocalManifestFiles` once in an administrator terminal, then `winget install --manifest <folder>`.
3. In a fork of microsoft/winget-pkgs, add the three files under `manifests/s/Sarmad/RememberMe/<version>/` and open a pull request. Tools such as [komac](https://github.com/russellbanks/Komac) or `wingetcreate` can do this step for later versions.

The package identifier `Sarmad.RememberMe` is permanent once the first version is accepted. Change `IDENTIFIER` in the script before the first submission if a different one is wanted.

The `ProductCode` is the installer's Apps & features key: electron-builder derives it from the appId `com.waqt.reminder`, so it stays the same for every version.
