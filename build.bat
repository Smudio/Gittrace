@echo off
echo.
echo  ============================================
echo   LiveGit - Build Desktop App
echo  ============================================
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)

echo Cleaning...
if exist dist rmdir /s /q dist

echo.
echo Building Electron app...
call npx electron-builder --win dir
if errorlevel 1 (
    echo.
    echo Build had signing errors but exe was created.
)

if exist dist\win-unpacked\Gittrace.exe (
    if exist dist\Gittrace rmdir /s /q dist\Gittrace
    rename dist\win-unpacked Gittrace
    echo.
    echo  ============================================
    echo   Fertig! 
    echo.
    echo   App: dist\Gittrace\Gittrace.exe
    echo  ============================================
) else (
    echo ERROR: exe not found
)

echo.
pause
