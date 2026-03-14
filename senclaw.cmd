@echo off
setlocal
chcp 65001 >nul
set "SENCLAW_ROOT=%~dp0"
pushd "%SENCLAW_ROOT%"
if not exist "%SENCLAW_ROOT%packages\cli\dist\index.js" call corepack pnpm run build
if errorlevel 1 goto fail
if not exist "%SENCLAW_ROOT%packages\config\dist\index.js" call corepack pnpm run build
if errorlevel 1 goto fail
if not exist "%SENCLAW_ROOT%packages\storage\dist\index.js" call corepack pnpm run build
if errorlevel 1 goto fail
if not exist "%SENCLAW_ROOT%scripts\local-runtime.js" call corepack pnpm exec tsc --module ES2022 --moduleResolution node --target ES2022 --skipLibCheck --esModuleInterop --allowSyntheticDefaultImports --declaration false --sourceMap false scripts/local-runtime.ts
if errorlevel 1 goto fail
node "%SENCLAW_ROOT%packages\cli\dist\index.js" %*
set "SENCLAW_EXIT=%ERRORLEVEL%"
popd
exit /b %SENCLAW_EXIT%

:fail
set "SENCLAW_EXIT=%ERRORLEVEL%"
popd
exit /b %SENCLAW_EXIT%
