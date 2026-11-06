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

  ; Start with Windows: app.setLoginItemSettings (src/platform/login-item.js) writes an HKCU Run value named
  ; com.waqt.reminder, "<install folder>\Remember Me.exe" --background (Waqt.exe until v1.4), and a
  ; StartupApproved value under the same name once it is turned on or off. Left behind, they would point at an
  ; exe that no longer exists, so a real uninstall removes every Run value that starts an exe from this install
  ; folder. Not on an upgrade: installing over Remember Me runs this uninstaller with --updated, and the new
  ; version keeps the entry and points it at itself (refreshLoginItem). The data folder is never touched.
  !define RM_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
  !define RM_STARTUP_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
  !macro rmRemoveRunEntry exe
    StrCpy $R4 "$INSTDIR\${exe}"
    StrLen $R5 $R4
    StrCpy $R6 $R3 $R5
    ${If} $R6 == $R4
      StrCpy $R2 "remove"
    ${EndIf}
  !macroend
  !macro customUnInstall
    ${IfNot} ${isUpdated}
      Push $R0
      Push $R1
      Push $R2
      Push $R3
      Push $R4
      Push $R5
      Push $R6
      StrCpy $R0 0
      ${Do}
        ClearErrors
        EnumRegValue $R1 HKCU "${RM_RUN_KEY}" $R0
        ${If} ${Errors}
        ${OrIf} $R1 == ""
          ${Break}
        ${EndIf}
        ReadRegStr $R3 HKCU "${RM_RUN_KEY}" $R1
        ; The command is "<exe>" <arguments>: compare the exe path without its opening quote, ignoring case.
        StrCpy $R2 $R3 1
        ${If} $R2 == "$\""
          StrCpy $R3 $R3 "" 1
        ${EndIf}
        StrCpy $R2 ""
        !insertmacro rmRemoveRunEntry "Remember Me.exe"
        !insertmacro rmRemoveRunEntry "Waqt.exe"
        ${If} $R2 == "remove"
          DetailPrint "Removing start with Windows: $R1"
          DeleteRegValue HKCU "${RM_RUN_KEY}" $R1
          DeleteRegValue HKCU "${RM_STARTUP_APPROVED_KEY}" $R1
          ; The next value now has this index.
        ${Else}
          IntOp $R0 $R0 + 1
        ${EndIf}
      ${Loop}
      Pop $R6
      Pop $R5
      Pop $R4
      Pop $R3
      Pop $R2
      Pop $R1
      Pop $R0
    ${EndIf}
  !macroend
!endif
