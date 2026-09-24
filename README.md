# Hashed — Ultra Native Token Launcher

Hashed is a native Ultra / Antelope fungible-token launcher. The current MVP creates tokens, issues supply, transfers balances, burns supply, stores metadata, and includes an Ultra Wallet Testnet frontend.

## Current scope

- Native Ultra C++ / WASM smart contract
- One-transaction `launch` action
- Configurable symbol, precision, maximum supply, and initial supply
- Issuer-controlled minting
- Burning with `retire`
- Standard token transfers
- Token metadata
- Ultra Wallet SDK Testnet frontend
- Local Ultra integration tests using `ultratest`

## Contract actions

| Action | Purpose | Authorization |
|---|---|---|
| `launch` | Create a token and optionally mint its initial supply atomically | issuer |
| `create` | Create a token without minting | issuer |
| `issue` | Mint additional supply up to the maximum | token issuer |
| `retire` | Burn issuer-held supply | token issuer |
| `transfer` | Transfer tokens | sender |
| `open` | Open a zero-balance row | RAM payer |
| `close` | Remove an empty balance row | owner |
| `setmeta` | Update token name / metadata URI | token issuer |

A token is identified by **launcher contract + symbol**, following the Antelope token model.

## Architecture

Ultra's deployed system `eosio.token` contract is not being modified. Hashed deploys its own eosio.token-style contract and allows the token issuer to authorize token creation through that contract.

The launcher enforces:

- maximum supply
- symbol/precision consistency
- issuer-only minting
- positive transfer quantities
- issuer-only metadata updates
- one token per symbol under the launcher contract

## Fastest local test

Ultra's official developer image contains `cdt-cpp`, `cleos`, `nodeos`, `keosd`, and `ultratest`.

### 1. Clone into your Ultra work directory

Linux / WSL:

```bash
mkdir -p ~/ultra_workdir
cd ~/ultra_workdir
git clone https://github.com/mushee-io/Hashed40.git
cd Hashed40
```

### 2. Pull and start Ultra's developer container

```bash
docker pull quay.io/ultra.io/3rdparty-devtools:latest
```

If you do not already have the `ultra` container:

```bash
docker run -dit \
  --name ultra \
  -p 8888:8888 \
  -p 9876:9876 \
  -v ~/ultra_workdir:/opt/ultra_workdir \
  quay.io/ultra.io/3rdparty-devtools:latest
```

Enter it:

```bash
docker start ultra
docker exec -it ultra /bin/bash
```

### 3. Compile + run the complete token test

Inside the Ultra container:

```bash
cd /opt/ultra_workdir/Hashed40
bash scripts/test_ultra.sh
```

That script:

1. compiles `hashedlaunch.cpp` with Ultra's `cdt-cpp`
2. generates `hashedlaunch.wasm`
3. generates `hashedlaunch.abi`
4. boots an Ultra test environment with `ultratest`
5. deploys the contract
6. creates `HASH`
7. mints `500,000 HASH`
8. transfers `25 HASH`
9. issues additional supply
10. burns supply
11. verifies duplicate-symbol protection

A successful run ends with:

```text
PASS: create -> mint -> transfer -> burn -> duplicate-symbol protection
```

## Compile only

Inside Ultra's developer container:

```bash
cd /opt/ultra_workdir/Hashed40
bash scripts/compile_ultra.sh
```

Artifacts are written to:

```text
contract/build/hashedlaunch.wasm
contract/build/hashedlaunch.abi
```

## Manual local deployment

If you want a persistent local chain instead of the automated test runner:

```bash
ultratest -D -n -s
```

In another shell inside the container:

```bash
cleos get info
```

Create/import a local key and create the deployment accounts as needed, then deploy:

```bash
cleos set contract hashedlaunch \
  /opt/ultra_workdir/Hashed40/contract/build \
  hashedlaunch.wasm \
  hashedlaunch.abi \
  -p hashedlaunch@active
```

If the local environment reports that the deployment account has no KYC info, Ultra's local-development documentation provides:

```bash
cleos push action eosio.kyc togglekyc '[]' -p ultra.kyc
```

Then retry deployment.

## Launch HASH manually

```bash
cleos push action hashedlaunch launch \
'["hashcreator","1000000.00000000 HASH","500000.00000000 HASH","Hashed Test Token","https://example.com/hash.json"]' \
-p hashcreator@active
```

Verify:

```bash
cleos get currency stats hashedlaunch HASH
cleos get currency balance hashedlaunch hashcreator HASH
```

Transfer:

```bash
cleos push action hashedlaunch transfer \
'["hashcreator","receiveracct","25.00000000 HASH","Hashed launcher test"]' \
-p hashcreator@active
```

## Web launcher

The frontend uses `@ultraos/wallet-sdk@^0.6.1` and targets **Ultra Testnet**.

Ultra's browser extension only injects its wallet API into HTTPS pages. The project therefore uses `@vitejs/plugin-basic-ssl` so local development runs over HTTPS.

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Open the HTTPS URL printed by Vite and accept the local development certificate warning.

Set:

```env
VITE_CONTRACT_ACCOUNT=<your Ultra Testnet contract account>
```

before using the public Testnet build.

The frontend deliberately uses string/BigInt amount parsing rather than JavaScript floating-point arithmetic, so large token supplies and fixed precision are not silently rounded.

## Public Ultra Testnet

Once a funded Ultra developer Testnet account is available:

1. compile the WASM/ABI
2. deploy both artifacts to the generated Ultra developer account
3. set `VITE_CONTRACT_ACCOUNT` to that account
4. connect the Ultra Wallet extension on Testnet
5. launch a test token
6. verify the transaction and token tables on the Ultra Testnet explorer

Ultra developer account names on Testnet/Mainnet are generated by Ultra; do not assume the deployment account will literally be named `hashedlaunch`.

## Security status

This is an MVP and is **not audited for Mainnet**.

Before Mainnet:

1. independent smart-contract audit
2. fuzz/property tests for supply and balance invariants
3. launch fee / anti-spam policy
4. production RAM/resource sponsorship model
5. token metadata/indexing standard
6. vesting and LP-lock contracts
7. launch-sale and liquidity-bootstrap contracts
8. Hashed DEX integration
9. lending only after reliable liquidity/oracle architecture exists

## Repository structure

```text
contract/
  CMakeLists.txt
  include/hashedlaunch/hashedlaunch.hpp
  src/hashedlaunch.cpp

scripts/
  compile_ultra.sh
  local_test.sh
  test_ultra.sh

tests/
  launcher.ultra_test.js

web/
  src/main.ts
  src/style.css
  vite.config.ts
  package.json
```
