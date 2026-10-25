$ErrorActionPreference = 'Stop'

# Runs the app's own uninstaller silently. Data in %APPDATA%\Remember Me is kept.
[array]$keys = Get-UninstallRegistryKey -SoftwareName 'Remember Me'
if ($keys.Count -eq 1) {
  $packageArgs = @{
    packageName    = $env:ChocolateyPackageName
    fileType       = 'exe'
    file           = $keys[0].UninstallString -replace '^"([^"]+)".*$', '$1'
    silentArgs     = '/currentuser /S'
    validExitCodes = @(0)
  }
  Uninstall-ChocolateyPackage @packageArgs
} elseif ($keys.Count -eq 0) {
  Write-Warning "$env:ChocolateyPackageName has already been uninstalled by other means."
} else {
  Write-Warning "$($keys.Count) matches found; to avoid removing the wrong program, nothing was uninstalled."
  $keys | ForEach-Object { Write-Warning "- $($_.DisplayName)" }
}
