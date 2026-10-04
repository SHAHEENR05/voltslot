@REM ----------------------------------------------------------------------------
@REM VoltSlot Maven wrapper for Windows. Downloads Apache Maven once into
@REM %MAVEN_USER_HOME% (default %USERPROFILE%\.m2)\wrapper\dists and runs it.
@REM Set MVNW_USE_SYSTEM=1 to use a Maven that is already on the PATH.
@REM ----------------------------------------------------------------------------
@echo off
setlocal enabledelayedexpansion

set "BASE_DIR=%~dp0"
set "URL=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.tar.gz"
set "NAME=apache-maven-3.9.9"
set "ZIPURL=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip"

if "%MVNW_USE_SYSTEM%"=="1" (
  where mvn.cmd >nul 2>nul
  if not errorlevel 1 (
    call mvn.cmd %*
    exit /b !errorlevel!
  )
)

if defined MAVEN_USER_HOME (set "ROOT=%MAVEN_USER_HOME%") else (set "ROOT=%USERPROFILE%\.m2")
set "DIST=%ROOT%\wrapper\dists\%NAME%"
set "MVN_CMD=%DIST%\%NAME%\bin\mvn.cmd"

if not exist "%MVN_CMD%" (
  echo [mvnw] Downloading %ZIPURL%
  if not exist "%DIST%" mkdir "%DIST%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%ZIPURL%' -OutFile '%DIST%\maven.zip'; Expand-Archive -Force -Path '%DIST%\maven.zip' -DestinationPath '%DIST%'; Remove-Item '%DIST%\maven.zip'"
  if errorlevel 1 (
    echo [mvnw] ERROR: could not download or unpack Maven
    exit /b 1
  )
)

call "%MVN_CMD%" %*
exit /b %errorlevel%
