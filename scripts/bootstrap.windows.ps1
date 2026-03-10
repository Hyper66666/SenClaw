param(
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

function Assert-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Hint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$Name'. $Hint"
  }
}

Assert-Command -Name node -Hint "Install Node.js 22.x before running bootstrap."
Assert-Command -Name corepack -Hint "Corepack ships with supported Node.js releases."
Assert-Command -Name rustup -Hint "Install the Rust stable toolchain before running bootstrap."

corepack enable
corepack prepare pnpm@10.0.0 --activate
corepack pnpm install

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

if (-not $SkipVerify) {
  corepack pnpm run verify
}