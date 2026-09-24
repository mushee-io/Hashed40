#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contract"
BUILD_DIR="$CONTRACT_DIR/build"

command -v cdt-cpp >/dev/null 2>&1 || {
  echo "ERROR: cdt-cpp was not found."
  echo "Run this script inside Ultra's official 3rdparty-devtools Docker container."
  exit 1
}

command -v ultratest >/dev/null 2>&1 || {
  echo "ERROR: ultratest was not found."
  echo "Run this script inside Ultra's official 3rdparty-devtools Docker container."
  exit 1
}

echo "==> Compiling hashedlaunch"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cd "$CONTRACT_DIR"
cdt-cpp   -abigen   -I "$CONTRACT_DIR/include"   -contract hashedlaunch   -o "$BUILD_DIR/hashedlaunch.wasm"   "$CONTRACT_DIR/src/hashedlaunch.cpp"

# Depending on CDT packaging, the ABI may be emitted beside the source or output.
if [[ -f "$CONTRACT_DIR/hashedlaunch.abi" && ! -f "$BUILD_DIR/hashedlaunch.abi" ]]; then
  mv "$CONTRACT_DIR/hashedlaunch.abi" "$BUILD_DIR/hashedlaunch.abi"
fi

test -s "$BUILD_DIR/hashedlaunch.wasm" || {
  echo "ERROR: WASM was not generated."
  exit 1
}

test -s "$BUILD_DIR/hashedlaunch.abi" || {
  echo "ERROR: ABI was not generated."
  exit 1
}

echo "==> Contract artifacts"
ls -lh "$BUILD_DIR/hashedlaunch.wasm" "$BUILD_DIR/hashedlaunch.abi"

echo "==> Running Ultra integration tests"
cd "$ROOT_DIR"

# UltraTest asks where to store temporary files on first use.
# In CI/non-interactive shells accept its documented default by sending Enter.
if [[ -t 0 ]]; then
  ultratest -t "$ROOT_DIR/tests/launcher.ultra_test.js"
else
  printf '\n' | ultratest -t "$ROOT_DIR/tests/launcher.ultra_test.js"
fi

echo
echo "PASS: create -> mint -> transfer -> burn -> duplicate-symbol protection"
