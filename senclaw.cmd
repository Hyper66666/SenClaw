@echo off
setlocal
chcp 65001 >nul
corepack pnpm exec tsx packages/cli/src/index.ts %*
