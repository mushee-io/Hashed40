# Hashed — Ultra Token Launcher + Launchpad

Hashed is an Ultra-native **Token Launcher + Launchpad**.

The scope of this repository is intentionally limited to two products:

1. **Token Launcher** — create and manage native fungible tokens on Ultra.
2. **Launchpad** — escrow those tokens, raise UOS, finalize the launch, distribute purchased tokens, and refund contributors when a launch fails.

DEX and lending functionality are separate projects and are not part of Hashed40.

## Token Launcher

The launcher is an eosio.token-style C++ / WASM contract deployed under a Hashed-controlled Ultra account.

### Actions

| Action | Purpose | Authorization |
|---|---|---|
| `launch` | Create a token and issue its initial supply atomically | issuer |
| `create` | Create a token without issuing supply | issuer |
| `issue` | Mint additional supply up to the maximum | token issuer |
| `retire` | Burn issuer-held supply | token issuer |
| `transfer` | Transfer tokens | sender |
| `open` | Open a zero-balance row | RAM payer |
| `close` | Remove an empty balance row | owner |
| `setmeta` | Update token name / metadata URI | token issuer |

The launcher enforces maximum supply, symbol/precision consistency, issuer-only minting, positive transfers, issuer-only metadata updates, and one token per symbol under the launcher contract.

## Launchpad

The launchpad is a separate Ultra contract that is explicitly connected to the configured Hashed Token Launcher.

A campaign creator:

1. creates a token through Hashed;
2. creates a launch campaign;
3. deposits the campaign's token allocation into the launchpad escrow using `deposit:<campaign_id>`;
4. activates the campaign;
5. contributors send UOS using `buy:<campaign_id>`;
6. the campaign finalizes after the end time or when the hard cap is reached;
7. successful contributors claim purchased tokens;
8. successful creators withdraw proceeds and reclaim unsold tokens;
9. failed campaigns let contributors claim refunds and creators reclaim the escrowed sale tokens.

### Launchpad actions

| Action | Purpose | Authorization |
|---|---|---|
| `setconfig` | Configure trusted launcher, payment asset and platform fee | launchpad account |
| `createcamp` | Create a launch campaign | creator |
| `setallow` | Add/remove an account from an allowlisted campaign | creator |
| `activate` | Activate after the full token allocation is escrowed | creator |
| `cancel` | Cancel a draft or unfunded active campaign | creator |
| `finalize` | Set a completed campaign to success or failure | anyone |
| `claim` | Claim purchased sale tokens | participant |
| `refund` | Recover payment from a failed/cancelled campaign | participant |
| `withdraw` | Withdraw successful campaign proceeds | creator |
| `reclaim` | Recover unsold or failed-campaign sale tokens | creator |

### Campaign controls

Each campaign snapshots:

- sale token contract and symbol
- token allocation
- payment contract and payment symbol
- tokens received per payment unit
- start/end timestamps
- soft cap and hard cap
- minimum and maximum contribution
- optional allowlist
- platform fee receiver and fee basis points
- amount raised, amount sold, escrowed amount and campaign status

The contract rejects purchases before the start time, after the end time, above the hard cap, above the participant maximum, from non-allowlisted accounts when allowlisting is enabled, or when the escrow cannot satisfy the purchase.

### Trust boundary

The launchpad has a contract-level configuration for the trusted Hashed launcher and accepted payment asset. New campaigns cannot point at an arbitrary sale-token contract or arbitrary payment contract.

For Ultra Testnet the intended production configuration is:

- launcher contract: the deployed Hashed Token Launcher account
- payment contract: `eosio.token`
- payment symbol: `8,UOS`

The local integration suite uses `TUOS` issued by the Hashed launcher so the complete flow can be tested without relying on the public faucet.

## Local Ultra test

Ultra's official developer image includes the C++ contract toolchain and `ultratest`.

```bash
mkdir -p ~/ultra_workdir
cd ~/ultra_workdir
git clone https://github.com/mushee-io/Hashed40.git
cd Hashed40

docker pull quay.io/ultra.io/3rdparty-devtools:latest

docker run -dit \
  --name ultra \
  -p 8888:8888 \
  -p 9876:9876 \
  -v ~/ultra_workdir:/opt/ultra_workdir \
  quay.io/ultra.io/3rdparty-devtools:latest

docker start ultra
docker exec -it ultra /bin/bash
```

Inside the container:

```bash
cd /opt/ultra_workdir/Hashed40
bash scripts/test_ultra.sh
```

The integration suite compiles both contracts and exercises:

- token creation
- minting
- token transfers
- burning
- duplicate-symbol rejection
- launchpad contract deployment
- campaign creation
- token escrow
- campaign activation
- multiple contributions
- token allocation math
- hard-cap finalization
- successful token claims
- platform-fee accounting
- creator proceeds
- unsold-token reclaim
- failed-launch finalization
- contributor refunds

Compile without running tests:

```bash
bash scripts/compile_ultra.sh
```

Artifacts:

```text
contract/build/hashedlaunch.wasm
contract/build/hashedlaunch.abi
contract/build/hashedpad.wasm
contract/build/hashedpad.abi
```

## Launchpad inline-transfer permission

Claims, refunds, fee payments, proceeds and token reclaims are inline transfers initiated by the launchpad contract.

The deployed launchpad account therefore needs its own `eosio.code` permission included in `active`. This is standard Antelope contract authorization for inline actions.

Do this only with the actual launchpad account and its actual public key. Never commit or paste a private key into the repository.

## Configure the launchpad

After both contracts are deployed, configure the launchpad using the actual deployment accounts.

Conceptually:

```text
setconfig(
  <HASHED_LAUNCHER_ACCOUNT>,
  eosio.token,
  8,UOS,
  <HASHED_FEE_RECEIVER>,
  <FEE_BPS>
)
```

The contract caps the platform fee at 1,000 basis points (10%). Existing campaigns snapshot their fee settings, so a later configuration change does not alter the economics of campaigns already created.

## Frontend

The frontend provides two tabs: **Token Launcher** and **Launchpad**.

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Environment variables:

```env
VITE_CONTRACT_ACCOUNT=<HASHED_TOKEN_LAUNCHER_ACCOUNT>
VITE_LAUNCHPAD_ACCOUNT=<HASHED_LAUNCHPAD_ACCOUNT>
VITE_PAYMENT_CONTRACT=eosio.token
VITE_PAYMENT_SYMBOL=UOS
VITE_PAYMENT_DECIMALS=8
VITE_ULTRA_RPC_URL=https://test.ultra.eosusa.io
```

The frontend uses the Ultra Wallet SDK, targets Ultra Testnet, and uses string/BigInt asset parsing to avoid JavaScript floating-point rounding in token amounts.

## Public Ultra Testnet deployment

Once Ultra provides a funded Testnet developer account/resource access:

1. compile both WASM/ABI pairs;
2. deploy `hashedlaunch`;
3. deploy `hashedpad`;
4. add `hashedpad@eosio.code` to the launchpad account's active authority;
5. call `setconfig` with the launcher account and `eosio.token / 8,UOS`;
6. configure the frontend environment variables;
7. create a real Testnet token with the launcher;
8. create a campaign for that token;
9. escrow the allocation;
10. activate, contribute with Testnet UOS, finalize and claim/refund;
11. verify all transactions and table state on the Ultra Testnet explorer.

Ultra developer account names may be generated by Ultra. Do not assume the public deployment accounts will literally be named `hashedlaunch` and `hashedpad`.

## Security status

This is a working testnet/local-chain implementation, not an audited Mainnet release.

Before Mainnet:

- independent smart-contract audit
- fuzz/property testing of supply and escrow invariants
- RAM/resource model review for participant rows
- campaign-state transition review
- price/rate rounding review
- platform fee and authority review
- production metadata/indexing
- vesting support if required by launches
- public Testnet soak testing

## Repository structure

```text
contract/
  CMakeLists.txt
  include/
    hashedlaunch/hashedlaunch.hpp
    hashedpad/hashedpad.hpp
  src/
    hashedlaunch.cpp
    hashedpad.cpp

scripts/
  compile_ultra.sh
  local_test.sh
  test_ultra.sh

tests/
  launcher.ultra_test.js
  launchpad.ultra_test.js

web/
  src/main.ts
  src/style.css
  vite.config.ts
  package.json
```
