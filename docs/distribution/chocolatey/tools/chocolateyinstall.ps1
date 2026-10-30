$ErrorActionPreference = 'Stop'

# Downloads the release installer and runs it silently. It installs for the current user.
$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/sarmadiq9090-coder/Remember-Me/releases/download/v1.6.0/Remember-Me-Setup-1.6.0-x64.exe'
  checksum64     = 'e65b42e66cf8676de287cd675b28531b58389b3c8649a7588c188fe18d56507f'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
  softwareName   = 'Remember Me'
}
Install-ChocolateyPackage @packageArgs
