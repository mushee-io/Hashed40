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

compile_contract() {
  local contract_name="$1"
  local source_file="$2"

  echo "==> Compiling $contract_name"
  cd "$CONTRACT_DIR"

  cdt-cpp     -abigen     -I "$CONTRACT_DIR/include"     -contract "$contract_name"     -o "$BUILD_DIR/$contract_name.wasm"     "$source_file"

  if [[ -f "$CONTRACT_DIR/$contract_name.abi" && ! -f "$BUILD_DIR/$contract_name.abi" ]]; then
    mv "$CONTRACT_DIR/$contract_name.abi" "$BUILD_DIR/$contract_name.abi"
  fi

  test -s "$BUILD_DIR/$contract_name.wasm" || {
    echo "ERROR: $contract_name WASM was not generated."
    exit 1
  }

  test -s "$BUILD_DIR/$contract_name.abi" || {
    echo "ERROR: $contract_name ABI was not generated."
    exit 1
  }
}

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

compile_contract hashedlaunch "$CONTRACT_DIR/src/hashedlaunch.cpp"
compile_contract hashedpad "$CONTRACT_DIR/src/hashedpad.cpp"

echo "==> Contract artifacts"
ls -lh   "$BUILD_DIR/hashedlaunch.wasm" "$BUILD_DIR/hashedlaunch.abi"   "$BUILD_DIR/hashedpad.wasm" "$BUILD_DIR/hashedpad.abi"

run_ultratest() {
  local test_file="$1"

  echo "==> Running Ultra integration test: $test_file"
  cd "$ROOT_DIR"

  if [[ -t 0 ]]; then
    ultratest -t "$ROOT_DIR/tests/$test_file"
  else
    printf '\n' | ultratest -t "$ROOT_DIR/tests/$test_file"
  fi
}

run_ultratest launcher.ultra_test.js
run_ultratest launchpad.ultra_test.js

echo
echo "PASS: Token Launcher + Meme Launchpad bonding curve integration suite"