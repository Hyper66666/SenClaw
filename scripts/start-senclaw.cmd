@echo off
setlocal
chcp 65001 >nul
if not exist packages\config\dist\index.js call corepack pnpm run build
if errorlevel 1 exit /b %ERRORLEVEL%
if not exist packages\storage\dist\index.js call corepack pnpm run build
if errorlevel 1 exit /b %ERRORLEVEL%
if not exist scripts\local-runtime.js call corepack pnpm exec tsc --module ES2022 --moduleResolution node --target ES2022 --skipLibCheck --esModuleInterop --allowSyntheticDefaultImports --declaration false --sourceMap false scripts/local-runtime.ts
if errorlevel 1 exit /b %ERRORLEVEL%
node scripts\local-runtime.js start
