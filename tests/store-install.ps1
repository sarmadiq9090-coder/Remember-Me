# Checks the Microsoft Store package on a real Windows machine (.github/workflows/store.yml), the way
# InstaFind's packaging/msix/test-install.ps1 does: signs a COPY of the .appx with a throwaway self-signed
# certificate whose subject is the manifest's Publisher (the Store signs the real package), installs it,
# leaves sample data where the installer version keeps its data, starts the app as the Start menu does and
# reads its log: Store mode, data copied into the package's own folder, saved language kept, still running.
# Afterwards it stops the app and removes the package, the certificate and the sample data.
# Run with Windows PowerShell 5.1 (the Appx module is unreliable in pwsh 7).
param(
    [Parameter(Mandatory)][string]$Package,
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Publisher
)
$ErrorActionPreference = 'Stop'
$failed = $false
function Fail($msg) { Write-Host "::error::$msg"; $script:failed = $true }

$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signtool = Get-ChildItem $kits -Directory -Filter '10.*' |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $signtool) { throw "signtool.exe not found under $kits" }

$tmp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$signed = Join-Path $tmp 'remember-me-test-signed.appx'
Copy-Item $Package $signed -Force

# The certificate subject must equal the manifest's Publisher.
$cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher -KeyUsage DigitalSignature `
    -FriendlyName 'Remember Me store.yml test' -CertStoreLocation 'Cert:\CurrentUser\My' `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
$cer = Join-Path $tmp 'remember-me-test.cer'
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
& $signtool sign /fd SHA256 /sha1 $cert.Thumbprint /s My $signed
if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }

# Sample data of an installer version on this PC: the first Store start copies it into the package folder
# (src/platform/data-folder.js) and keeps its language. The runner has no Remember Me of its own.
$installerData = Join-Path $env:APPDATA 'Remember Me'
if (Test-Path $installerData) { throw "$installerData already exists; this test needs a PC without the installer version" }
New-Item -ItemType Directory -Path $installerData | Out-Null
$now = (Get-Date).ToUniversalTime().ToString('o')
$sample = @{ version = 1; tasks = @(@{ id = 'store-ci-task'; title = 'Store CI import check'; body = ''; priority = 'normal'; category = 'personal';
    dueAt = $null; scheduleAt = $null; repeat = 'none'; snoozedAt = $null; completedAt = $null; attachments = @(); createdAt = $now; updatedAt = $now });
    notes = @(); attachments = @(); settings = @{ language = 'ar'; autoUpdate = $false } }
$sampleFile = Join-Path $installerData 'data.json'
[IO.File]::WriteAllText($sampleFile, ($sample | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
$sampleHash = (Get-FileHash $sampleFile).Hash

try {
    Add-AppxPackage -Path $signed
    $pkg = Get-AppxPackage -Name $Name
    if (-not $pkg) { throw "$Name is not installed after Add-AppxPackage" }
    Write-Host "installed $($pkg.PackageFullName)"
    $pfn = $pkg.PackageFamilyName
    $dataFolder = Join-Path $env:LOCALAPPDATA "Packages\$pfn\LocalState\Remember Me"
    $log = Join-Path $dataFolder 'logs\remember-me.log'

    function Wait-Start([int]$Seconds) {
        for ($i = 0; $i -lt $Seconds; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Path $log) {
                $line = Get-Content $log | Where-Object { $_ -match '"event":"start"' } | Select-Object -Last 1
                if ($line) { return $line }
            }
        }
        return $null
    }
    # Started as the Start menu does; if that shows no sign of life, through explorer.exe, which also
    # starts it inside the package, to tell a launch problem from a program problem.
    $started = Get-Date
    Write-Host "starting shell:AppsFolder\$pfn!RememberMe"
    Start-Process "shell:AppsFolder\$pfn!RememberMe"
    $line = Wait-Start 60
    if (-not $line) {
        Write-Host "::warning::no start line 60 s after the Start-menu style launch; trying explorer.exe"
        Start-Process explorer.exe "shell:AppsFolder\$pfn!RememberMe"
        $line = Wait-Start 60
    }
    if (-not $line) {
        Fail "the packaged app did not log its start within 2 minutes"
        Write-Host '--- diagnostics ---'
        Get-Process | Where-Object { $_.Path -like '*WindowsApps*' } | Format-Table Id, Name, Path -AutoSize | Out-String | Write-Host
        $pkgData = Join-Path $env:LOCALAPPDATA "Packages\$pfn"
        Write-Host "files under $pkgData`:"
        Get-ChildItem $pkgData -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 50 | ForEach-Object { "  $($_.FullName) ($($_.Length))" } | Write-Host
        foreach ($logName in @('Application', 'Microsoft-Windows-AppModel-Runtime/Admin', 'Microsoft-Windows-AppXDeploymentServer/Operational', 'Microsoft-Windows-TWinUI/Operational')) {
            $events = Get-WinEvent -FilterHashtable @{ LogName = $logName; StartTime = $started.AddSeconds(-10) } -ErrorAction SilentlyContinue |
                Where-Object { $_.Level -le 3 -or $_.Message -match 'Remember' } | Select-Object -First 15
            foreach ($e in $events) {
                $msg = "$($e.Message)" -replace '\s+', ' '
                Write-Host ("[{0}] {1} {2} {3}: {4}" -f $logName, $e.TimeCreated.ToString('HH:mm:ss'), $e.ProviderName, $e.Id, $msg.Substring(0, [Math]::Min(400, $msg.Length)))
            }
        }
    } else {
        Write-Host "log: $line"
        $start = $line | ConvertFrom-Json
        if ($start.windowsStore -ne $true) { Fail 'the app did not start in Store mode (process.windowsStore)' }
        if ($start.packaged -ne $true) { Fail 'the app does not report a packaged build' }
        if ($start.dataFolder -ne 'package') { Fail "the data folder is '$($start.dataFolder)', expected the package's own folder" }
        if ($start.tasks -ne 1) { Fail "the app loaded $($start.tasks) tasks, expected the 1 sample task" }
        $migrated = Get-Content $log | Where-Object { $_ -match '"event":"data-folder-migrated"' } | Select-Object -Last 1
        if ($migrated -notmatch '"result":"imported"') { Fail "the installer version's data was not imported: $migrated" }
        $copied = Join-Path $dataFolder 'data.json'
        if (-not (Test-Path $copied)) { Fail "no data.json in $dataFolder" }
        else {
            $data = Get-Content $copied -Raw -Encoding UTF8 | ConvertFrom-Json
            if (-not ($data.tasks | Where-Object { $_.id -eq 'store-ci-task' })) { Fail 'the sample task is missing from the copied data' }
            if ($data.settings.language -ne 'ar') { Fail "the saved language became '$($data.settings.language)'" }
        }
        if ((Get-FileHash $sampleFile).Hash -ne $sampleHash) { Fail "the installer version's data.json was changed" }
    }
    Start-Sleep -Seconds 5
    $proc = Get-Process 'Remember Me' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*WindowsApps*' }
    if (-not $proc) { Fail 'the packaged app exited right after starting' }
    else { Write-Host "running from $(@($proc)[0].Path)" }
    if (Test-Path $log) { Write-Host '--- remember-me.log ---'; Get-Content $log -Tail 20 | Write-Host }
} finally {
    Get-Process 'Remember Me' -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    Get-AppxPackage -Name $Name | Remove-AppxPackage -ErrorAction SilentlyContinue
    Get-ChildItem 'Cert:\LocalMachine\TrustedPeople' | Where-Object Thumbprint -eq $cert.Thumbprint | Remove-Item
    Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)"
    Remove-Item $installerData -Recurse -Force -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
Write-Host 'Store package: installed, started in Store mode, imported the installer data, removed.'
