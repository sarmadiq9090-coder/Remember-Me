#!/bin/sh
# TEST-ONLY fixtures for tests/update-feed.test.js: a fake Remember Me v9.9.9
# release as the update mirror would serve it (docs/specs/update-manifest.md).
#
# These keys are PUBLIC on purpose and protect nothing: they are used only by the
# tests, which assert that none of them is ever in TRUSTED_PUBLIC_KEYS
# (src/platform/update-feed.js). NEVER use them to sign a release.
#
# Regenerate (needs `minisign` and python3), from this folder:
#   sh regen.sh
set -eu
cd "$(dirname "$0")"
rm -f ./*.pub ./*.key ./*.minisig manifest.json latest.yml
for k in test-primary test-backup test-other; do
  minisign -G -W -f -p "$k.pub" -s "$k.key" >/dev/null
done
tmp=$(mktemp -d)
printf 'Remember Me update-manifest test installer (not a real exe).\n' > "$tmp/Remember-Me-Setup-9.9.9-x64.exe"
python3 ../../../tools/make-update-manifest build --app remember-me --version 9.9.9 \
  --repo sarmadiq9090-coder/Remember-Me --released 2026-11-13T06:00:00Z --layout flat \
  --notes-url https://fastkiwi.app/Remember-Me/ --asset x64="$tmp/Remember-Me-Setup-9.9.9-x64.exe" \
  --out manifest.json >/dev/null
rm -r "$tmp"
# latest.yml as electron-builder writes it for this installer.
python3 - <<'PY'
import json
a = json.load(open("manifest.json"))["assets"]["x64"]
open("latest.yml", "w").write(
    "version: 9.9.9\nfiles:\n  - url: {n}\n    sha512: {h}\n    size: {s}\npath: {n}\nsha512: {h}\n"
    "releaseDate: '2026-11-13T06:00:00.000Z'\n".format(n=a["name"], h=a["sha512"], s=a["size"]))
PY
msign() { # <key> <sig file> <trusted comment> [extra minisign flags]
  key=$1; out=$2; tc=$3; shift 3
  minisign -S "$@" -s "$key.key" -m manifest.json -x "$out" -t "$tc" >/dev/null
}
msign test-primary manifest.json.minisig               "remember-me update-manifest v9.9.9"
msign test-backup  manifest.json.backup.minisig        "remember-me update-manifest v9.9.9"
msign test-other   manifest.json.other-key.minisig     "remember-me update-manifest v9.9.9"
msign test-primary manifest.json.wrong-version.minisig "remember-me update-manifest v9.9.8"
msign test-primary manifest.json.wrong-app.minisig     "instafind update-manifest v9.9.9"
msign test-primary manifest.json.legacy.minisig        "remember-me update-manifest v9.9.9" -l
# The secret halves are not needed by the tests: drop them (a rerun makes new ones).
rm -f ./*.key
echo "fixtures regenerated"
