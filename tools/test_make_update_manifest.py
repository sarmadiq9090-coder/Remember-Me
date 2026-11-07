"""Tests for tools/make-update-manifest (stdlib unittest; fake release v9.9.9).

    python3 -m unittest discover -s tools -p "test_*.py"

The signing tests need the `minisign` command and are skipped without it.
"""

import base64
import contextlib
import functools
import hashlib
import http.server
import importlib.machinery
import importlib.util
import io
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_loader = importlib.machinery.SourceFileLoader("make_update_manifest", os.path.join(HERE, "make-update-manifest"))
_spec = importlib.util.spec_from_loader(_loader.name, _loader)
mum = importlib.util.module_from_spec(_spec)
_loader.exec_module(mum)

HAVE_MINISIGN = shutil.which("minisign") is not None
REPO = "sarmadiq9090-coder/example"
RELEASED = "2026-11-13T06:00:00Z"


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = mum.main(list(argv))
    return code, out.getvalue() + err.getvalue()


class LocalServer:
    """Serves a folder over http://127.0.0.1:<port>/ (missing files are 404)."""

    def __init__(self, root):
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
        handler.log_message = lambda *a: None
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.base = "http://127.0.0.1:%d" % self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="mum-test-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.dist = os.path.join(self.dir, "dist")
        os.mkdir(self.dist)
        self.files = {}
        for arch, name, body in [("x64", "app.exe", b"MZ fake x64 v9.9.9"), ("arm64", "app-arm64.exe", b"MZ fake arm64 v9.9.9")]:
            path = os.path.join(self.dist, name)
            with open(path, "wb") as f:
                f.write(body)
            self.files[arch] = (path, body)

    def build(self, **kw):
        assets = {arch: path for arch, (path, _) in self.files.items()}
        return mum.build("example", "9.9.9", REPO, assets, released=RELEASED, **kw)


class BuildTest(Base):
    def test_manifest_fields_and_url_order(self):
        m = self.build(notes="الجديد")
        self.assertEqual((m["schema"], m["app"], m["version"], m["tag"], m["released"]), (1, "example", "9.9.9", "v9.9.9", RELEASED))
        self.assertEqual(m["notes_url"], "https://github.com/%s/releases/tag/v9.9.9" % REPO)
        self.assertEqual(m["notes"], "الجديد")
        x = m["assets"]["x64"]
        body = self.files["x64"][1]
        self.assertEqual(x["name"], "app.exe")
        self.assertEqual(x["size"], len(body))
        self.assertEqual(x["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual(base64.b64decode(x["sha512"]), hashlib.sha512(body).digest())
        # Cloudflare first, then GitHub.
        self.assertEqual(x["urls"], [
            "https://updates.fastkiwi.app/example/v9.9.9/app.exe",
            "https://github.com/%s/releases/download/v9.9.9/app.exe" % REPO,
        ])
        self.assertEqual(sorted(m["assets"]), ["arm64", "x64"])
        self.assertEqual(mum.validate(m, "example"), [])
        self.assertEqual(mum.trusted_comment("example", "v9.9.9"), "example update-manifest v9.9.9")

    def test_flat_layout(self):
        m = self.build(layout="flat")
        self.assertEqual(m["assets"]["x64"]["urls"][0], "https://updates.fastkiwi.app/example/app.exe")

    def test_bad_input_is_refused(self):
        assets = {"x64": self.files["x64"][0]}
        for kw in [dict(app="Bad App"), dict(version="9.9"), dict(version="9.9.9-beta"), dict(version="09.9.9"), dict(repo="nope")]:
            args = dict(app="example", version="9.9.9", repo=REPO)
            args.update(kw)
            with self.assertRaises(mum.ManifestError, msg=str(kw)):
                mum.build(args["app"], args["version"], args["repo"], assets, released=RELEASED)
        with self.assertRaises(mum.ManifestError):
            mum.build("example", "9.9.9", REPO, {"mips": self.files["x64"][0]}, released=RELEASED)
        code, out = run("build", "--app", "example", "--version", "9.9.9", "--repo", REPO, "--asset", "x64=" + self.files["x64"][0], "--asset", "x64=" + self.files["x64"][0])
        self.assertEqual(code, 1, out)
        code, out = run("build", "--app", "example", "--version", "9.9.9", "--repo", REPO, "--asset", "x64=/no/such/file")
        self.assertEqual(code, 1, out)

    def test_cli_writes_the_file_and_reads_notes(self):
        notes = os.path.join(self.dir, "v9.9.9-notes.md")
        with open(notes, "w", encoding="utf-8") as f:
            f.write("# Title line\r\n\r\nملاحظات\r\n**English:** notes\r\n")
        out = os.path.join(self.dir, "latest.json")
        code, log = run("build", "--app", "example", "--version", "v9.9.9", "--repo", REPO, "--released", RELEASED,
                        "--asset", "x64=" + self.files["x64"][0], "--notes-file", notes, "--out", out)
        self.assertEqual(code, 0, log)
        with open(out, "rb") as f:
            m = mum.parse(f.read(), "example")
        self.assertEqual(m["notes"], "ملاحظات\n**English:** notes")
        self.assertEqual(list(m["assets"]), ["x64"])
        # A missing notes file is no notes, not an error.
        code, log = run("build", "--app", "example", "--version", "9.9.9", "--repo", REPO,
                        "--asset", "x64=" + self.files["x64"][0], "--notes-file", notes + ".missing", "--out", out)
        self.assertEqual(code, 0, log)


class ValidateTest(Base):
    def test_tampering_is_caught(self):
        good = self.build()
        cases = {
            "http mirror": lambda m: m["assets"]["x64"]["urls"].__setitem__(0, "http://updates.fastkiwi.app/example/v9.9.9/app.exe"),
            "other file name": lambda m: m["assets"]["x64"]["urls"].__setitem__(0, "https://updates.fastkiwi.app/example/v9.9.9/evil.exe"),
            "no urls": lambda m: m["assets"]["x64"].__setitem__("urls", []),
            "bad sha256": lambda m: m["assets"]["x64"].__setitem__("sha256", "AB" * 32),
            "bad sha512": lambda m: m["assets"]["x64"].__setitem__("sha512", "abc"),
            "zero size": lambda m: m["assets"]["x64"].__setitem__("size", 0),
            "bool size": lambda m: m["assets"]["x64"].__setitem__("size", True),
            "tag mismatch": lambda m: m.__setitem__("tag", "v9.9.8"),
            "pre-release": lambda m: (m.__setitem__("version", "9.9.9-rc.1"), m.__setitem__("tag", "v9.9.9-rc.1")),
            "unknown arch": lambda m: m["assets"].__setitem__("mips", m["assets"]["x64"]),
            "schema": lambda m: m.__setitem__("schema", 2),
            "user in url": lambda m: m["assets"]["x64"]["urls"].__setitem__(0, "https://u@updates.fastkiwi.app/example/v9.9.9/app.exe"),
            "no assets": lambda m: m.__setitem__("assets", {}),
        }
        for what, change in cases.items():
            m = json.loads(json.dumps(good))
            change(m)
            self.assertNotEqual(mum.validate(m), [], what)
        self.assertNotEqual(mum.validate(good, app="other"), [])
        for bad in [b"", b"[]", b"not json", b"\xff", b"{" * 70000]:
            with self.assertRaises(mum.ManifestError):
                mum.parse(bad)
        # Plain http to the loopback is for tests only.
        m = self.build(mirror="http://127.0.0.1:9")
        self.assertNotEqual(mum.validate(m), [])
        self.assertEqual(mum.validate(m, allow_local_http=True), [])
        self.assertFalse(mum.check_url("http://127.0.0.1.evil.example/x", True))


class SignTest(Base):
    def setUp(self):
        super().setUp()
        self.manifest = os.path.join(self.dir, "latest.json")
        with open(self.manifest, "wb") as f:
            f.write(mum.dumps(self.build()))

    def test_skips_without_the_secret(self):
        env = {k: v for k, v in os.environ.items() if k != "MINISIGN_SECRET_KEY"}
        old = os.environ
        try:
            os.environ = env
            code, out = run("sign", self.manifest)
            self.assertEqual(code, 0, out)
            self.assertIn("NOT signed", out)
            self.assertFalse(os.path.exists(self.manifest + ".minisig"))
            code, out = run("sign", self.manifest, "--require")
            self.assertEqual(code, 1, out)
        finally:
            os.environ = old

    @unittest.skipUnless(HAVE_MINISIGN, "needs minisign")
    def test_sign_and_verify_round_trip(self):
        keys = {}
        for k in ("primary", "other"):
            pub, sec = os.path.join(self.dir, k + ".pub"), os.path.join(self.dir, k + ".key")
            subprocess.run(["minisign", "-G", "-W", "-f", "-p", pub, "-s", sec], check=True, stdout=subprocess.DEVNULL)
            with open(sec) as f:
                keys[k] = (pub, f.read())
        old = dict(os.environ)
        try:
            os.environ["MINISIGN_SECRET_KEY"] = keys["primary"][1]
            os.environ["MINISIGN_PASSWORD"] = ""
            code, out = run("sign", self.manifest)
            self.assertEqual(code, 0, out)
        finally:
            os.environ.clear()
            os.environ.update(old)
        sig = self.manifest + ".minisig"
        with open(sig) as f:
            self.assertIn("trusted comment: example update-manifest v9.9.9", f.read())
        code, out = run("verify", self.manifest, "--pub", keys["other"][0], "--pub", keys["primary"][0], "--assets", self.dist)
        self.assertEqual(code, 0, out)
        self.assertIn("verified with primary.pub", out)
        code, out = run("verify", self.manifest, "--pub", keys["other"][0])
        self.assertEqual(code, 1, out)
        # A changed manifest no longer verifies.
        with open(self.manifest, "rb") as f:
            data = f.read()
        with open(self.manifest, "wb") as f:
            f.write(data.replace(b"9.9.9", b"9.9.8").replace(b'"v9.9.8"', b'"v9.9.8"'))
        code, out = run("verify", self.manifest, "--pub", keys["primary"][0])
        self.assertEqual(code, 1, out)
        # Signed for another tag: the comment check refuses it.
        with open(self.manifest, "wb") as f:
            f.write(data)
        subprocess.run(["minisign", "-S", "-s", os.path.join(self.dir, "primary.key"), "-m", self.manifest, "-x", sig, "-t", "example update-manifest v9.9.8"],
                       check=True, stdout=subprocess.DEVNULL, input=b"\n")
        code, out = run("verify", self.manifest, "--pub", keys["primary"][0])
        self.assertEqual(code, 1, out)
        self.assertIn("trusted comment", out)


class LocalServerTest(Base):
    def test_verify_downloads_every_url_from_a_local_server(self):
        root = os.path.join(self.dir, "www")
        os.makedirs(os.path.join(root, "example", "v9.9.9"))
        os.makedirs(os.path.join(root, "gh", REPO, "releases", "download", "v9.9.9"))
        srv = LocalServer(root)
        self.addCleanup(srv.close)
        m = mum.build("example", "9.9.9", REPO, {a: p for a, (p, _) in self.files.items()}, released=RELEASED,
                      mirror=srv.base, github=srv.base + "/gh")
        with open(os.path.join(root, "example", "latest.json"), "wb") as f:
            f.write(mum.dumps(m))
        for arch, (path, _) in self.files.items():
            shutil.copy(path, os.path.join(root, "example", "v9.9.9"))
            shutil.copy(path, os.path.join(root, "gh", REPO, "releases", "download", "v9.9.9"))
        url = srv.base + "/example/latest.json"
        code, out = run("verify", url, "--download", "--allow-local-http", "--app", "example")
        self.assertEqual(code, 0, out)
        self.assertEqual(out.count(" ok"), 4, out)
        # Without the test switch, plain http is refused.
        code, out = run("verify", url)
        self.assertEqual(code, 1, out)
        # A mirror copy that was changed, and one that is missing, are both reported.
        with open(os.path.join(root, "example", "v9.9.9", "app.exe"), "wb") as f:
            f.write(b"MZ evil x64 v9.9.9")
        os.remove(os.path.join(root, "gh", REPO, "releases", "download", "v9.9.9", "app-arm64.exe"))
        code, out = run("verify", url, "--download", "--allow-local-http")
        self.assertEqual(code, 1, out)
        self.assertIn("does not match", out)
        self.assertIn("HTTP 404", out)


if __name__ == "__main__":
    unittest.main()
