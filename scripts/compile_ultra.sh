#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contract"
BUILD_DIR="$CONTRACT_DIR/build"

command -v cdt-cpp >/dev/null 2>&1 || {
  echo "ERROR: cdt-cpp was not found. Use Ultra's official developer Docker image."
  exit 1
}

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cd "$CONTRACT_DIR"
cdt-cpp   -abigen   -I "$CONTRACT_DIR/include"   -contract hashedlaunch   -o "$BUILD_DIR/hashedlaunch.wasm"   "$CONTRACT_DIR/src/hashedlaunch.cpp"

if [[ -f "$CONTRACT_DIR/hashedlaunch.abi" && ! -f "$BUILD_DIR/hashedlaunch.abi" ]]; then
  mv "$CONTRACT_DIR/hashedlaunch.abi" "$BUILD_DIR/hashedlaunch.abi"
fi

test -s "$BUILD_DIR/hashedlaunch.wasm"
test -s "$BUILD_DIR/hashedlaunch.abi"

echo "Built:"
ls -lh "$BUILD_DIR/hashedlaunch.wasm" "$BUILD_DIR/hashedlaunch.abi"
