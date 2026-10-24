; Included by electron-builder (nsis.include in tools/installer.cjs) in the installer and uninstaller.

!ifdef BUILD_UNINSTALLER
  ; The uninstaller's first page says the data folder is kept (deleteAppDataOnUninstall is false).
  ; 1033 is English and 1025 Arabic, the installer's two languages.
  LangString rmUninstallText 1033 "This will remove Remember Me from your computer.$\r$\n$\r$\nYour tasks, notes, attachments and backups are not deleted. They stay in:$\r$\n$APPDATA\Remember Me$\r$\n$\r$\nDelete that folder yourself if you no longer need them.$\r$\n$\r$\n$_CLICK"
  LangString rmUninstallText 1025 "سيُزال ذكرني من جهازك.$\r$\n$\r$\nلن تُحذف مهامك وملاحظاتك ومرفقاتك ونسخك الاحتياطية، وتبقى في:$\r$\n$APPDATA\Remember Me$\r$\n$\r$\nاحذف هذا المجلد بنفسك إذا لم تعد بحاجة إليها.$\r$\n$\r$\n$_CLICK"

  !macro customUnWelcomePage
    !define MUI_WELCOMEPAGE_TEXT "$(rmUninstallText)"
    !insertmacro MUI_UNPAGE_WELCOME
  !macroend
!endif
