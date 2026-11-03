; Boks Music keeps everything in its install folder, the same layout as a development run: app-data (library,
; songs, work files, caches, logs) and engine-packages (engines and models). Nothing goes to AppData.
; electron-builder's uninstaller removes the whole install folder, also during an update, so the program
; files are removed here instead and both data folders stay unless the user chose to delete them.

!macro customInstall
  CreateDirectory "$INSTDIR\app-data"
  CreateDirectory "$INSTDIR\engine-packages"
  ; An all-users install lives under Program Files: users get write access to the two data folders only.
  ${If} $installMode == "all"
    nsExec::Exec '"$SYSDIR\icacls.exe" "$INSTDIR\app-data" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
    Pop $0
    nsExec::Exec '"$SYSDIR\icacls.exe" "$INSTDIR\engine-packages" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
    Pop $0
  ${EndIf}
  ; 0.1.0-beta.1 kept its data in AppData; this version never reads it.
  ${IfNot} ${Silent}
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}
    ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "이전 버전의 데이터(만든 곡, 엔진과 모델)가 남아 있습니다.$\r$\n$APPDATA\${PRODUCT_NAME}$\r$\n$\r$\n이 버전은 모든 데이터를 설치 폴더 안에 저장하므로 이 폴더를 쓰지 않습니다. 삭제할까요?$\r$\n[예] 삭제합니다. 되돌릴 수 없습니다.$\r$\n[아니요] 그대로 둡니다." IDNO boksKeepOldData
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      boksKeepOldData:
    ${EndIf}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  Var /GLOBAL boksDeleteData
  StrCpy $boksDeleteData "0"
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "만든 곡과 프로젝트, 설치한 엔진과 모델도 함께 삭제할까요?$\r$\n$\r$\n[예] 모두 삭제합니다. 되돌릴 수 없습니다.$\r$\n[아니요] 그대로 남겨 두고, 다시 설치하면 이어서 쓸 수 있습니다." IDNO boksKeepData
    StrCpy $boksDeleteData "1"
    boksKeepData:
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; Every program file and folder except the two data folders.
  SetOutPath $TEMP
  FindFirst $R0 $R1 "$INSTDIR\*.*"
  boksRemoveLoop:
    StrCmp $R1 "" boksRemoveDone
    StrCmp $R1 "." boksRemoveNext
    StrCmp $R1 ".." boksRemoveNext
    StrCmp $R1 "app-data" boksRemoveNext
    StrCmp $R1 "engine-packages" boksRemoveNext
    IfFileExists "$INSTDIR\$R1\*.*" 0 boksRemoveFile
      RMDir /r "$INSTDIR\$R1"
      Goto boksRemoveNext
    boksRemoveFile:
      Delete "$INSTDIR\$R1"
  boksRemoveNext:
    FindNext $R0 $R1
    Goto boksRemoveLoop
  boksRemoveDone:
  FindClose $R0

  ${If} $boksDeleteData == "1"
    RMDir /r "$INSTDIR\app-data"
    RMDir /r "$INSTDIR\engine-packages"
    ; Data 0.1.0-beta.1 left in the user's AppData goes too.
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
  ; The install folder itself goes only when nothing is left in it.
  ${IfNot} ${isUpdated}
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
