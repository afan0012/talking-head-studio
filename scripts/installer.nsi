Unicode True
RequestExecutionLevel user
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!define APP_NAME "afan Talking Head Agent"
!define APP_DIR "afan Talking Head Agent"
!ifndef OUTPUT_FILE
!define OUTPUT_FILE "afan-Talking-Head-Agent-v0.1.0-Setup.exe"
!endif

Name "${APP_NAME}"
OutFile "..\dist-windows\installer\${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_DIR}"
ShowInstDetails show
ShowUnInstDetails show
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to afan Talking Head Agent"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install afan Talking Head Agent on your computer.$\r$\n$\r$\nClick Next to continue, or Cancel to exit."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch afan Talking Head Agent after installation"
!define MUI_FINISHPAGE_RUN_FUNCTION "LaunchApp"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom InstallOptionsPage InstallOptionsPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Var DesktopShortcutCheckbox
Var StartupCheckbox
Var CreateDesktopShortcut
Var EnableStartup

Function .onInit
  SetShellVarContext current
  StrCpy $CreateDesktopShortcut ${BST_CHECKED}
  StrCpy $EnableStartup ${BST_UNCHECKED}
FunctionEnd

Function InstallOptionsPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 22u "安装选项"
  Pop $0
  ${NSD_CreateCheckbox} 0 30u 100% 12u "在桌面创建快捷方式"
  Pop $DesktopShortcutCheckbox
  ${NSD_SetState} $DesktopShortcutCheckbox $CreateDesktopShortcut
  ${NSD_CreateCheckbox} 0 54u 100% 12u "开机后自动启动（会在浏览器中打开本应用）"
  Pop $StartupCheckbox
  ${NSD_SetState} $StartupCheckbox $EnableStartup
  nsDialogs::Show
FunctionEnd

Function InstallOptionsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcut
  ${NSD_GetState} $StartupCheckbox $EnableStartup
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\dist-windows\afan Talking Head Agent\*.*"
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\afan Talking Head Agent.exe"
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\afan Talking Head Agent.exe"
  ${EndIf}
  ${If} $EnableStartup == ${BST_CHECKED}
    CreateShortCut "$SMSTARTUP\${APP_NAME}.lnk" "$INSTDIR\afan Talking Head Agent.exe"
  ${EndIf}
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ; 注册到「设置 → 应用」，让系统能列出并提供卸载入口
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "Publisher" "afan0012"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "DisplayIcon" "$INSTDIR\afan Talking Head Agent.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "NoRepair" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent" "EstimatedSize" 340417
SectionEnd

Function LaunchApp
  ExecShell "open" "$INSTDIR\afan Talking Head Agent.exe"
FunctionEnd

Section "Uninstall"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\afan Talking Head Agent"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\${APP_NAME}.lnk"
  RMDir /r "$INSTDIR"
SectionEnd
