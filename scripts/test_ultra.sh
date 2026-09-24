#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contract"
BUILD_DIR="$CONTRACT_DIR/build"
FIXTURE_DIR="$ROOT_DIR/tests/fixtures/hashedlaunch"

command -v cdt-cpp >/dev/null 2>&1 || {
  echo "ERROR: cdt-cpp was not found."
  exit 1
}

command -v ultratest >/dev/null 2>&1 || {
  echo "ERROR: ultratest was not found."
  exit 1
}

bash "$ROOT_DIR/scripts/compile_ultra.sh"

echo "==> Compiling test-only token fixture"
cd "$FIXTURE_DIR"
cdt-cpp   -abigen   -I "$FIXTURE_DIR/include"   -contract hashedlaunch   -o "$BUILD_DIR/hashedlaunch.wasm"   "$FIXTURE_DIR/hashedlaunch.cpp"

if [[ -f "$FIXTURE_DIR/hashedlaunch.abi" && ! -f "$BUILD_DIR/hashedlaunch.abi" ]]; then
  mv "$FIXTURE_DIR/hashedlaunch.abi" "$BUILD_DIR/hashedlaunch.abi"
fi

test -s "$BUILD_DIR/hashedlaunch.wasm"
test -s "$BUILD_DIR/hashedlaunch.abi"

echo "==> Running Hashed40 meme launchpad integration suite"
cd "$ROOT_DIR"

if [[ -t 0 ]]; then
  ultratest -t "$ROOT_DIR/tests/launchpad.ultra_test.js"
else
  printf '\n' | ultratest -t "$ROOT_DIR/tests/launchpad.ultra_test.js"
fi

echo
echo "PASS: Hashed40 meme launchpad integration suite"
