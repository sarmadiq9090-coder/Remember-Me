# Spec: Update manifest on fastkiwi.app (`fastkiwi.app/updates/<app>/`)

Installed apps must keep getting updates even when GitHub is down or the
owner's account is unavailable (council rule 13). Owner decision D-038: free
services only, so there is **no Cloudflare R2** and no `updates.fastkiwi.app`.
Instead:

- **The manifest** is served by the website on Cloudflare Pages (free):
  `https://fastkiwi.app/updates/<app>/latest.json` and
  `https://fastkiwi.app/updates/<app>/latest.json.minisig`, a small file signed
  with the **same minisign keys** as the programs (arabic-file-search and local-ai-chat: docs/specs/signing.md; Remember Me signs only the manifest, with its own key pair).
- **The programs** stay where they are: GitHub Releases first, then the same
  file as a release asset of the project's GitLab copy
  (`https://gitlab.com/fastkiwi1/<repo>/-/releases/<tag>/downloads/<name>`),
  a **fallback that is populated later**. Until it is, the GitLab address
  answers 404 and the GitHub copy is the only one.

This spec is shared by InstaFind (`instafind`), Lemon (`local-ai-chat`) and
Remember Me (`remember-me`); each repository's copy ends with its own
section. The tool `tools/make-update-manifest` is the same file in all three
repositories.

<div dir="rtl">

## ملخّص للمالك

- البرنامج يسأل أولاً ملف التحديث على موقعنا `fastkiwi.app/updates/…` (Cloudflare Pages، مجاني، بلا بطاقة ولا R2)، وإن لم يجد جواباً سليماً يرجع إلى GitHub كما كان.
- البرنامج نفسه يُنزَّل من GitHub أولاً، ثم من نسخة احتياطية على GitLab (`gitlab.com/fastkiwi1/…`) ستُملأ لاحقاً.
- لا يتغيّر شيء للمستخدمين قبل أن يُنشر الملف على الموقع: البرنامج يجد العنوان غير متاح فيرجع إلى GitHub بصمت.
- ما دامت مفاتيح التوقيع غير مضافة، لا يُستعمل ملف الموقع إلا إذا طابق ما فيه (الإصدار واسم المثبّت وبصمة SHA-512) ملف `latest.yml` الذي ينشره GitHub.
- Remember Me يقرأ GitHub أولاً كما كان، ولا يسأل ملف الموقع ونسخة GitLab إلا إذا تعذّر GitHub. لا نوافذ: حالة التحديث تظهر في الإعدادات فقط، كما كانت.
- لا رجوع إلى إصدار أقدم أبداً.

**ما يحدث عند كل إصدار:** CI يكتب `latest.json` (ويوقّعه حين يوجد السر) ويضعه في artifact اسمه `site-updates`، ثم ينشره الموقع (مستودع `sarmadiq9090-coder.github.io`) مع نشره التالي. CI هنا لا يرفع شيئاً إلى أي خدمة.
**خطواتك لاحقاً:** لا شيء الآن. ملء نسخة GitLab الاحتياطية سيأتي في PR منفصل يحتاج موافقتك (يكتب إلى خدمة خارجية).

</div>

## Remember Me: GitHub first, the GitLab copy as the fallback

Remember Me updates through electron-updater (NSIS installer, `latest.yml`,
SHA-512). The installer name `Remember-Me-Setup-<version>-x64.exe`, the
`.blockmap`, `latest.yml`, `appId: 'com.waqt.reminder'` and the GitHub feed in
`app-update.yml` are unchanged.

- **GitHub feed** (first, always): the `github` provider, as before (`FEED` in
  `updates.js`).
- **Fallback feed** (`src/platform/update-feed.js`, `chooseFallback`): a
  *generic* provider at the GitLab copy of the release,
  `https://gitlab.com/fastkiwi1/Remember-Me/-/releases/v<version>/downloads/`,
  which must hold electron-builder's `latest.yml`, the installer and its
  `.blockmap` (the same files as the GitHub release). It is **populated
  later**; until then it answers 404 and the update waits for GitHub.

Each check (`Updates.check` → `find`):

1. electron-updater reads GitHub's feed. If that works, its answer is used,
   exactly as before; the fallback is not asked.
2. Only when GitHub fails, `chooseFallback` fetches
   `https://fastkiwi.app/updates/remember-me/latest.json` (15 s timeout,
   64 KB). It must be this app's manifest for a release version, name an
   installer and its SHA-512, and list exactly
   `https://gitlab.com/fastkiwi1/Remember-Me/-/releases/v<version>/downloads/<installer>`
   among its URLs (no other GitLab project or folder). Otherwise: no fallback.
3. With `TRUSTED_PUBLIC_KEYS` (empty today; Remember Me's own key pair, made as
   in arabic-file-search's docs/specs/signing.md), `latest.json.minisig` must
   verify over `latest.json` (pre-hashed, a trusted key, trusted comment
   `remember-me update-manifest v<version>`). Without keys, GitHub's
   `latest.yml` (`releases/latest/download/latest.yml`) must name the same
   version, installer and SHA-512, so while GitHub is fully down nothing
   confirms the manifest (fail closed).
4. Only a release strictly newer than the running version is used.
5. electron-updater then reads the fallback feed (`setFeedURL`). `autoDownload`
   is off: the download starts only if what electron-updater read is exactly
   what was checked (`matchesExpected`: same version, only that installer, same
   SHA-512). Otherwise GitHub's error stands and the feed is set back to GitHub.
6. A download from GitHub that fails is tried once more through the fallback
   (steps 2 to 5). electron-updater checks every download against the SHA-512
   of the `latest.yml` it read; `allowDowngrade` stays off. The next check
   starts from GitHub again.

The fallback's own failures never show an error; the Settings status shows
"error" only when GitHub fails and the fallback cannot help, as before. The
fallback is asked only by an installed copy that updates itself
(`source === 'github'`, packaged, not a test run): never by the Microsoft Store
package, the portable build, Scoop copies, development builds or `WAQT_TEST`
runs. Logs carry short reason codes, never URLs (`update-feed`:
`manifest-unreachable`, `manifest-invalid`, `manifest-no-fallback`,
`manifest-signature`, `manifest-unconfirmed`, `manifest-not-newer`).

The minisign check is verify-only JavaScript (`verifyMinisign`): Ed25519 from
Node's `crypto`, and BLAKE2b-512 in plain JavaScript because Electron's
BoringSSL has no `blake2b512` hash.

Tests: `tests/update-feed.test.js` runs `chooseFallback` against a local HTTP
server with the fixtures in `tests/fixtures/update-manifest/` (a fake v9.9.9
made by the tool, TEST-ONLY keys, `regen.sh`): a signed manifest while GitHub
is down; unsigned, foreign-key, replayed, legacy, altered, invalid and
GitLab-less manifests; other GitLab projects, folders or files; the no-keys
cross-check (same, other SHA-512, newer, GitHub down); no downgrade; BLAKE2b
against Node's; every signature refusal. `tests/updates.test.js` covers the
order inside `Updates` (GitHub first and alone while it works; GitHub errors →
fallback; mismatched fallback answers → error; failed GitHub download →
fallback; both failing → error).

CI: `release.yml`'s build job writes `latest.json` and checks that it names the
same installer and SHA-512 as `latest.yml`. The publish job (Environment
`release`, no repository code) checks it with `jq` against the installer and
this tag, signs it when `MINISIGN_SECRET_KEY` exists (skipped with a warning
otherwise), attaches `latest.json` (+ `.minisig`) to the release, and then
copies them to `site-updates/updates/remember-me/` and uploads the
`site-updates` artifact for the website. `test.yml` runs the tool's tests.

## The manifest

`https://fastkiwi.app/updates/<app>/latest.json`, UTF-8 JSON, at most 64 KB:

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
        "https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v9.9.9/Remember-Me-Setup-9.9.9-x64.exe",
        "https://gitlab.com/fastkiwi1/Remember-Me/-/releases/v9.9.9/downloads/Remember-Me-Setup-9.9.9-x64.exe"
      ]
    }
  }
}
```

- `version` is `MAJOR.MINOR.PATCH` (no pre-releases), `tag` is `v<version>`.
- `assets` keys are `x64`, `x86`, `arm64`. Each app reads only its own CPU's
  entry, and only if `name` is the asset name it expects (asset names never
  change).
- `urls` are tried **in order**: the GitHub release first, then the GitLab
  release asset (fallback, populated later). Only `https` addresses whose last
  path segment is `name` are used; each app also limits the hosts to GitHub and
  its own GitLab project's releases (`gitlab.com/fastkiwi1/<repo>/-/releases/`).
- An asset's minisign signature, when the release is signed, is
  `<url>.minisig` next to **each** URL (so the GitLab release holds the
  `.minisig` files too, once it is populated).
- Extra fields are ignored by the apps; new fields are additive only.

### Signature

`latest.json.minisig` next to the manifest: a detached, **pre-hashed**
minisign signature of the exact bytes of `latest.json`, made with the app's
release key (primary, or the backup in an emergency). Its trusted comment is
`<app> update-manifest <tag>`, e.g. `remember-me update-manifest v9.9.9`.

## Updater flow (InstaFind and Lemon)

1. **Fetch** `https://fastkiwi.app/updates/<app>/latest.json`. Any failure (no
   network, DNS, TLS, HTTP 403, 404, 429, 5xx, too large, not valid for this
   app/CPU) means: use the current GitHub feed, exactly as before.
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
   unless GitHub knows a newer release (a manifest that was not updated yet);
   if GitHub cannot be reached then, the answer is still "up to date".
4. **Download** from each URL in order (GitHub, then GitLab). Every copy is
   checked against the manifest's size and SHA-256, and, when keys exist,
   against the minisign signature (also tried from each `<url>.minisig` in
   order). A failed or altered copy is deleted and the next URL is tried.
5. **Never downgrade.** Only a strictly newer version is offered or installed.

Automatic checks never show a window; a failed manual check shows the neutral
"The update server can't be reached right now…" text (unchanged).

### Threat model

| Attacker can… | Result |
|---|---|
| change `latest.json` on the website (site repo, Cloudflare Pages account) | **Blocked** with keys: no valid `latest.json.minisig`. Without keys: the manifest is used only when GitHub's `latest.yml` names the same installer and SHA-512. Either way it is read only after GitHub failed. |
| change files on the GitLab copy (GitLab account) | **Blocked**: electron-updater reads the GitLab feed only if its `latest.yml` names exactly the checked installer and SHA-512, and checks the download against that SHA-512; an altered copy is deleted and never run. Only `gitlab.com/fastkiwi1/<repo>/-/releases/…` addresses are accepted. |
| serve an old signed manifest (replay) | **No downgrade**: an old version is never offered. A frozen manifest only delays an update while GitHub is also down; while GitHub is up, a newer GitHub release wins. |
| block `fastkiwi.app` | The app falls back to GitHub, as before. |
| take GitHub down (or the account) | With keys, the signed manifest on fastkiwi.app and the GitLab copies keep updates going (once GitLab is populated). Without keys, nothing can confirm the manifest, so updates wait for GitHub (fail closed). |

## Building, signing and staging (`tools/make-update-manifest`)

Python 3.8+, standard library only (signing calls the `minisign` command). It
never uploads anything.

```sh
tools/make-update-manifest build --app remember-me --version 9.9.9 \
    --repo sarmadiq9090-coder/Remember-Me --asset x64=release/installer/Remember-Me-Setup-9.9.9-x64.exe \
    --notes-file docs/release-notes/v9.9.9.md --out latest.json
tools/make-update-manifest sign latest.json        # MINISIGN_SECRET_KEY / MINISIGN_PASSWORD; skips without them
tools/make-update-manifest verify latest.json --pub keys/minisign-primary.pub --assets dist
tools/make-update-manifest stage latest.json --out site-updates
tools/make-update-manifest verify https://fastkiwi.app/updates/remember-me/latest.json --download
```

- `build` hashes the files and writes the URLs in order:
  `https://github.com/<repo>/releases/download/<tag>/<name>`, then
  `https://gitlab.com/fastkiwi1/<repo name>/-/releases/<tag>/downloads/<name>`
  (`--gitlab-project group/name` to change it, `--no-gitlab` for GitHub only).
- `sign` writes `latest.json.minisig` with the trusted comment above. Without
  the secret it prints a warning and exits 0 (`--require` makes that an error).
- `verify` checks the schema, the signature (with `--pub`), local files
  (`--assets`) and every download URL (`--download`; the GitLab URL reports
  HTTP 404 until the copy is populated).
- `stage` validates the manifest and copies it, with `latest.json.minisig`
  when there is one, to `<out>/updates/<app>/`. A stale signature left in that
  folder is removed, so an unsigned manifest never sits next to an old
  signature.
- Tests: `python3 -m unittest discover -s tools -p "test_*.py"` (fake v9.9.9,
  a local HTTP server; the signing tests need `minisign`).

## Hand-off to the website

The release workflow **uploads nothing** to any host. After the release is
public it runs `stage` and uploads the folder as the workflow artifact
`site-updates`:

```
updates/remember-me/latest.json
updates/remember-me/latest.json.minisig          (when signed)
```

The website repository (`sarmadiq9090-coder.github.io`, deployed to Cloudflare
Pages) picks that artifact up in its own deploy, copies `updates/remember-me/` into
the site and publishes it at `https://fastkiwi.app/updates/remember-me/`. That deploy
is configured in the site repository, not here. Serve `latest.json*` with
`Cache-Control: max-age=300` or less. `latest.json` (and its signature) are
also attached to the GitHub release, so the site can be rebuilt from there.
The programs stay on GitHub Releases; the GitLab copy is populated later, by a
separate change that needs the owner's approval (it writes to a third-party
system).
