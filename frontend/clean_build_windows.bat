@echo off
setlocal

:: Find Visual Studio installation using vswhere
for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath 2^>nul`) do set "VS_PATH=%%i"

if not defined VS_PATH (
    echo ERROR: Could not find Visual Studio installation.
    echo Please install Visual Studio with the "Desktop development with C++" workload.
    exit /b 1
)

:: Set up MSVC developer environment
echo Setting up MSVC developer environment...
call "%VS_PATH%\VC\Auxiliary\Build\vcvarsall.bat" x64
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to initialize MSVC environment.
    exit /b 1
)

:: Use Ninja generator (CMake may not support the latest VS generator yet)
set CMAKE_GENERATOR=Ninja

:: Ensure MongoDB URI is set for update checker (compile-time embed)
if not defined MONGODB_URI (
    echo ERROR: MONGODB_URI environment variable is not set.
    echo Set it before building: set MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
    exit /b 1
)

:: Build llama-helper sidecar binary
echo.
echo Building llama-helper...
cd /d "%~dp0.."
cargo build --release -p llama-helper
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: llama-helper build failed.
    exit /b 1
)
copy /Y target\release\llama-helper.exe frontend\src-tauri\binaries\llama-helper-x86_64-pc-windows-msvc.exe >nul

:: Build the Tauri app
cd /d "%~dp0"

echo.
echo Cleaning npm dependencies...
rd /s /q node_modules 2>nul
del /f /q package-lock.json 2>nul

echo Installing npm dependencies...
pnpm install

echo.
echo Building the project...
pnpm run tauri:build
