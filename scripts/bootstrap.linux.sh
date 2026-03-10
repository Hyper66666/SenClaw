#!/usr/bin/env bash
set -euo pipefail

assert_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command '$1'. $2" >&2
    exit 1
  fi
}

assert_command node "Install Node.js 22.x before running bootstrap."
assert_command corepack "Corepack ships with supported Node.js releases."
assert_command rustup "Install the Rust stable toolchain before running bootstrap."

corepack enable
corepack prepare pnpm@10.0.0 --activate
corepack pnpm install

if [ ! -f .env ]; then
  cp .env.example .env
fi

if [ "${1:-}" != "--skip-verify" ]; then
  corepack pnpm run verify
fi