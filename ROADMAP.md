# Roadmap · خارطة الطريق — Remember Me

**Role:** the community and quality flagship, and the only app with outside contributors.
The cross-app plan and the definition of "mature" are in the [profile roadmap](https://github.com/sarmadiq9090-coder/sarmadiq9090-coder/blob/main/ROADMAP.md).

Two kinds of milestones work together:
- the **version milestones** ([v1.7.0, v1.8.0 …](https://github.com/sarmadiq9090-coder/Remember-Me/milestones)) say *what* goes into a version;
- the **train milestones** (`train-YYYY-MM-DD`, Fridays at 09:00 Baghdad time) say *which Friday* a change ships. At most one release a week.

## Phase 1, Foundation (Nov 6 and Nov 13)
- [ ] `CLAUDE.md` with the owner's rules and a repository guide ([#96](https://github.com/sarmadiq9090-coder/Remember-Me/pull/96)), on the Nov 6 train.
- [ ] A Remember Me section in the single privacy page on fastkiwi.app.
- [ ] Release checklist and rollback (below).
- [ ] **Owner:** dismiss the minimatch Dependabot alert. It is a dev-only transitive dependency, and forcing minimatch 11 breaks packaging.

## Phase 2, Trust (Nov 20 to Dec 11)
- [ ] Escape locale strings before they reach `innerHTML` (`settings.js`, `render.js`), and add a lint rule that keeps it that way. Until then, every translation PR needs a code-level review.
- [ ] Move the window-open and navigation deny handlers into the app-wide `web-contents-created` hook (`src/main/index.js`). Today each window calls `secure()` in `src/main/windows.js`, and the hook only blocks webviews, so a future window could miss them.
- [ ] **Microsoft Store (MSIX/appx), first app together with InstaWords.** It is the only free route to installing with no warning. The owner first confirms that a developer account can be registered from Iraq ([#77](https://github.com/sarmadiq9090-coder/Remember-Me/issues/77)).
- [ ] **SignPath** (only for this app), after the prerequisites: a code-signing policy page, MFA, and a privacy statement. A rejection is possible ([#76](https://github.com/sarmadiq9090-coder/Remember-Me/issues/76)).
- [ ] winget: leave the validated PRs alone. Once they merge, automate updates with wingetcreate ([#75](https://github.com/sarmadiq9090-coder/Remember-Me/issues/75)).

## Phase 3, Users (Dec to Jan): one feature
- [ ] Triage the 28 open issues down to 5.
- [ ] Then quick add from anywhere with a global shortcut ([#82](https://github.com/sarmadiq9090-coder/Remember-Me/issues/82)).
- [ ] Consider restoring the Hijri date and digit options.

## Release checklist + rollback

The full checklist is [RELEASING.md](RELEASING.md). In short:

1. **CI green:** **Tests** passes on `main` (RELEASING.md §1).
2. **Version bump and CHANGELOG on Friday only:** `package.json`, `CHANGELOG.md` and the site's version change on the Friday train (§1).
3. **Dry run:** **Actions → Release → Run workflow** on `main` (§2).
4. **Asset list:** exactly four files: the installer, its `.blockmap`, `latest.yml` and `SHA256SUMS.txt` (§4).
5. **One updated install:** on a PC with the previous version, **Settings → Updates → Check now** offers and installs the new one (§5).

**Rollback.** RELEASING.md's "If something is wrong" section covers this. The standard route for every app is:
1. Turn the bad release back into a **draft**: `gh release edit vX.Y.Z --draft=true -R sarmadiq9090-coder/Remember-Me`. If GitHub refuses (for example on an immutable release), mark it as a pre-release instead, as RELEASING.md says. Either way, the updater stops offering it.
2. Fix the problem and ship **x.y.z+1**. Never reuse the number.
3. Updaters never downgrade. Installs that already took the bad version stay on it until x.y.z+1 ships, so ship it fast.

The `v*` tag ruleset blocks deleting or moving tags. To re-tag after a failed run (RELEASING.md "If something is wrong"), the owner pushes the tag as repository admin, who is on the ruleset's bypass list.

---

<div dir="rtl">

## بالعربية

**الدور:** رأس المجتمع والجودة، وهو البرنامج الوحيد الذي يساهم فيه مطوّرون من خارج الفريق. معالم الإصدارات (v1.7.0 وما بعده) تحدّد **ماذا** يدخل في الإصدار، ومعالم القطارات (`train-YYYY-MM-DD`، كل جمعة الساعة 09:00 بتوقيت بغداد) تحدّد **أي جمعة** يصدر فيها. لا يصدر أكثر من إصدار واحد في الأسبوع.

- **المرحلة 1، الأساس (6 و13 نوفمبر):** ملف `CLAUDE.md` (#96) في قطار 6 نوفمبر، وقسم في صفحة الخصوصية، وقائمة فحص الإصدار مع خطة التراجع. **على المالك:** إغلاق تنبيه minimatch في Dependabot.
- **المرحلة 2، الثقة (20 نوفمبر إلى 11 ديسمبر):** تنظيف نصوص الترجمة قبل إدخالها في الصفحة (`innerHTML`) مع قاعدة فحص تمنع تكرار المشكلة، ونقل منع فتح النوافذ والصفحات الخارجية إلى مكان واحد يشمل كل نافذة، حتى النوافذ التي تُضاف لاحقًا، ومتجر مايكروسوفت (بعد أن يتأكد المالك أن التسجيل من العراق ممكن)، وSignPath بعد شروطه، وأتمتة تحديثات winget.
- **المرحلة 3، المستخدمون (ديسمبر ويناير):** فرز الطلبات المفتوحة (28) إلى 5، ثم ميزة «الإضافة السريعة من أي مكان»، والنظر في إعادة خيارات التاريخ الهجري والأرقام.

**الإصدار والتراجع:** الخطوات في [RELEASING.md](RELEASING.md). إذا كان الإصدار سيئًا: حوّله إلى مسودة (أو إصدار تجريبي)، ثم أصدر x.y.z+1. المحدِّث لا ينزل إلى إصدار أقدم أبدًا.

</div>
