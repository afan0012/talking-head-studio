; Build with: ISCC.exe scripts\installer.iss
#define AppName "afan Talking Head Agent"
#define AppVersion "0.1.0-test"
#define AppExeName "afan Talking Head Agent.exe"

[Setup]
AppId={{1B640B58-48C7-4D06-AF52-DAA9D82BC8BF}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=..\dist-windows\installer
OutputBaseFilename=afan-Talking-Head-Agent-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Files]
Source: "..\dist-windows\afan Talking Head Agent\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："

[Run]
Filename: "{app}\{#AppExeName}"; Description: "安装完成后启动 {#AppName}"; Flags: nowait postinstall skipifsilent
