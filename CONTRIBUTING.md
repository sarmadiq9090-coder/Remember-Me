# Contributing

Thank you for improving Remember Me. Open an issue before large changes, and keep each pull request focused on one problem.

## Ways to help

- **Translations:** native speakers can review or fix any of the 12 interface languages. You don't need to write code. See [TRANSLATING.md](TRANSLATING.md), or open a [Translation review issue](https://github.com/sarmadiq9090-coder/Remember-Me/issues/new?template=translation.yml).
- **Bugs:** report a reproducible problem with the [bug report form](https://github.com/sarmadiq9090-coder/Remember-Me/issues/new?template=bug_report.yml). Issues labeled [good first issue](https://github.com/sarmadiq9090-coder/Remember-Me/labels/good%20first%20issue) are a good place to start fixing.
- **Ideas and questions:** start a thread in [Discussions](https://github.com/sarmadiq9090-coder/Remember-Me/discussions).

## Development

1. Install Node.js 22 or newer and pnpm 10.
2. Run `pnpm install`.
3. Start the app with `pnpm start`.
4. Run `pnpm test` and `pnpm lint` before submitting.

[ARCHITECTURE.md](ARCHITECTURE.md) describes how the code is organized, and the README's [Development](README.md#development) section lists the tests.

## Guidelines

- Interface text is English in the code and goes through `tr()`. When you add or change text, add the English entry to `ui/locales/en.json` and the Arabic one to `ui/locales/ar.json`; other languages fall back to English until they are translated.
- Check both the English (left-to-right) and Arabic (right-to-left) interface when you change the layout.
- Do not commit user data, attachments, backups, installers, or generated release folders.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
