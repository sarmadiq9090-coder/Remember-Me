# Microsoft Store

Remember Me is published in the Microsoft Store as **Remember Me Reminders** ("Remember Me" was already taken). The Store gets an MSIX package that `pnpm run store` builds from the same app folder as the NSIS installer. The Store signs it, so no certificate is needed.

| Partner Center value | |
| --- | --- |
| Store name (reserved) | Remember Me Reminders |
| Store ID | `9NGB1F7T7JGN` |
| Package/Identity/Name | `FastKiwi.RememberMeReminders` |
| Package/Identity/Publisher | `CN=8EFD6949-D088-481F-886D-82300679C5E5` |
| Package/Properties/PublisherDisplayName | `FastKiwi` |
| Package family name | `FastKiwi.RememberMeReminders_sm1xjmj6v76yc` |

[ملخص للمالك بالعربية](#ملخص-للمالك-بالعربية) at the end.

## Submission status

| Submission | Package | Submitted | Status | Publish setting |
| --- | --- | --- | --- | --- |
| 1 | v1.7.0, `Remember-Me-1.7.0-x64.appx` (146.4 MB) | 2026-11-06 | In certification | Publish this submission as soon as it passes certification (automatic, at the owner's request) |

Submission 1 was filled in as described below: 11 listing languages, all complete ([Store listing](#store-listing)); the certification notes under **Supplemental info → Additional Testing Information** ([Notes for certification](#notes-for-certification)); the [runFullTrust justification](#restricted-capability-justification-runfulltrust); and **Properties** as in [step 4](#3-upload-in-partner-center).

**Every later Store update is a new submission** with a package of a higher version (see **Versions** in [section 2](#2-build-and-download-the-package)). The GitHub updater is disabled in the Store build, so a Store user gets a new version only through a new submission.

## 1. The identity: `store/identity.json`

```json
{
  "identityName": "FastKiwi.RememberMeReminders",
  "publisher": "CN=8EFD6949-D088-481F-886D-82300679C5E5",
  "publisherDisplayName": "FastKiwi",
  "displayName": "Remember Me Reminders"
}
```

The values come from **Partner Center → Apps and games → Remember Me Reminders → Product management → Product identity**. Copy them exactly:

- `identityName` is **Package/Identity/Name**.
- `publisher` is **Package/Identity/Publisher** (the `CN=` GUID, the same for every FastKiwi app).
- `publisherDisplayName` is **Package/Properties/PublisherDisplayName**.
- `displayName` is the package's display name. Partner Center rejects a package whose display name isn't one of the names reserved for the app, so it must stay **Remember Me Reminders** (or another name reserved under **Product management → Manage app names**). It is the name of the Start menu entry and the startup task. The window title and the app itself still say "Remember Me".

The file is filled in. If it is ever reset, `pnpm run store` refuses to build while a value is empty or starts with `TODO`, and says which one. `pnpm run store -- --dry-run` ignores the file's identity and builds with the test values `FastKiwiTest.RememberMe` / `CN=FastKiwiTest`, only to check that the package builds. A dry-run package is named `…-dry-run.appx` and can't be uploaded.

## 2. Build and download the package

The package is built on GitHub Actions by `.github/workflows/store.yml` (electron-builder builds appx only on Windows: it needs `makeappx.exe` and `makepri.exe`).

1. Open **Actions → Store package → Run workflow**, choose `main` and run it. It also runs for every `v*` tag.
2. When it finishes, open the run and download the **store-package** artifact at the bottom of the summary, or run `gh run download <run-id> -n store-package -R sarmadiq9090-coder/Remember-Me`.
3. Unzip it: it holds `Remember-Me-<version>-x64.appx`. That file is the MSIX package (MSIX uses the `.appx` file format; Partner Center accepts both extensions).

If the run says **Dry run** in its summary, `store/identity.json` has a placeholder and the package can't be uploaded.

The job runs the unit tests, `pnpm run package` and `pnpm run store`, then opens the package and checks its identity, publisher, minimum Windows version (10.0.17763.0, Windows 10 1809), the `runFullTrust` capability, the startup task and `resources.pri`. Then `tests/store-install.ps1` signs a copy with a throwaway certificate, installs it on the runner, leaves sample data where the installer version keeps its data, starts the app as the Start menu does and checks its log: Store mode, the data copied into the package folder with its language kept, the app still running. It removes the package, the certificate and the sample afterwards. A second job, **Store screenshots**, retakes the listing images with Windows' fonts (see [Screenshots](#screenshots)). The workflow has a read-only token and uses no secrets.

To build on a Windows PC instead: `pnpm install`, `pnpm run package`, `pnpm run store`. The package is written to `release/store/`. To try it before uploading, install it with `Add-AppxPackage -Register` from an unpacked copy, or sign a copy with a test certificate. An unsigned package doesn't install by double-click.

**Versions:** the package version is `package.json`'s version plus `.0` (1.6.2 becomes 1.6.2.0). Partner Center needs a higher version for every new upload, so a Store-only fix needs a new app version. The fourth number must stay 0: the Store reserves it. The Store build never updates itself from GitHub, so every Store update means a new submission with a package carrying a higher version than the last one submitted.

## 3. Upload in Partner Center

1. **Apps and games → Remember Me Reminders → Start your submission** (later: **Update** on the existing submission).
2. **Packages:** drag `Remember-Me-<version>-x64.appx` into the upload area. Partner Center validates it and shows the identity, version, x64 and the languages. Under **Device families**, keep **Windows 10/11 Desktop** only. Save.
3. **Pricing and availability:** Free, all markets (or choose), visibility Public. Save.
4. **Properties:** category **Productivity**. **Uses personal information: Yes**. This was answered Yes only so that Partner Center accepts a privacy policy URL; the app collects nothing (see [Privacy policy](#privacy-policy)). Privacy policy URL `https://fastkiwi.app/privacy/`. Website `https://sarmadiq9090-coder.github.io/Remember-Me/`. Support contact **support@fastkiwi.app**. Product declarations: "can be installed to alternate drives" may stay on; everything else (non-Microsoft drivers or NT services, own purchase system, accessibility testing claim) is off. Save.
5. **Age ratings:** answer the questionnaire as in [Age rating](#age-rating-iarc-questionnaire).
6. **Store listings:** 11 languages, each complete: English (United States) and Arabic with the text in [Store listing](#store-listing), and nine more with their own translations in [store-listings-translations.md](store-listings-translations.md). Add the [screenshots](#screenshots) and their captions.
7. **Supplemental info → Additional Testing Information:** paste [the notes for certification](#notes-for-certification). Partner Center moved this field here from Submission options.
8. **Restricted capabilities:** Partner Center asks why the package uses `runFullTrust`. Paste [the justification](#restricted-capability-justification-runfulltrust).
9. **Submission options → Publishing:** **Publish this submission as soon as it passes certification** (automatic, chosen by the owner), not manual publishing.
10. **Submit to the Store.** Certification usually takes a few business days.

## 4. How the Store version differs

The app checks Electron's `process.windowsStore`, which is `true` only inside the MSIX package.

**Updates.** The Store installs new versions itself, and Store policy forbids an app updating itself. The Store version never loads electron-updater, never contacts GitHub, and asks no update consent. Settings → Updates and About say "Updates come from Microsoft Store." (`src/platform/updates.js`: `updateSource`, `createUpdater`; tested in `tests/store.test.js`).

**Start with Windows.** Electron's `app.setLoginItemSettings` doesn't work for a packaged app: it writes the HKCU `Run` key, and a packaged app's registry writes go to its private copy of the registry, which Windows doesn't read at sign-in. The package declares a startup task instead (`desktop:StartupTask`, `TaskId="RememberMeStartup"`, `Enabled="false"`). electron-builder's own `addAutoLaunchExtension` was not used: it turns the task on by default (and names it `SlackStartup`), while Remember Me starts with Windows only when the user asks, as the installer version does. Electron has no API to switch a startup task (that needs the WinRT `StartupTask` class), so in the Store version Settings shows **Open startup settings**, which opens Windows' **Settings → Apps → Startup** page, where the user turns on **Remember Me Reminders** (the startup task's name there, from `store/identity.json`; the app's help text says so in every language). The "Start with Windows is off" warning becomes a banner with the same button that can be dismissed. Windows starts the task without `--background`, so the main window opens at sign-in.

**Taskbar identity.** The installer version sets the AppUserModelID `com.waqt.reminder` (its taskbar group since v1.4). The Store version doesn't: Windows gives it `<package family name>!RememberMe` from the package, so its taskbar button groups with its pinned tile and Start entry (`appUserModelId` in `src/platform/login-item.js`).

**Data folder.** Inside a package Windows virtualizes `%APPDATA%`: files the app creates there go into a hidden per-package copy that File Explorer, other programs and the installer version can't see. So the Store version keeps its data in its package folder:

```
%LOCALAPPDATA%\Packages\FastKiwi.RememberMeReminders_sm1xjmj6v76yc\LocalState\Remember Me
```

Settings shows this path and **Open data folder** opens it. The data, backups and log are laid out as in the installer version.

**Moving from the installer version.** No data is lost:

- On its first start, the Store version copies the installer version's data from `%APPDATA%\Remember Me` (or `%APPDATA%\Waqt` from v1.4) into its package folder and checks the copy: `data.json`, `data.json.bak`, `attachments`, `backups`, `drive-backup.json` and `logs`. The original is not changed or deleted. The Google Drive backup settings come along.
- Quit the installer version from its tray menu first, so it isn't writing while the copy is made. If the copy fails, the Store version works on `%APPDATA%\Remember Me` as it is (it can still read the installer version's files there) and tries the copy again at the next start.
- After the first start the two versions don't share data, and if both run, every reminder shows twice. So after the copy the Store version shows a banner (until it is dismissed) asking the user to uninstall the old version, listed as **Remember Me** in **Settings → Apps → Installed apps** (its uninstaller keeps `%APPDATA%\Remember Me`). Turn on start with Windows again in the Store version (see above): the installer version's entry is removed by its uninstaller.
- The manual way always works too: **Export backup** in the installer version, then **Restore from backup** in the Store version.

**Language on first run.** The Store has no installer page that could ask for a language, so a fresh install (no saved data) opens in the first of Windows' preferred languages that the app has (`app.getPreferredSystemLanguages()`, matched by `matchLocale` in `ui/lib/translate.js`), else English. A saved language, including one copied from the installer version, is never changed. The installer version does the same.

**Uninstalling the Store version deletes its data** (Windows removes the package folder, and **Settings → Apps → Advanced options → Reset** empties it). Export a backup, or keep a Google Drive backup, before uninstalling or resetting.

**Rating request.** Only the Store version asks, once, for a rating, after a first real success: a reminder marked done, or five reminders set (`ui/lib/rating.js`). **Rate in the Store** opens `ms-windows-store://review/?ProductId=9NGB1F7T7JGN`; **Not now** is final. Either answer is saved as `settings.ratingAsked`, also kept when a backup is restored. Nothing is offered in return for a rating. About has a **More from FastKiwi** section in every version: the other FastKiwi apps (`src/platform/more-apps.js`; a `ms-windows-store://pdp/?productid=…` link only for an app whose Store listing is live), ending with the publisher page (`ms-windows-store://publisher/?name=FastKiwi`, `STORE_LINKS` in `src/platform/about.js`).

**Not changed:** the reminders, alerts, tray icon, backups, Google Drive folder copies and Report a problem work as in the installer version. Spellcheck is off in every version, so Chromium never downloads dictionaries.

## Store listing

Partner Center limits: description up to 10,000 characters, short description up to 1,000, up to 20 features of up to 200 characters each, up to 7 search terms of up to 30 characters (21 words in all), release notes up to 1,500.

The package declares the app's 12 interface languages. The Store listings have **11 languages, all complete**:

| Listing language | Text | Screenshots |
| --- | --- | --- |
| English (United States) | [below](#english-united-states) | the four English ones |
| Arabic | [below](#arabic-العربية) | the four Arabic ones |
| German, Spanish, French, Indonesian, Japanese, Portuguese (Brazil), Russian, Turkish, Chinese (China) | their own translations in [store-listings-translations.md](store-listings-translations.md) | the four English ones, with the translated captions from that file |

Never paste the English text into another language's listing: policy 10.7 wants each listing in the language it is listed under.

**Hindi** was removed from the listings (Store listings → **Manage additional languages**). The package still declares Hindi, and the app still opens in Hindi for Hindi users. A future Hindi listing needs a review by a native speaker first.

This replaces the earlier instruction to fill only English and Arabic and remove the ten other listing languages: it is superseded.

### English (United States)

**Product name:** Remember Me Reminders

**Short description:**

> Tasks, notes and reminders for Windows, with alerts that stay on screen until you deal with them. Free, open source and offline: no account, no tracking.

**Description:**

> Remember Me is a task, note and reminder app for Windows that makes sure you don't miss what matters. When a reminder is due, a small alert appears above the taskbar and stays on top of your other windows until you choose Done or snooze it. It doesn't slide away after a few seconds like a notification.
>
> Snooze for 10 minutes, an hour, this evening, tomorrow morning, next week or any time you pick, with one key. Set tasks to repeat daily, weekly, monthly, yearly, on chosen weekdays or every few days. Add steps, tags, priorities and attachments, and keep notes on colored paper.
>
> Your data stays on your PC. There is no account, no analytics and no tracking. You can export a full backup with checksums, restore it after it's verified, or copy daily backups into a folder that Google Drive for desktop syncs. Remember Me never signs in to Google and has no access to your Google account.
>
> Remember Me speaks 12 languages, including a full right-to-left Arabic interface, and offers light and dark themes with six color palettes. It is free and open source under the MIT license.
>
> Reminders appear while Remember Me is running: closing the window keeps it in the notification area, and you can turn on Start with Windows in Windows Settings > Apps > Startup.
>
> Windows only — no phone app or cloud sync.

**Features:**

1. Sticky alerts that stay above the taskbar, on top of other windows, until you choose Done or snooze.
2. Smart snooze on keys 1 to 6: 10 minutes, 1 hour, this evening, tomorrow, next week or any time. Set your own six choices.
3. Repeating tasks: daily, weekly, monthly, yearly, chosen weekdays or every few days, at the same local time across DST changes.
4. Early notice from 5 minutes to 1 day before a reminder, and an optional repeated sound while an alert is unanswered.
5. Notes on ten paper colors, as plain cards, sticky-style paper or lined paper.
6. Attach PDFs, documents, sheets and images to tasks and notes. Images preview inline, even in the alert.
7. Checklists, tags, priorities, and search (Ctrl+K) that matches Arabic text with or without diacritics.
8. Undo, and a Trash that keeps deleted tasks and notes for 30 days.
9. Verified backups with checksums, one-click restore, and daily copies into your Google Drive for desktop folder.
10. 12 interface languages, with a full right-to-left Arabic interface.
11. Light, dark or system theme, six color palettes including high contrast.
12. Pause reminders for an hour, until tomorrow, or until you resume.
13. No account, no analytics, no tracking. Your data stays on your PC.
14. Free and open source (MIT).
15. Quick add from anywhere (off until you turn it on): a global shortcut, Ctrl+Alt+R or one you choose, opens a small box to add a task without opening the app.
16. Windows only — no phone app or cloud sync.

**Search terms:** reminder, to do list, tasks, notes, alarm, planner, Arabic

**What's new in this version (release notes):**

> First release in the Microsoft Store. Updates now arrive through the Store. If you used the version from GitHub, your tasks, notes and attachments are copied in the first time you start this one.

**Copyright and trademark info:** © FastKiwi. Open source under the MIT license.

**Additional license terms:** MIT License, https://github.com/sarmadiq9090-coder/Remember-Me/blob/main/LICENSE

### Arabic (العربية)

**Product name:** «ذكّرني - تذكير ومهام». Reserve it first under **Product management → Manage app names → Reserve another name**: every listing must use a reserved name. Until it is reserved, use Remember Me Reminders.

**الوصف المختصر:**

> مهام وملاحظات وتذكيرات لويندوز، بتنبيهات تبقى على الشاشة حتى تتعامل معها. مجاني ومفتوح المصدر ويعمل دون إنترنت: بلا حساب وبلا تتبع.

**الوصف:**

> ذكرني تطبيق مهام وملاحظات وتذكيرات لويندوز، يضمن ألا يفوتك ما يهمك. عندما يحين موعد تذكير، تظهر نافذة تنبيه صغيرة فوق شريط المهام وتبقى فوق نوافذك الأخرى حتى تختار «تم» أو تؤجله. لا تختفي بعد ثوانٍ كالإشعارات العادية.
>
> أجّل التذكير 10 دقائق أو ساعة أو إلى المساء أو صباح الغد أو الأسبوع القادم أو أي وقت تختاره، بضغطة مفتاح واحدة. واجعل المهام تتكرر يوميًا أو أسبوعيًا أو شهريًا أو سنويًا أو في أيام تختارها أو كل بضعة أيام. أضف خطوات ووسومًا وأولويات ومرفقات، واكتب ملاحظاتك على ورق ملوّن.
>
> بياناتك تبقى على جهازك. لا حساب، ولا إحصاءات، ولا تتبع. يمكنك تصدير نسخة احتياطية كاملة مع بصمات للتحقق منها، واستعادتها بعد التحقق، أو نسخ نسخة يومية إلى مجلد يزامنه تطبيق Google Drive لسطح المكتب. لا يسجّل ذكرني الدخول إلى Google ولا يصل إلى حسابك فيها.
>
> يدعم ذكرني 12 لغة، منها واجهة عربية كاملة من اليمين إلى اليسار، مع سمة فاتحة وداكنة وست لوحات ألوان. وهو مجاني ومفتوح المصدر بترخيص MIT.
>
> تظهر التذكيرات ما دام ذكرني يعمل: إغلاق النافذة يبقيه في منطقة الإشعارات بجانب الساعة، ويمكنك تشغيله مع ويندوز من إعدادات ويندوز ← التطبيقات ← بدء التشغيل.
>
> لويندوز فقط، بلا تطبيق للهاتف ولا مزامنة سحابية.

**الميزات:**

1. تنبيهات ثابتة فوق شريط المهام وفوق النوافذ الأخرى حتى تختار «تم» أو التأجيل.
2. تأجيل ذكي بالمفاتيح من 1 إلى 6: 10 دقائق، ساعة، المساء، الغد، الأسبوع القادم أو أي وقت. واختر خياراتك الستة بنفسك.
3. مهام متكررة: يوميًا، أسبوعيًا، شهريًا، سنويًا، أيام تختارها أو كل بضعة أيام، في الوقت المحلي نفسه حتى مع التوقيت الصيفي.
4. إشعار مسبق من 5 دقائق إلى يوم قبل التذكير، وتكرار اختياري للصوت ما دام التنبيه بلا رد.
5. ملاحظات على عشرة ألوان من الورق: بطاقة عادية أو ورقة لاصقة أو ورق مسطّر.
6. أرفق ملفات PDF والمستندات والجداول والصور بالمهام والملاحظات، مع معاينة الصور حتى في التنبيه.
7. قوائم خطوات ووسوم وأولويات، وبحث (Ctrl+K) يطابق النص العربي مع التشكيل أو بدونه.
8. تراجع، وسلة محذوفات تحفظ المهام والملاحظات المحذوفة 30 يومًا.
9. نسخ احتياطية موثّقة ببصمات، واستعادة بضغطة، ونسخ يومية إلى مجلد Google Drive لسطح المكتب.
10. 12 لغة للواجهة، منها واجهة عربية كاملة من اليمين إلى اليسار.
11. سمة فاتحة أو داكنة أو حسب ويندوز، وست لوحات ألوان منها التباين العالي.
12. إيقاف التذكيرات مؤقتًا لساعة أو حتى الغد أو حتى تستأنفها.
13. بلا حساب ولا إحصاءات ولا تتبع. بياناتك تبقى على جهازك.
14. مجاني ومفتوح المصدر (MIT).
15. إضافة سريعة من أي مكان (متوقفة حتى تفعّلها): اختصار عام، Ctrl+Alt+R أو اختصار تختاره، يفتح مربعًا صغيرًا لإضافة مهمة دون فتح البرنامج.
16. لويندوز فقط، بلا تطبيق للهاتف ولا مزامنة سحابية.

**كلمات البحث:** ذكرني, تذكير, مهام, ملاحظات, منبه, قائمة مهام, تذكير بالمواعيد

**ما الجديد في هذا الإصدار:**

> أول إصدار في Microsoft Store. التحديثات تصل الآن من المتجر. إذا كنت تستخدم النسخة من GitHub، تُنسخ مهامك وملاحظاتك ومرفقاتك تلقائيًا في أول تشغيل لهذه النسخة.

**حقوق النشر:** © FastKiwi. مفتوح المصدر بترخيص MIT.

### Privacy policy

URL: **https://fastkiwi.app/privacy/**

The page covers all FastKiwi apps in one short policy. Its only line about Remember Me says its tasks stay on the computer, and it says the apps use the internet only to check GitHub for updates. It has **no Remember Me section**: it doesn't mention Report a problem, the Google Drive folder copies, attachments, or that the Store version doesn't contact GitHub at all. Add a section before submitting, for example:

> **Remember Me (Remember Me Reminders)**
> - Tasks, notes, attachments and settings are stored only on your PC. No account, analytics or telemetry.
> - Backups go only to folders you choose. For Google Drive, Remember Me copies files into the folder that Google Drive for desktop syncs; it never signs in to Google, uses no Google API and has no access to your account. Google's app does the upload, under Google's privacy policy.
> - Report a problem opens a pre-filled GitHub issue in your browser, only when you choose it. It contains the app and Windows versions, language, theme and recent log lines with paths removed, never your tasks, notes or file names. Nothing is sent unless you submit it.
> - The version from GitHub checks GitHub Releases for updates only if you allow it. The Microsoft Store version doesn't: the Store updates it.
> - Links you click open in your browser.

> **ذكرني (Remember Me Reminders)**
> - تُحفظ المهام والملاحظات والمرفقات والإعدادات على جهازك فقط. لا حساب ولا إحصاءات ولا بيانات استخدام.
> - تُنسخ النسخ الاحتياطية إلى المجلدات التي تختارها فقط. مع Google Drive، ينسخ ذكرني الملفات إلى المجلد الذي يزامنه تطبيق Google Drive لسطح المكتب؛ لا يسجّل الدخول إلى Google ولا يستخدم أي واجهة برمجية لها ولا يصل إلى حسابك. تطبيق Google هو الذي يرفع الملفات، وفق سياسة خصوصية Google.
> - «الإبلاغ عن مشكلة» يفتح بلاغًا جاهزًا على GitHub في متصفحك، وعندما تختاره أنت فقط. يتضمن إصدار التطبيق وإصدار ويندوز واللغة والسمة وآخر سطور السجل بعد حذف المسارات، ولا يتضمن مهامك أو ملاحظاتك أو أسماء ملفاتك. لا يُرسل شيء ما لم ترسله بنفسك.
> - النسخة من GitHub تتحقق من التحديثات على GitHub فقط إذا سمحت بذلك. أما نسخة Microsoft Store فلا تفعل: المتجر هو الذي يحدّثها.
> - الروابط التي تضغطها تُفتح في متصفحك.

## Age rating (IARC questionnaire)

In **Age ratings**, choose the category **Productivity, Utility, Reference, Educational or other app** (not a game, not a social or communication app), then answer:

| Question | Answer |
| --- | --- |
| Violence, blood, gore, fear or horror content | No |
| Sexual content or nudity | No |
| Crude humor, profanity or discriminatory language | No |
| Drugs, alcohol or tobacco | No |
| Gambling, simulated gambling, or real-money betting | No |
| Users can interact or exchange content with other users (chat, sharing, user-generated content visible to others) | No |
| Shares the user's current physical location with other users | No |
| Allows purchases of digital goods | No |
| Unrestricted internet access (a web browser or search engine) | No. Links open in the user's own browser. |
| Collects or shares personal information with third parties | No |
| Promotes or sells age-restricted products | No |

The expected result is the lowest rating everywhere (IARC 3+, ESRB Everyone, PEGI 3, USK 0).

## Notes for certification

Paste this into **Supplemental info → Additional Testing Information** (Partner Center moved the field there; it used to be **Submission options → Notes for certification**):

> Remember Me Reminders is a Win32 desktop app (Electron) packaged as MSIX. It needs runFullTrust because it is a classic desktop app and because of how reminders work:
> - Persistent alerts: when a reminder is due, a small frameless window appears above the taskbar and stays on top of other windows until the user chooses Done or Snooze. It must keep running in the background to show alerts on time.
> - Notification-area (tray) icon: closing the main window keeps the app running next to the clock. Right-click the tray icon and choose Exit to quit completely.
> - Start with Windows: the package declares a startup task (TaskId RememberMeStartup, shown as "Remember Me Reminders") that is disabled by default. The user turns it on in Windows Settings > Apps > Startup; the app's Settings has an "Open startup settings" button for this. The app writes no Run registry keys.
> - Optional global shortcut: Settings > "Quick add from anywhere" is off by default. When the user turns it on, the app registers one system-wide keyboard shortcut (Ctrl+Alt+R, or one the user picks) that opens a small always-on-top box to add a task. It is released when the setting is turned off or the app quits; if another app already holds it, Settings says so. The app does not read or log any other keys.
>
> How to test (no account or sign-in needed, works offline): open the app, choose "Add task", enter a title, turn on the reminder and set it one or two minutes ahead, then save. When it is due, the alert appears above the taskbar; use Done, or a snooze choice (keys 1-6). Settings > "Preview alert" shows an alert immediately.
>
> Updates come only from the Microsoft Store: the app's own GitHub updater is disabled in the Store package. Data is stored locally in the package's LocalState folder. The app makes no network requests unless the user clicks a link, "Report a problem" (opens a pre-filled GitHub issue in the browser) or chooses a Google Drive for desktop folder for backups (plain file copies, no Google sign-in).

## Restricted capability justification (runFullTrust)

Partner Center asks why the package uses the restricted capability `runFullTrust` (at most 500 characters). Submission 1 used exactly this text (433 characters):

> Remember Me is a classic Win32 desktop app (Electron) packaged as MSIX, so it needs runFullTrust. It keeps running in the notification area to show reminders on time: a small always-on-top alert window above the taskbar that stays until the user picks Done or Snooze. It also has a startup task (off by default) and an optional global shortcut for quick add (off by default). Data stays local in LocalState; no account, no analytics.

## Screenshots

Partner Center needs at least one desktop screenshot, PNG, 1366×768 or larger (up to ten; the first four show first).

The screenshots in `docs/screenshots/` are 1234×811 (main window) and 410×570 (alert), so **none of them fit**: they are narrower than 1366 px. Use the Store set in **`docs/screenshots/store/`**, all 1366×768 PNG with made-up sample data:

Upload them in this order, each with its caption (Partner Center has a caption box under every screenshot, up to 200 characters):

| File | Listing | Caption |
| --- | --- | --- |
| `store/alert-en.png` | English, first: the alert over the main window | A reminder stays on top until you choose Done or snooze it. |
| `store/main-en.png` | English: Today view | Your day at a glance: tasks, steps, tags and priorities. |
| `store/notes-en.png` | English: notes | Notes on colored paper, next to your tasks. |
| `store/dark-en.png` | English: dark theme, Lavender palette | Light or dark, with six color palettes. |
| `store/alert-ar.png` | Arabic, first: the alert at the bottom left | يبقى التذكير ظاهرًا حتى تنجزه أو تؤجله. |
| `store/main-ar.png` | Arabic: Today view, right to left | يومك في لمحة: المهام والخطوات والوسوم والأولويات. |
| `store/notes-ar.png` | Arabic: notes | ملاحظات على ورق ملوّن، بجانب مهامك. |
| `store/dark-ar.png` | Arabic: dark theme, Lavender palette | فاتح أو داكن، مع ست لوحات ألوان. |

The nine other listing languages use the four English screenshots in the same order (`alert-en`, `main-en`, `notes-en`, `dark-en`), each with the translated caption from [store-listings-translations.md](store-listings-translations.md).

Regenerate them after interface changes with `pnpm run screenshots -- --store` (on Windows, or on Linux under `xvfb-run`). It runs the app in test mode with sample data, sizes the main window to 1366×768, and draws the alert over the main window in the bottom corner of its side: right for English, left for Arabic, so it doesn't cover the right-to-left headline. The dark shots use the default Lavender palette, the purple of the app icon. The committed set comes from the **Store screenshots** job of `.github/workflows/store.yml`, which runs the same command on Windows (Segoe UI): download its `store-screenshots` artifact to update them.

Store logos for the listing (1:1 box art, 2:3 poster art) are optional; without them the Store uses the logos from the package.

## Package details

- `tools/store.cjs` (`pnpm run store`) uses electron-builder's `appx` target with the installer's shared settings (`tools/installer.cjs`: app ID, product and executable name, Electron version, icon) on the folder `pnpm run package` writes. The fuses and `app.asar` integrity checks are the same as the installer version's.
- Manifest: the identity above, `DisplayName` from `store/identity.json`, Application Id `RememberMe` (never change it: it is part of the app's identity in Windows), the 12 interface languages (`en-US` first), `TargetDeviceFamily Windows.Desktop` with `MinVersion 10.0.17763.0` (Windows 10 1809) and `MaxVersionTested 10.0.26100.0`, `runFullTrust` (electron-builder adds it), a transparent tile background, and the startup task.
- Logos: `tools/store-logos.cjs` draws them in plain Node from `assets/icon.png` (and the exact small sizes in `assets/icon.ico`) into `release/store-resources/appx/`: StoreLogo, Square44x44Logo, Square150x150Logo and Wide310x150Logo at scale 100, 125, 150, 200 and, where the icon stays at most 256 px, 400; Square44x44Logo at target sizes 16, 24, 32, 48 and 256, plated and `altform-unplated` for the taskbar. electron-builder indexes them into `resources.pri` with makepri.
- `resources/app-update.yml` is still inside the package (it comes from `pnpm run package`) but is never read: the Store version doesn't load electron-updater.

## ملخص للمالك بالعربية

**حالة الإرسال:** أُرسل الإرسال الأول (الإصدار 1.7.0، الملف `Remember-Me-1.7.0-x64.appx` بحجم 146.4 ميغابايت) في 2026-11-06، وهو الآن قيد الاعتماد (certification). خيار النشر: «Publish this submission as soon as it passes certification»، أي يُنشر تلقائيًا فور نجاح الاعتماد، بطلبك، وليس يدويًا.

**كل تحديث قادم في المتجر يحتاج إرسالًا جديدًا** بحزمة رقم إصدارها أعلى من السابق، لأن المحدِّث الداخلي من GitHub متوقف في نسخة المتجر.

**الهوية جاهزة.** الملف `store/identity.json` فيه قيم Partner Center الحقيقية: الاسم `FastKiwi.RememberMeReminders`، والناشر `CN=8EFD6949-D088-481F-886D-82300679C5E5`، واسم الناشر `FastKiwi`، واسم العرض «Remember Me Reminders» (يجب أن يطابق الاسم المحجوز في المتجر). إن احتجت تغييرها، انسخها حرفيًا من: Partner Center ← Remember Me Reminders ← Product management ← Product identity. إذا بقي فيه قيمة فارغة أو تبدأ بـ TODO يرفض `pnpm run store` البناء، أما `--dry-run` فيبني حزمة تجريبية بقيم وهمية لا تُرفع.

**بناء الحزمة وتنزيلها:**
1. في GitHub افتح Actions ← Store package ← Run workflow على `main` (ويعمل تلقائيًا مع كل وسم `v*`).
2. بعد انتهائه افتح التشغيل ونزّل الملف المرفق **store-package** من أسفل الصفحة، وفكّ ضغطه: ستجد `Remember-Me-<الإصدار>-x64.appx`، وهو حزمة MSIX.
3. إذا ظهرت كلمة Dry run في ملخص التشغيل، فالهوية ناقصة والحزمة لا تُرفع.

**الرفع في Partner Center:** Apps and games ← Remember Me Reminders ← Start your submission ← Packages، واسحب ملف `.appx` إليه، وأبقِ Windows 10/11 Desktop فقط. ثم: Pricing and availability (مجاني)، Properties (الفئة Productivity، وسؤال «Uses personal information» أُجيب عنه بـ «Yes» فقط ليقبل Partner Center رابط الخصوصية https://fastkiwi.app/privacy/، وجهة الدعم support@fastkiwi.app)، Age ratings (الإجابات في الجدول أعلاه: كلها «لا»)، Store listings (11 لغة، انظر أدناه)، Supplemental info ← Additional Testing Information (الصق «ملاحظات الاعتماد» أعلاه؛ نقل Partner Center هذه الخانة إلى هنا من Submission options)، وشرح القدرة المقيّدة runFullTrust (النص الحرفي في قسم «Restricted capability justification» أعلاه، 433 حرفًا من 500)، وخيار النشر التلقائي في Submission options، ثم Submit. كل رفع جديد يحتاج رقم إصدار أعلى في `package.json`.

**قبل الإرسال:** صفحة الخصوصية https://fastkiwi.app/privacy/ ليس فيها قسم خاص بذكرني؛ أضف القسم المقترح أعلاه (بالعربية والإنجليزية). وصور المتجر الجاهزة في `docs/screenshots/store/` بمقاس 1366×768، أربع بالإنجليزية وأربع بالعربية، ولكل صورة تعليق جاهز في جدول «Screenshots» أعلاه؛ الصور القديمة في `docs/screenshots/` أصغر من الحد المطلوب.

**صفحات المتجر:** 11 لغة، كلها مكتملة. الإنجليزية (الولايات المتحدة) والعربية بالنصوص الموجودة في هذا الملف. والألمانية والإسبانية والفرنسية والإندونيسية واليابانية والبرتغالية (البرازيل) والروسية والتركية والصينية (الصين) بترجمات خاصة بها في الملف [store-listings-translations.md](store-listings-translations.md)، مع لقطات الشاشة الإنجليزية الأربع وتعليقات مترجمة. لا تلصق النص الإنجليزي في لغة أخرى (سياسة 10.7). أُزيلت الهندية من صفحات المتجر، لكن الحزمة ما زالت تعلن دعمها؛ وأي صفحة هندية في المستقبل تحتاج مراجعة متحدث أصلي أولًا. التعليمات القديمة «احذف اللغات العشر الأخرى» لم تعد سارية. الاسم العربي «ذكّرني - تذكير ومهام» يجب حجزه أولًا من Product management ← Manage app names ← Reserve another name. حقوق النشر: © FastKiwi.

**ما يختلف في نسخة المتجر:**
- **التحديثات** من المتجر فقط؛ المحدِّث الداخلي من GitHub متوقف تمامًا، وتقول الإعدادات «التحديثات تأتي من Microsoft Store».
- **التشغيل مع ويندوز:** لا يمكن لتطبيق من المتجر استخدام مفتاح Run في السجل، لذلك تحتوي الحزمة على «مهمة بدء تشغيل» متوقفة افتراضيًا، ويفعّلها المستخدم من إعدادات ويندوز ← التطبيقات ← بدء التشغيل، واسمها هناك «Remember Me Reminders». في إعدادات التطبيق زر «فتح إعدادات بدء التشغيل» يفتح هذه الصفحة. عند التشغيل مع ويندوز تظهر النافذة الرئيسية (ويندوز لا يمرر خيار التشغيل في الخلفية).
- **البيانات** في مجلد الحزمة: `%LOCALAPPDATA%\Packages\FastKiwi.RememberMeReminders_sm1xjmj6v76yc\LocalState\Remember Me`.
- **الانتقال من نسخة المثبّت لا يضيّع شيئًا:** في أول تشغيل تنسخ نسخة المتجر البيانات من `%APPDATA%\Remember Me` وتتحقق منها، دون تغيير الأصل. يُفضَّل إغلاق نسخة المثبّت أولًا. إذا عملت النسختان معًا يظهر كل تذكير مرتين، لذلك تعرض نسخة المتجر بعد النسخ شريطًا يطلب إلغاء تثبيت النسخة القديمة (اسمها في قائمة التطبيقات «Remember Me»). بعد التأكد يمكن إلغاء تثبيت نسخة المثبّت (تبقى بياناتها)، ثم تفعيل التشغيل مع ويندوز من جديد. والطريقة اليدوية متاحة دائمًا: «تصدير نسخة احتياطية» ثم «استعادة» في نسخة المتجر.
- **تنبيه:** إلغاء تثبيت نسخة المتجر أو «إعادة تعيينها» يحذف بياناتها؛ صدّر نسخة احتياطية قبل ذلك.
