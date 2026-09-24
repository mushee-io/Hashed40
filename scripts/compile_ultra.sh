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

compile_contract() {
  local contract_name="$1"
  local source_file="$2"

  echo "==> Compiling $contract_name"
  cd "$CONTRACT_DIR"
  cdt-cpp     -abigen     -I "$CONTRACT_DIR/include"     -contract "$contract_name"     -o "$BUILD_DIR/$contract_name.wasm"     "$source_file"

  if [[ -f "$CONTRACT_DIR/$contract_name.abi" && ! -f "$BUILD_DIR/$contract_name.abi" ]]; then
    mv "$CONTRACT_DIR/$contract_name.abi" "$BUILD_DIR/$contract_name.abi"
  fi

  test -s "$BUILD_DIR/$contract_name.wasm"
  test -s "$BUILD_DIR/$contract_name.abi"
}

compile_contract hashedlaunch "$CONTRACT_DIR/src/hashedlaunch.cpp"
compile_contract hashedpad "$CONTRACT_DIR/src/hashedpad.cpp"

echo "Built:"
ls -lh   "$BUILD_DIR/hashedlaunch.wasm" "$BUILD_DIR/hashedlaunch.abi"   "$BUILD_DIR/hashedpad.wasm" "$BUILD_DIR/hashedpad.abi"
