# Hashed — Ultra Token Launcher + Meme Launchpad

Hashed is focused on two products on Ultra:

1. **Token Launcher** — create native fungible tokens on Ultra.
2. **Meme Launchpad** — launch those tokens on a UOS bonding curve with native buy/sell support before graduation.

The old fundraising/IDO-style launchpad has been archived under `legacy/raise/`. DEX and lending remain separate projects and are not part of Hashed40.

## 1. Token Launcher

The launcher is an eosio.token-style Ultra / Antelope C++ contract.

### Actions

| Action | Purpose |
|---|---|
| `launch` | Create a token and issue its initial supply atomically |
| `create` | Create a token without issuing supply |
| `issue` | Mint additional supply up to the configured maximum |
| `retire` | Burn issuer-held supply |
| `transfer` | Transfer tokens |
| `open` / `close` | Manage token balance rows |
| `setmeta` | Update token metadata |

The token issuer controls future minting. Hashed does not have an admin mint path for another creator's token.

## 2. Meme Launchpad

The launchpad turns a Hashed-created token into a simple Pump.fun-style Ultra market.

### Creator flow

```text
Create token
    ↓
Create meme market
    ↓
Choose token allocation
    ↓
Set start price / end price
    ↓
Set UOS graduation target
    ↓
Add image + description + social links
    ↓
Deposit curve allocation
    ↓
Activate
```

### Trader flow

```text
Live market
   ↓
Buy token with UOS
   ↕
Linear bonding curve
   ↕
Sell token for UOS
   ↓
Graduation target reached
   ↓
Curve closes
```

No external DEX is required for the pre-graduation market.

### Launchpad actions

| Action | Purpose |
|---|---|
| `setconfig` | Set trusted Hashed launcher, payment asset, fee receiver and protocol fee |
| `createmarket` | Create a meme-token bonding-curve market |
| `activate` | Open the curve after the full sale allocation is deposited |
| `settle` | Settle a graduated market to the creator |

Token transfers into the launchpad drive the trading flow:

| Transfer memo | Purpose |
|---|---|
| `seed:<market_id>` | Creator deposits the token allocation |
| `buy:<market_id>` | User buys from the curve with UOS |
| `sell:<market_id>` | User sells the launched token back into the curve |

## Bonding curve

Hashed currently uses a deterministic **linear bonding curve**.

The market stores:

- start price
- end price
- token allocation
- tokens sold
- UOS reserve
- UOS volume
- graduation target
- protocol fee
- market metadata

The marginal price rises linearly as more of the allocation is sold.

Buy transactions:

1. receive UOS;
2. calculate the maximum token output under the curve;
3. charge the protocol fee only on the curve cost actually consumed;
4. refund unused UOS to the buyer;
5. transfer purchased tokens;
6. graduate automatically when the reserve target is reached or the curve sells out.

Sell transactions:

1. receive launched tokens back into the launchpad;
2. reverse the same curve integral;
3. deduct the protocol fee;
4. return UOS to the seller;
5. reduce tokens sold and curve reserve.

Trading is disabled once a market graduates.

## Graduation

A market graduates when either:

- its UOS reserve reaches `graduation_target`; or
- the entire curve token allocation is sold.

The current MVP does **not** automatically create a DEX pool after graduation. That is intentional: the Hashed40 scope is the token launcher and meme launchpad only.

After graduation the creator can call `settle`, which closes the market and returns the remaining curve reserve and any unsold curve allocation.

## Metadata

Each meme launch supports:

- display name
- image URI
- description
- website
- X / Twitter
- Telegram

The frontend also shows:

- current curve price
- UOS reserve
- volume
- graduation progress
- market state
- creator/trading controls

## Local Ultra integration tests

Ultra's developer image is used in CI:

```bash
docker pull quay.io/ultra.io/3rdparty-devtools:latest
```

Inside the Ultra container:

```bash
cd /opt/ultra_workdir/Hashed40
bash scripts/test_ultra.sh
```

The suite compiles both WASM contracts and tests:

- token creation
- mint / transfer / burn
- duplicate-symbol protection
- meme market creation
- curve token escrow
- activation
- UOS buy
- token sell
- protocol fees
- curve reserve accounting
- automatic graduation
- blocking trades after graduation
- creator settlement

A successful run ends with:

```text
PASS: Token Launcher + Launchpad integration suite
```

## Compile only

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

## Frontend

The frontend has two product tabs:

- **Token Launcher**
- **Meme Launchpad**

The Meme Launchpad includes creator setup, market discovery, graduation progress, and bonding-curve buy/sell controls.

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Example Testnet environment:

```env
VITE_CONTRACT_ACCOUNT=<HASHED_TOKEN_LAUNCHER_ACCOUNT>
VITE_LAUNCHPAD_ACCOUNT=<HASHED_LAUNCHPAD_ACCOUNT>
VITE_PAYMENT_CONTRACT=eosio.token
VITE_PAYMENT_SYMBOL=UOS
VITE_PAYMENT_DECIMALS=8
VITE_ULTRA_RPC_URL=https://test.ultra.eosusa.io
```

The frontend checks the connected Ultra chain and rejects Mainnet while this build is configured for Testnet.

## Public Ultra Testnet deployment

When the public Ultra Testnet accounts/resources are available:

1. deploy `hashedlaunch.wasm/.abi`;
2. deploy `hashedpad.wasm/.abi`;
3. add `hashedpad@eosio.code` to the launchpad account's active authority;
4. configure the launchpad with:
   - trusted launcher account
   - `eosio.token`
   - `8,UOS`
   - fee receiver
   - protocol fee;
5. set the Vercel environment variables to the real Testnet account names;
6. create a token;
7. create, seed and activate a meme market;
8. test UOS buys, token sells, graduation and settlement;
9. verify state and transactions on the Ultra Testnet explorer.

## Security status

This is a local/Testnet MVP, not an audited Mainnet release.

Before Mainnet:

- independent contract audit
- fuzz/property tests for curve invariants
- stronger overflow/rounding tests across token precisions
- RAM/resource sponsorship review
- fee and authority review
- market metadata moderation/spam policy
- production monitoring and indexing
- public Testnet soak testing

## Repository structure

```text
contract/
  include/
    hashedlaunch/hashedlaunch.hpp
    hashedpad/hashedpad.hpp
  src/
    hashedlaunch.cpp
    hashedpad.cpp

tests/
  launcher.ultra_test.js
  launchpad.ultra_test.js

web/
  src/main.ts
  src/style.css

legacy/
  raise/
    ... archived original fundraising launchpad
```
