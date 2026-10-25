$ErrorActionPreference = 'Stop'

# Downloads the release installer and runs it silently. It installs for the current user.
$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v1.5.0/Remember-Me-Setup-1.5.0-x64.exe'
  checksum64     = '5ee1e02d97e72e5e4659231eaef1c4e1710f4ec5347bc636a0afa40cd2cb9d1c'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
  softwareName   = 'Remember Me'
}
Install-ChocolateyPackage @packageArgs
