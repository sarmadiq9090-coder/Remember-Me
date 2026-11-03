# CLAUDE.md — Remember Me

## Owner & workflow (shared rules, same in every repo)

Owner: Sarmad (`sarmadiq9090-coder`). Writes Arabic, is not technical in English, and works only
through Claude sessions, with no fixed computer.

- Reply to the owner in Arabic. Keep code, identifiers, commit messages and PR titles in English,
  and give PR bodies an Arabic summary first.
- Never push to the default branch. Work on `claude/<topic>`, open a PR, and let the owner merge
  unless they explicitly say "ادمج" (merge).
- One Claude session per repository at a time. Before starting, check open PRs and recently pushed
  `claude/*` branches. If another session is active, coordinate through it instead of editing the
  same files.
- The owner has no fixed computer: never ask them to keep files, keys or tools on a PC. Use GitHub
  (Environments/secrets, Codespaces) or their password manager.
- **Weekly release train.**
  - All improvements, additions and changes to a published app ship to users ONCE a week, together.
    This covers new versions and tags, website (fastkiwi.app) updates, and package-manager
    (winget/Scoop/Chocolatey) manifest updates.
  - Release day is Friday 09:00 (Asia/Baghdad). The weekly health check in the owner's manager
    session runs just before it and prepares the train; the owner approves it.
  - A release goes out only after CI is green on Linux and Windows.
  - During the week, work goes to `claude/*` branches or PRs, or is merged to the default branch
    WITHOUT bumping the version or pushing a tag.
  - arabic-file-search's build.yml publishes a release automatically when the Cargo.toml version
    changes on main, so bump the version only on release day.
  - github.io deploys on every push to main, so merge site PRs only on release day.
  - Exceptions: mawared-desktop, and new apps that have never been published. These may release
    whenever needed.
  - A critical security fix may go out early, only with the owner's explicit approval.
- Things only the owner can do: repo settings, deleting branches or repos, money decisions, secrets,
  merging. Ask, and give exact click-by-click steps in Arabic.
- Don't enable features that write to third-party systems, or anything security-sensitive, without
  the owner's explicit approval.
- Commit only your own files (`git add <paths>`).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## What this is

Remember Me («ذكرني», internal name up to v1.4: "Waqt") is an offline-first task, note and reminder
app for Windows in 12 languages, with alerts that stay on screen until dealt with. Plain JavaScript
on Electron, no framework and no build step: `src/` runs in the main process, `ui/` loads as-is.
Docs: [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md) (which file does what),
[RELEASING.md](RELEASING.md), [CONTRIBUTING.md](CONTRIBUTING.md), [TRANSLATING.md](TRANSLATING.md),
[CHANGELOG.md](CHANGELOG.md).

## Build, test, lint

pnpm 10, Node 22.

```sh
pnpm install --frozen-lockfile
pnpm test               # node --test on the files listed in package.json
pnpm lint               # eslint .
pnpm start              # run the app (electron .)
pnpm run package        # packaged app (tools/package.mjs)
pnpm run installer      # NSIS installer (tools/installer.cjs, electron-builder)
pnpm run test:desktop   # Playwright smoke against a packaged build (see desktop.yml for env vars)
pnpm run screenshots    # docs/screenshots (sample data only); pnpm run site-assets for the site
```

A new test file must be added to the `test` script in `package.json`.

## CI (.github/workflows), all Windows

There is no Linux job: "green" here means the Windows workflows.
- `test.yml` (push to main, PRs), windows-latest: `pnpm test`, `pnpm lint`.
- `desktop.yml` (push to main, PRs, manual), windows-latest: packages the app and runs
  `tests/desktop-smoke.cjs`; screenshots as an artifact.
- `release.yml` (`v*` tag, or manual = build only): see below.
- `pages.yml`: deploys `site/` to GitHub Pages (sarmadiq9090-coder.github.io/Remember-Me/) on push
  to main touching `site/**`. Merge `site/` changes only on release day.

## Release (tag push)

Follow [RELEASING.md](RELEASING.md) exactly. In short: version in `package.json`, CHANGELOG entry,
site version text, README verify commands, all through a PR; optional dry run (Actions → Release →
Run workflow); then push an annotated tag `vX.Y.Z` matching `package.json`. The build job checks
the tag, tests, builds the installer, `latest.yml`, `.blockmap` and `SHA256SUMS.txt`; the publish
job (environment `release`) attests and creates the release. Release notes: `docs/release-notes/`.

Must not break:
- Installer name `Remember-Me-Setup-<version>-x64.exe` with its `.blockmap` and `latest.yml`:
  electron-updater reads them from the latest full release of `sarmadiq9090-coder/Remember-Me`
  (`src/platform/updates.js`). Never reuse a version number.
- `appId: 'com.waqt.reminder'` in `tools/installer.cjs` (a new one installs side by side).
- The repo name `Remember-Me` (updater feed, attestation commands, site URL).

## Do not move or rename

- The data folder: `%APPDATA%\Remember Me`, and the one-time move from `%APPDATA%\Waqt`
  (`FOLDER` and `LEGACY` in `src/platform/data-folder.js`). Never delete user data.
- `docs/icon-preview.png` (generated by `pnpm run assets`, linked from README).
- `docs/distribution/winget/1.5.0` (test fixture for `tests/winget-manifest.test.js`).
- `docs/distribution/` (winget, Scoop, Chocolatey docs and manifests), `docs/screenshots/`,
  `site/`, `installer/`, `assets/` (icons from `pnpm run assets`).
- Test variables `WAQT_*` and the `window.waqt` bridge keep the old name on purpose.

## Pending for the owner

- Open PR #62 (`zh-cn-translation-review`, not a Claude branch): zh-CN string fixes, waiting for review.
- `CHANGELOG.md` has an "Unreleased" entry for the next release train.
