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
cdt-cpp   -abigen   -I "$CONTRACT_DIR/include"   -contract hashedpad   -o "$BUILD_DIR/hashedpad.wasm"   "$CONTRACT_DIR/src/hashedpad.cpp"

if [[ -f "$CONTRACT_DIR/hashedpad.abi" && ! -f "$BUILD_DIR/hashedpad.abi" ]]; then
  mv "$CONTRACT_DIR/hashedpad.abi" "$BUILD_DIR/hashedpad.abi"
fi

test -s "$BUILD_DIR/hashedpad.wasm"
test -s "$BUILD_DIR/hashedpad.abi"

echo "Built Hashed40 meme launchpad:"
ls -lh "$BUILD_DIR/hashedpad.wasm" "$BUILD_DIR/hashedpad.abi"
