#!/usr/bin/env bash
set -euo pipefail

CONTRACT_ACCOUNT="${CONTRACT_ACCOUNT:-hashedlaunch}"
CREATOR_ACCOUNT="${CREATOR_ACCOUNT:-hashcreator}"
TOKEN_SYMBOL="${TOKEN_SYMBOL:-HASH}"

printf '\n[1/5] Contract account: %s\n' "$CONTRACT_ACCOUNT"
printf '[2/5] Creator account: %s\n' "$CREATOR_ACCOUNT"
printf '[3/5] Launching test token...\n'

cleos push action "$CONTRACT_ACCOUNT" launch \
  "[\"$CREATOR_ACCOUNT\",\"1000000.00000000 $TOKEN_SYMBOL\",\"500000.00000000 $TOKEN_SYMBOL\",\"Hashed Test Token\",\"https://example.com/hash.json\"]" \
  -p "$CREATOR_ACCOUNT@active"

printf '\n[4/5] Currency stats\n'
cleos get currency stats "$CONTRACT_ACCOUNT" "$TOKEN_SYMBOL" || true

printf '\n[5/5] Creator balance\n'
cleos get currency balance "$CONTRACT_ACCOUNT" "$CREATOR_ACCOUNT" "$TOKEN_SYMBOL" || true
