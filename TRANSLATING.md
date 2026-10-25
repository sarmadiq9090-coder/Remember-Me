# Translating Remember Me

Remember Me speaks 12 languages. English is the source, and Arabic was written by a native speaker. The other ten languages (Español, Français, Deutsch, Português (Brasil), Русский, 中文 (简体), 日本語, Türkçe, हिन्दी and Bahasa Indonesia) are machine-assisted. They have been reviewed, but people who use a language every day will still find wording that is stiff, too long or simply wrong. If that's you, this guide is for you. You don't need to write code.

There are two ways to help:

- **Report it:** open a [Translation review issue](https://github.com/sarmadiq9090-coder/Remember-Me/issues/new?template=translation.yml) with the strings that read badly and what you would write instead. That's enough, and someone else will make the change.
- **Fix it:** edit the language's file and open a pull request, as described below.

## Where the text lives

Each language is one JSON file in [`ui/locales/`](ui/locales):

| Language | File | Language | File |
| --- | --- | --- | --- |
| English (source) | `en.json` | Русский | `ru.json` |
| العربية | `ar.json` | 中文 (简体) | `zh-CN.json` |
| Español | `es.json` | 日本語 | `ja.json` |
| Français | `fr.json` | Türkçe | `tr.json` |
| Deutsch | `de.json` | हिन्दी | `hi.json` |
| Português (Brasil) | `pt-BR.json` | Bahasa Indonesia | `id.json` |

Every file covers the whole interface: the main window, the reminder alert, the notification-area menu, dialogs, notifications and error messages.

## How an entry looks

The **key** on the left is the English text, exactly as the app uses it. The **value** on the right is the translation:

```json
"Task restored.": "Tâche restaurée.",
"Today@nav": "Aujourd'hui",
```

- **Change only the value.** Never edit the key: the app looks the text up by the exact English key, so a changed key just means your translation is never shown.
- **Keep it valid JSON:** double quotes around both sides, a comma after every entry except the last, and `\"` for a double quote inside the text. Typographic quotes such as « », „ “ or 「」 need no escaping.
- **A key ending in `@something`,** such as `Today@nav` (the sidebar entry) or `FILE@badge` (the label on a file icon, cut to five letters), is the same English word used in a different place. Translate the part before the `@`, to fit that place.
- **A missing entry falls back to English,** so a half-finished file never breaks the app.

### Placeholders

Words in braces, such as `{title}`, `{count}`, `{time}`, `{date}`, `{name}` or `{reason}`, are filled in by the app. Keep them exactly as they are, in Latin letters, and never translate them. You may move them wherever your grammar needs them:

```json
"Due at {time}": "Fällig um {time}",
"Coming up: {title}": "まもなく: {title}",
```

The tests fail if a translation drops a placeholder or adds one that the English text doesn't have.

### Plural forms

Text that depends on a number is an object with one entry per plural form:

```json
"Every {count} days": {
  "one": "Every day",
  "other": "Every {count} days"
},
```

Use the forms your language has, as defined by the [Unicode CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html). `other` is always required:

| Language | Forms |
| --- | --- |
| العربية | `zero`, `one`, `two`, `few`, `many`, `other` |
| Русский | `one`, `few`, `many`, `other` |
| Español, Français, Português (Brasil) | `one`, `many`, `other` |
| English, Deutsch, Türkçe, हिन्दी | `one`, `other` |
| 中文 (简体), 日本語, Bahasa Indonesia | `other` |

A form may leave out `{count}` when the word says it already (for example "Every day" for one).

### Numbers, dates and digits

- **Write digits as 0-9** in every language, Arabic and Hindi included. The app shows all numbers, dates and times with Western digits so the layout never shifts. Don't type ٣ or ३ into a translation.
- Dates, times, weekday and month names come from the system's language data, not from these files, so there's nothing to translate for them.
- The app name stays **Remember Me**, except in Arabic, where it is **ذكرني**.

### Style

- Match the tone of the English text: short, friendly and plain. Buttons are verbs ("Snooze", "Restore") and should stay short, because space is tight in the alert.
- Use the same word for the same idea everywhere: if "Trash" is "Corbeille" in one place, it shouldn't be "Poubelle" in another. Search the file before you introduce a new term.
- Use the polite or neutral form that common Windows apps use in your language.

## Try your changes in the app

You need [Node.js](https://nodejs.org) 22 or newer and [pnpm](https://pnpm.io/installation) 10.

```sh
git clone https://github.com/sarmadiq9090-coder/Remember-Me.git
cd Remember-Me
pnpm install
pnpm start
```

`pnpm start` runs the app from the source files, with your real Remember Me data. To try it with an empty, throwaway data folder instead, start it in test mode, which also keeps Windows notifications and sounds quiet. In PowerShell:

```powershell
$env:WAQT_TEST = '1'; $env:WAQT_DATA_DIR = "$env:TEMP\remember-me-translation"; pnpm start
```

Then:

1. Open **Settings → Language** and pick your language. The interface switches at once. Date and time fields follow after a restart.
2. Walk through the views (Today, Upcoming, All tasks, Completed, Notes, Trash, Settings), open the task and note editors, and try the repeat options.
3. Choose **Preview alert** (the bell at the top, or in Settings) to see the reminder window, and add a task due in a minute to see a real one.
4. Right-click the Remember Me icon in the notification area to check the tray menu.
5. After editing a JSON file, close the app and run `pnpm start` again to load the new text.

Before you open a pull request, run:

```sh
node tools/i18n-keys.cjs
pnpm test
```

The first lists how many keys each language is missing. The second checks that every file is valid JSON and that every translation keeps its placeholders and plural forms.

## Pull request checklist

- [ ] Only values changed, no keys, in `ui/locales/<code>.json`.
- [ ] Every `{placeholder}` is kept, and plural objects have an `other` form.
- [ ] Digits are 0-9.
- [ ] `pnpm test` passes.
- [ ] I looked at the changed text in the app, or I say in the pull request that I couldn't.
- [ ] The pull request says which language it covers and whether you are a native speaker.

One language per pull request makes review easy. Small pull requests are welcome too: a single fixed sentence is a real improvement.

## Adding a new language

Open an issue first, so we can agree on the locale code and who will review it. The technical steps are in the [Translations section of the README](README.md#translations).
