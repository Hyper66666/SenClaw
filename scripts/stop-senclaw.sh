#!/usr/bin/env bash
set -euo pipefail
if [ ! -f packages/config/dist/index.js ] || [ ! -f packages/storage/dist/index.js ]; then
  corepack pnpm run build
fi
if [ ! -f scripts/local-runtime.js ]; then
  corepack pnpm exec tsc --module ES2022 --moduleResolution node --target ES2022 --skipLibCheck --esModuleInterop --allowSyntheticDefaultImports --declaration false --sourceMap false scripts/local-runtime.ts
fi
node scripts/local-runtime.js stop
