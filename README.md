# Hashed — Ultra Native Token Launcher MVP

A native Ultra / Antelope fungible-token launcher designed for **Ultra Testnet** and Ultra's local `ultratest` environment.

## What is included

- `contract/` — C++ WASM smart contract implementing a permissionless multi-token launcher.
- `web/` — Vite + TypeScript launcher UI using the official `@ultraos/wallet-sdk`.
- `scripts/local_test.sh` — one-click CLI smoke test after local deployment.

## MVP contract actions

| Action | Purpose | Required auth |
|---|---|---|
| `launch` | Create token + issue initial supply atomically | issuer |
| `create` | Create token without minting | issuer |
| `issue` | Mint additional supply up to max | token issuer |
| `retire` | Burn issuer-held supply | token issuer |
| `transfer` | Standard fungible-token transfer | sender |
| `open` / `close` | Manage zero-balance rows | RAM payer / owner |
| `setmeta` | Update name / metadata URI | token issuer |

Each token is identified by **contract account + symbol**, exactly like Antelope-style fungible tokens. The issuer remains in control of minting; the launcher contract does not have an admin mint path.

## Important architecture note

Ultra's deployed `eosio.token::create` requires authorization from the token contract itself. This launcher therefore deploys a **separate eosio.token-style contract** under your own account and changes creation authorization so the token issuer can create tokens through the launcher. It does not modify Ultra's system `eosio.token` contract.

## 1. Run Ultra locally

Ultra's official developer Docker image includes `ultratest`, `cleos` and CDT tooling. Inside that environment start a local chain:

```bash
ultratest -D -n -s
```

Verify:

```bash
cleos get info
```

## 2. Create deployment and creator accounts

Generate a key and import it into the local wallet:

```bash
cleos create key --to-console
cleos wallet import --private-key YOUR_PRIVATE_KEY
```

Create the contract account and creator account with the generated public key:

```bash
cleos system newaccount --gift-ram-kbytes 512 eosio hashedlaunch YOUR_PUBLIC_KEY YOUR_PUBLIC_KEY
cleos system newaccount --gift-ram-kbytes 256 eosio hashcreator YOUR_PUBLIC_KEY YOUR_PUBLIC_KEY
```

> Keep the private key local. Never paste it into Discord, GitHub, or the launcher frontend.

## 3. Compile

From the Ultra dev container, with this project mounted under `/opt/ultra_workdir/hashed-ultra-token-launcher`:

```bash
cd /opt/ultra_workdir/hashed-ultra-token-launcher/contract
mkdir -p build
cd build
cmake ..
make
```

You should get `hashedlaunch.wasm` and `hashedlaunch.abi` in the build directory.

For a direct CDT compile, this is also suitable:

```bash
cdt-cpp -abigen \
  -I ../include \
  -contract hashedlaunch \
  -o hashedlaunch.wasm \
  ../src/hashedlaunch.cpp
```

## 4. Deploy locally

From the build folder:

```bash
cleos set contract hashedlaunch . hashedlaunch.wasm hashedlaunch.abi -p hashedlaunch@active
```

Check the ABI:

```bash
cleos get abi hashedlaunch
```

## 5. Launch the first token

```bash
cleos push action hashedlaunch launch \
'["hashcreator","1000000.00000000 HASH","500000.00000000 HASH","Hashed Test Token","https://example.com/hash.json"]' \
-p hashcreator@active
```

Check supply and balance:

```bash
cleos get currency stats hashedlaunch HASH
cleos get currency balance hashedlaunch hashcreator HASH
```

Expected initial balance:

```text
500000.00000000 HASH
```

## 6. Transfer the token

Create another local account, then:

```bash
cleos push action hashedlaunch transfer \
'["hashcreator","receiveracct","25.00000000 HASH","Hashed launcher test"]' \
-p hashcreator@active
```

## 7. Web launcher

The web launcher targets **Ultra Testnet** and uses the Ultra Wallet **browser extension** (Ultra's Web Wallet does not support Testnet).

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Set `VITE_CONTRACT_ACCOUNT` to the Testnet account where the contract is eventually deployed.

For local Ultra-chain testing, use `cleos` first. Once Ultra's public Testnet account/faucet access is restored, deploy the same contract to Testnet and use the web interface.

## Security decisions in this MVP

- Token creation requires the issuer's signature.
- Only the recorded issuer can mint new supply.
- Maximum supply cannot be exceeded.
- A symbol can only exist once under this launcher contract.
- Creator/issuer pays token state RAM; sender pays RAM for a new recipient balance row.
- No contract-admin mint function.
- Token metadata updates require issuer authorization.

## Before Mainnet

This is an MVP, not an audited production token factory. Before Mainnet:

1. Independent smart-contract audit.
2. Property/fuzz testing for token accounting invariants.
3. Decide whether launches should share a single contract or deploy isolated contracts per project.
4. Add creation fees / anti-symbol-squatting rules if desired.
5. Add token logo/metadata schema and indexer.
6. Add vesting/locker contracts.
7. Add launch-sale and liquidity-bootstrap contracts.
8. Integrate the Hashed DEX router/pool contracts.
