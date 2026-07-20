$ErrorActionPreference = 'Stop'
$GradleVersion = '8.14.3'
$Cache = Join-Path $PSScriptRoot '.gradle-bin'
$Zip = Join-Path $Cache "gradle-$GradleVersion-bin.zip"
$Home = Join-Path $Cache "gradle-$GradleVersion"

New-Item -ItemType Directory -Force -Path $Cache | Out-Null
if (-not (Test-Path (Join-Path $Home 'bin\gradle.bat'))) {
    if (-not (Test-Path $Zip)) {
        Invoke-WebRequest -UseBasicParsing "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip" -OutFile $Zip
    }
    Expand-Archive -Force $Zip $Cache
}
& (Join-Path $Home 'bin\gradle.bat') clean build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Build completata: build\libs\stellar-core-1.7.0.jar"
