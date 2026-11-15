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
- **Daily release train (D-035, D-047).** Each app ships once a week on its day at 09:00 Asia/Baghdad:
  Sat InstaFind, Sun Remember Me, Mon Lemon, Tue InstaWords, Wed InstaConvert (only when complete),
  Thu QA, Fri rest. ALL of an app's finished, green features merge together on its day (D-032/D-034);
  nothing is merged on other days. An app not ready on its day rolls to the same day next week; its
  Store update ships the same day as the release. The site (fastkiwi.app) is exempt: it publishes
  when green (D-046). A critical security fix may go early with the owner's explicit approval.
- **One GitHub writer (D-040, core/GITHUB-SAFETY.md in the brain).** Only the manager session pushes,
  opens PRs, comments, merges or dispatches workflows; other sessions work locally and report to the
  manager. Serial writes >=2 s apart, <=15 per hour, <=150 per day, <=3 new PRs per repo per day, <=2
  workflow_dispatch per repo per day, 1 rerun max. On any 403/429/abuse/CAPTCHA signal: stop all
  writes and tell the owner.
- **Closed source (D-051, 2026-11-09).** FastKiwi apps are proprietary (free to use; pricing
  undecided). Don't add "open source"/MIT wording; keep third-party notices. Code published before
  2026-11-09 stays under its MIT licence.
- **Mirror.** `.github/workflows/mirror.yml` pushes main, tags and claude/* daily to GitLab
  (`fastkiwi1/remember-me`), no force, no prune; it skips until the owner adds the `GITLAB_DEPLOY_KEY` secret.
- Things only the owner can do: repo settings, deleting branches or repos, money decisions, secrets,
  merging. Ask, and give exact click-by-click steps in Arabic.
- Don't enable features that write to third-party systems, or anything security-sensitive, without
  the owner's explicit approval.
- Commit only your own files (`git add <paths>`).
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_01H59LCK6b45r38j6yGz7oef`.

## Coding discipline (shared, same in every repo)

Adapted from the "Karpathy guidelines" CLAUDE.md (github.com/multica-ai/andrej-karpathy-skills,
MIT). Adopted by the owner on 2026-11-06. The owner's live message and the rules above win.

- **Think before coding.** State your assumptions. If a request can be read two ways, or a simpler
  path exists, say so and ask instead of guessing. Stop when confused.
- **Simplicity first.** Write the least code that solves the request. No features, abstractions,
  settings or error handling that nobody asked for. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Every changed line traces to the request. Match the existing style; don't
  reformat, rename or "improve" neighbouring code. Mention unrelated problems instead of fixing
  them. Remove only what your own change made unused.
- **Goal-driven.** Turn the task into a check first (a failing test, a command, a screenshot), then
  loop until it passes. Report what you verified and how.

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
  to main touching `site/**`. Merge `site/` changes only on the app's train day.

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
