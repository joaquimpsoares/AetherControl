#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/exports"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/aethercontrol-scaffold-$STAMP.tar.gz"

mkdir -p "$OUT_DIR"

tar -czf "$OUT_FILE" \
  -C "$ROOT_DIR" \
  AETHERCONTROL_README.md \
  AETHERCONTROL_START_HERE.md \
  aethercontrol.package.json \
  aethercontrol.tsconfig.base.json \
  apps/aether-core \
  apps/aether-console \
  workers/aether-flow \
  packages/aether-contracts \
  docs/aethercontrol/v1-architecture.md

echo "Export created: $OUT_FILE"
