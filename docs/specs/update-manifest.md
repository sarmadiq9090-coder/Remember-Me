# Spec: Update manifest on Cloudflare (`updates.fastkiwi.app`)

Installed apps must keep getting updates even when GitHub is down or the
owner's account is unavailable (council rule 13). fastkiwi.app itself is on
GitHub Pages, so the primary update feed lives on Cloudflare instead:
`https://updates.fastkiwi.app/<app>/latest.json`, a small manifest signed with
the **same minisign keys** as the programs (arabic-file-search and local-ai-chat:
docs/specs/signing.md; Remember Me signs only the manifest, with its own key pair). GitHub
Releases stay the fallback.

This spec is shared by InstaFind (`instafind`), Lemon (`local-ai-chat`) and
Remember Me (`remember-me`); the copies in arabic-file-search and local-ai-chat
have the Rust side. The tool `tools/make-update-manifest` is the same
file in all three repositories.

<div dir="rtl">

## ملخّص للمالك

- البرنامج يسأل أولاً `updates.fastkiwi.app` (على Cloudflare)، وإن لم يجد جواباً سليماً يرجع إلى GitHub كما كان.
- لا يتغيّر شيء للمستخدمين قبل أن تجهّز `updates.fastkiwi.app`: البرنامج يجد العنوان غير متاح فيرجع إلى GitHub بصمت.
- ما دامت مفاتيح التوقيع غير مضافة، لا يُستعمل Cloudflare إلا إذا طابق ملف `latest.yml` فيه (الإصدار واسم المثبّت وبصمة SHA-512) ما ينشره GitHub.
- لا نوافذ: حالة التحديث تظهر في الإعدادات فقط، كما كانت.
- لا رجوع إلى إصدار أقدم أبداً.

**خطواتك لاحقاً (مرة واحدة):** أنشئ على Cloudflare حاوية R2 واربطها بالنطاق الفرعي `updates.fastkiwi.app`، ثم اطلب من Claude
أن يضيف خطوة رفع الملفات إليها في CI (تحتاج سرّاً من Cloudflare، ولن تُفعَّل دون موافقتك).
حتى ذلك الحين تُرفق كل نسخة `latest.json` (و`latest.json.minisig` عند التوقيع) بإصدار GitHub، ويمكن نسخها يدوياً.

</div>

## Remember Me: electron-updater with two feeds

Remember Me updates through electron-updater (NSIS installer, `latest.yml`,
SHA-512). The installer name `Remember-Me-Setup-<version>-x64.exe`, the
`.blockmap`, `latest.yml`, `appId: 'com.waqt.reminder'` and the GitHub feed in
`app-update.yml` are unchanged.

- **Mirror feed** (`src/platform/update-feed.js`): a *generic* provider at
  `https://updates.fastkiwi.app/remember-me/`, which serves electron-builder's
  `latest.yml`, the installer and its `.blockmap` (flat layout, as on the
  GitHub release), plus `latest.json` and `latest.json.minisig`.
- **GitHub feed**: the `github` provider, as before (`FEED` in `updates.js`).

Each check (`Updates.check` → `find`):

1. `chooseFeed` fetches the mirror's `latest.yml` (15 s timeout, 64 KB). Any
   failure: GitHub.
2. With `TRUSTED_PUBLIC_KEYS` (empty today; Remember Me's own key pair, made as
   in arabic-file-search's docs/specs/signing.md), `latest.json.minisig` must
   verify over `latest.json` (pre-hashed, a trusted key, trusted comment
   `remember-me update-manifest v<version>`), and `latest.json` must name the
   same version, installer and SHA-512 as `latest.yml`. Without keys, GitHub's
   `latest.yml` (`releases/latest/download/latest.yml`) must name the same
   version, installer and SHA-512. Otherwise: GitHub.
3. A mirror that is not newer than the running version defers to GitHub when
   GitHub has a newer release (a mirror that was not updated yet).
4. electron-updater then reads the mirror (`setFeedURL`). `autoDownload` is off:
   the download starts only if what electron-updater read is exactly what was
   checked (`matchesExpected`: same version, only that installer, same
   SHA-512). Otherwise, or if the mirror check fails, GitHub is asked instead.
5. A download from the mirror that fails is tried once more from GitHub.
   electron-updater checks every download against the SHA-512 of the
   `latest.yml` it read; `allowDowngrade` stays off.

Failures on the mirror never show an error; the Settings status shows
"error" only when GitHub fails too, as before. The mirror is asked only by an
installed copy that updates itself (`source === 'github'`, packaged, not a test
run): never by the Microsoft Store package, the portable build, Scoop copies,
development builds or `WAQT_TEST` runs. Logs carry short reason codes, never
URLs (`update-feed`, `mirror-unreachable`, `mirror-unconfirmed`,
`mirror-signature`, `mirror-stale`).

The minisign check is verify-only JavaScript (`verifyMinisign`): Ed25519 from
Node's `crypto`, and BLAKE2b-512 in plain JavaScript because Electron's
BoringSSL has no `blake2b512` hash.

Tests: `tests/update-feed.test.js` runs `chooseFeed` against a local HTTP
server with the fixtures in `tests/fixtures/update-manifest/` (a fake v9.9.9
made by the tool, TEST-ONLY keys, `regen.sh`): a signed mirror while GitHub is
down; unsigned, foreign-key, replayed and mismatched mirrors; the no-keys
cross-check (same, other SHA-512, newer, GitHub down); a stale mirror; BLAKE2b
against Node's; every signature refusal. `tests/updates.test.js` covers the
fallback inside `Updates` (mirror errors, mismatched answers, failed mirror
download → GitHub, no error shown).

CI: `release.yml`'s build job writes `latest.json` with `--layout flat` and
checks that it names the same installer and SHA-512 as `latest.yml`. The
publish job (Environment `release`) checks it with `jq` against the installer
and this tag, signs it when `MINISIGN_SECRET_KEY` exists (skipped with a
warning otherwise), and attaches `latest.json` (+ `.minisig`) to the release.
`test.yml` runs the tool's tests.

Mirror layout:

```
remember-me/latest.yml
remember-me/latest.json
remember-me/latest.json.minisig                     (when signed)
remember-me/Remember-Me-Setup-9.9.9-x64.exe
remember-me/Remember-Me-Setup-9.9.9-x64.exe.blockmap
```

Upload the installer and `.blockmap` first, then `latest.json(.minisig)`, and
`latest.yml` last. Keep older installers and blockmaps (differential
downloads read the old blockmap).

## The manifest

`https://updates.fastkiwi.app/<app>/latest.json`, UTF-8 JSON, at most 64 KB:

```json
{
  "schema": 1,
  "app": "remember-me",
  "version": "9.9.9",
  "tag": "v9.9.9",
  "released": "2026-11-13T06:00:00Z",
  "notes_url": "https://github.com/sarmadiq9090-coder/Remember-Me/releases/tag/v9.9.9",
  "notes": "short release notes (plain text, at most 2000 characters)",
  "assets": {
    "x64": {
      "name": "Remember-Me-Setup-9.9.9-x64.exe",
      "size": 94321000,
      "sha256": "64 lower-case hex digits",
      "sha512": "base64 of the 64-byte SHA-512 (what electron-updater uses)",
      "urls": [
        "https://updates.fastkiwi.app/remember-me/Remember-Me-Setup-9.9.9-x64.exe",
        "https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v9.9.9/Remember-Me-Setup-9.9.9-x64.exe"
      ]
    }
  }
}
```

- `version` is `MAJOR.MINOR.PATCH` (no pre-releases), `tag` is `v<version>`.
- `assets` keys are `x64`, `x86`, `arm64`. Each app reads only its own CPU's
  entry, and only if `name` is the asset name it expects (asset names never
  change).
- `urls` are tried **in order**: the Cloudflare R2 mirror first, then the
  GitHub release. Only `https` addresses whose last path segment is `name` are
  used; each app also limits the hosts (see below).
- An asset's minisign signature, when the release is signed, is
  `<url>.minisig` next to **each** URL (so the mirror holds the `.minisig`
  files too).

### Signature

`latest.json.minisig` next to the manifest: a detached, **pre-hashed**
minisign signature of the exact bytes of `latest.json`, made with the app's
release key (primary, or the backup in an emergency). Its trusted comment is
`<app> update-manifest <tag>`, e.g. `remember-me update-manifest v9.9.9`.

## Updater flow (InstaFind and Lemon; Remember Me's is above)

1. **Fetch** `latest.json`. Any failure (no network, DNS, TLS, HTTP 403, 404,
   429, 5xx, too large, not valid for this app/CPU) means: use the current
   GitHub feed, exactly as before.
2. **Trust it.**
   - With keys compiled in (`TRUSTED_PUBLIC_KEYS` not empty): fetch
     `latest.json.minisig` and verify it (pre-hashed, a trusted key, the
     comment above). Any failure: skip the manifest, use GitHub.
   - While `TRUSTED_PUBLIC_KEYS` is **empty** (today): the manifest is used
     only if the GitHub feed reports the **same tag with the same SHA-256** for
     this CPU's asset. GitHub unreachable, another release, or another
     checksum: skip the manifest and use GitHub's answer.
3. **Offer** a trusted manifest whose version is strictly newer than the
   running one. If a trusted manifest is not newer, the app is up to date
   unless GitHub knows a newer release (a mirror that was not updated yet);
   if GitHub cannot be reached then, the answer is still "up to date".
4. **Download** from each URL in order. Every copy is checked against the
   manifest's size and SHA-256, and, when keys exist, against the minisign
   signature (also tried from each `<url>.minisig` in order). A failed or
   altered copy is deleted and the next URL is tried.
5. **Never downgrade.** Only a strictly newer version is offered or installed.

Automatic checks never show a window; a failed manual check shows the neutral
"The update server can't be reached right now…" text (unchanged).

### Threat model

| Attacker can… | Result |
|---|---|
| change files on the Cloudflare mirror (R2 token, Cloudflare account) | **Blocked** with keys: no valid `latest.json.minisig`, and each program still needs its own `.minisig`. Without keys: the manifest is used only when GitHub reports the same SHA-256. |
| serve an old signed manifest (replay) | **No downgrade**: an old version is never offered. A frozen mirror only delays an update while GitHub is also down; while GitHub is up, a newer GitHub release wins. |
| block `updates.fastkiwi.app` | The app falls back to GitHub, as before. |
| take GitHub down (or the account) | With keys, the signed manifest and the R2 copies keep updates going. Without keys, nothing can confirm the manifest, so updates wait for GitHub (fail closed). |

## Building and signing (`tools/make-update-manifest`)

Python 3.8+, standard library only (signing calls the `minisign` command).

```sh
tools/make-update-manifest build --app remember-me --version 9.9.9 --layout flat \
    --repo sarmadiq9090-coder/Remember-Me --asset x64=release/installer/Remember-Me-Setup-9.9.9-x64.exe \
    --notes-file docs/release-notes/v9.9.9.md --out latest.json
tools/make-update-manifest sign latest.json        # MINISIGN_SECRET_KEY / MINISIGN_PASSWORD; skips without them
tools/make-update-manifest verify latest.json --pub keys/minisign-primary.pub --assets dist
tools/make-update-manifest verify https://updates.fastkiwi.app/remember-me/latest.json --download
```

- `build` hashes the files and writes the URLs: mirror
  `https://updates.fastkiwi.app/<app>/<tag>/<name>` (`--layout flat`:
  `<app>/<name>`), then `https://github.com/<repo>/releases/download/<tag>/<name>`.
- `sign` writes `latest.json.minisig` with the trusted comment above. Without
  the secret it prints a warning and exits 0 (`--require` makes that an error).
- `verify` checks the schema, the signature (with `--pub`), local files
  (`--assets`) and every download URL (`--download`). Use it after setting up
  or changing the mirror.
- Tests: `python3 -m unittest discover -s tools -p "test_*.py"` (fake v9.9.9,
  a local HTTP server; the signing tests need `minisign`).

## Uploading to the mirror

Uploading to R2 is **not wired yet**: it needs a Cloudflare API token, a
secret that writes to a third-party system, so it waits for the owner's
approval. Until then the release attaches `latest.json` (and
`latest.json.minisig` when signed) to the GitHub release, and the apps fall
back to GitHub while `updates.fastkiwi.app` does not answer.

