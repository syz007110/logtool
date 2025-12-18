@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1

echo ========================================
echo Log Monitor Client - Build Tool
echo ========================================
echo.

echo Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo Node.js installed
echo.

echo [1/4] Checking dependencies...
if not exist node_modules (
    echo Installing dependencies, this may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        echo Please check network connection or run: npm install
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed
)
echo.

echo [2/4] Choosing build type...
echo.
echo Please select build type:
echo   1. Portable (default) - Single .exe file, no installation needed
echo   2. Installer (NSIS) - Full installer with shortcuts
echo.
set /p choice="Enter your choice [1-2] (default is 1): "
if "%choice%"=="" set choice=1
echo.
if "%choice%"=="1" (
    echo Building portable version...
    set BUILD_TYPE=portable
) else if "%choice%"=="2" (
    echo Building installer version...
    set BUILD_TYPE=installer
) else (
    echo Invalid choice, using default (portable)
    set BUILD_TYPE=portable
)
echo.

echo [3/4] Cleaning old build files...
if exist release (
    echo Deleting release directory...
    rd /s /q release 2>nul
)
if exist dist (
    echo Deleting dist directory...
    rd /s /q dist 2>nul
)
echo.

echo [4/4] Starting build...
echo This may take several minutes, please wait...
echo.
set CSC_IDENTITY_AUTO_DISCOVERY=false
if "%BUILD_TYPE%"=="installer" (
    call npm run build:installer
) else (
    call npm run build
)
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed! Please check error messages above.
    pause
    exit /b 1
)
echo.

if exist release (
    echo ========================================
    echo Build completed successfully!
    echo ========================================
    echo.
    echo Build location: %CD%\release\
    echo.
    dir /b release\*.exe 2>nul
    echo.
    echo Press any key to open release folder...
    pause >nul
    explorer release
) else (
    echo ========================================
    echo Build failed!
    echo ========================================
    echo Release directory not found, please check error messages above.
    pause
    exit /b 1
)
