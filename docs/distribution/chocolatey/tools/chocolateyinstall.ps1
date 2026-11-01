$ErrorActionPreference = 'Stop'

# Downloads the release installer and runs it silently. It installs for the current user.
$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v1.6.1/Remember-Me-Setup-1.6.1-x64.exe'
  checksum64     = '8cd0a51d5da3e9667acfab6f9f1706c6409c278610557164fc1763d8090fdfa4'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
  softwareName   = 'Remember Me'
}
Install-ChocolateyPackage @packageArgs
