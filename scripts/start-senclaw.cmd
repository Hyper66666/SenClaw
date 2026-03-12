@echo off
chcp 65001 >nul
corepack pnpm exec tsx scripts/local-runtime.ts start
