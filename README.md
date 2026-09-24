# Hashed — Ultra Token Launcher + Meme Launchpad

Hashed40 is focused on exactly two products on the **native Ultra blockchain**:

1. **Token Launcher** — create native fungible tokens.
2. **Meme Launchpad** — put a fixed-supply Hashed token on a UOS bonding curve where users can buy and sell it.

There is **no DEX and no lending protocol in this repository**.

## Product flow

```text
Create token
   ↓
Issue full maximum supply
   ↓
Permanently lock minting
   ↓
Create meme launch
   ↓
Escrow the entire token supply
   ↓
Launch goes live automatically
   ↓
Buy with UOS ⇄ bonding curve ⇄ sell token for UOS
   ↓
Graduation target reached
```

Reaching the graduation target currently marks the launch as graduated while keeping curve trading available. No DEX migration is implemented in Hashed40.

---

## 1. Token Launcher

Contract: `hashedlaunch`

### Actions

| Action | Purpose |
|---|---|
| `launch` | Create a token and optionally issue initial supply |
| `create` | Create without issuing |
| `issue` | Mint up to maximum supply |
| `lockmint` | **Permanently disable future minting** |
| `retire` | Burn issuer-held tokens |
| `transfer` | Transfer tokens |
| `open` / `close` | Manage balance rows |
| `setmeta` | Update token metadata |

### Meme-ready token

A token can only enter the meme launchpad when:

- it was created by the configured Hashed Token Launcher;
- its full maximum supply has already been issued;
- `lockmint` has permanently disabled additional issuance;
- the issuer creates the meme launch;
- the entire fixed supply is transferred into launchpad escrow.

This prevents a creator from minting extra supply after the bonding curve goes live.

---

## 2. Meme Launchpad

Contract: `hashedpad`

The old soft-cap/hard-cap fundraising launchpad has been replaced by a meme-token bonding-curve launchpad.

### Launch metadata

A meme launch stores:

- creator
- token name and symbol
- image URI
- description
- website
- X link
- Telegram link
- fixed token allocation
- live token reserve
- virtual UOS reserve
- real UOS reserve
- graduation target
- volume
- trade count
- protocol fee
- creator fee
- graduation state

### Contract actions

| Action | Purpose |
|---|---|
| `setconfig` | Configure trusted launcher, UOS asset, curve parameters and fees |
| `creatememe` | Create a draft meme launch |
| `cancel` | Cancel a draft before supply escrow |

Trading is driven by token-transfer notifications:

| Transfer memo | Meaning |
|---|---|
| `deposit:<launch_id>` | Creator escrows the full fixed token supply and launch becomes live |
| `buy:<launch_id>` | User sends UOS and receives bonding-curve tokens |
| `sell:<launch_id>` | User sends launch token and receives UOS from the curve |

### Bonding curve

The MVP uses a virtual-reserve constant-product curve.

The curve starts with:

```text
virtual UOS reserve × fixed token allocation = invariant
```

A buy increases the UOS side and reduces token reserve. A sell returns tokens to the reserve and pays UOS back out.

Protocol and creator fees are removed from trades separately from the curve reserve. The combined configured trading fee is capped by the contract at **5%**.

### Graduation

Each launch snapshots a UOS graduation target. When its real curve reserve reaches that amount:

```text
graduated = true
```

For this MVP, reaching graduation **does not move funds to a DEX and does not introduce a DEX into Hashed40**. Curve trading remains available. A separate migration mechanism can be designed later if needed.

### Trade history

Every buy and sell is written to the launch-scoped `trades` table with:

- trader
- buy/sell direction
- payment amount
- token amount
- timestamp

This supports the recent-trades UI without an off-chain database for the MVP.

---

## Local Ultra integration test

Ultra's official developer container is used for compilation and `ultratest`.

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

The suite compiles:

```text
contract/build/hashedlaunch.wasm
contract/build/hashedlaunch.abi
contract/build/hashedpad.wasm
contract/build/hashedpad.abi
```

and tests:

- token creation
- minting
- transfers
- burning
- irreversible mint lock
- rejection of minting after lock
- meme launch creation
- full-supply escrow
- automatic go-live
- bonding-curve UOS buys
- protocol fee
- creator fee
- second buyer
- graduation threshold
- bonding-curve token sells
- recent trade history
- duplicate meme-launch rejection

The local suite uses a fake `TUOS` token solely so it can run without the public Testnet faucet. Public Ultra Testnet is configured for native `UOS`.

---

## Launchpad configuration

After deployment, the launchpad account must be configured.

Conceptual public Testnet configuration:

```text
launcher_contract  = <Hashed Token Launcher account>
payment_contract   = eosio.token
payment_symbol     = 8,UOS
fee_receiver       = <Hashed fee account>
protocol_fee_bps   = <configured fee>
creator_fee_bps    = <configured creator fee>
virtual_payment    = <starting virtual UOS reserve>
graduation_target  = <UOS graduation threshold>
```

Example command shape:

```bash
cleos push action <HASHED_PAD_ACCOUNT> setconfig \
'["<HASHED_LAUNCHER_ACCOUNT>","eosio.token","8,UOS","<FEE_ACCOUNT>",100,50,"1000.00000000 UOS","10000.00000000 UOS"]' \
-p <HASHED_PAD_ACCOUNT>@active
```

The numeric curve/fee values above are development examples, not production parameters.

### Inline transfer permission

The launchpad sends tokens and UOS from contract code during buys and sells. Its Ultra account therefore needs `eosio.code` included in its `active` authority before public deployment.

Never commit the deployment account's private key.

---

## Frontend

The web application now has:

### Token Launcher

- name
- symbol
- max supply
- initial supply
- precision
- metadata URI
- meme-ready fixed-supply option
- permanent mint locking

### Meme Launchpad

- image
- description
- website / X / Telegram
- create meme launch
- lock minting
- escrow full supply and go live
- live launch cards
- bonding-curve price
- estimated market cap
- UOS curve reserve
- volume
- trade count
- graduation progress
- buy with UOS
- sell token for UOS

Run locally:

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Environment:

```env
VITE_CONTRACT_ACCOUNT=<HASHED_TOKEN_LAUNCHER_ACCOUNT>
VITE_LAUNCHPAD_ACCOUNT=<HASHED_MEME_LAUNCHPAD_ACCOUNT>
VITE_PAYMENT_CONTRACT=eosio.token
VITE_PAYMENT_SYMBOL=UOS
VITE_PAYMENT_DECIMALS=8
VITE_ULTRA_RPC_URL=https://ultra-testnet.eosphere.io
```

The frontend uses Ultra's Wallet SDK in Testnet-extension mode and checks the wallet chain before connecting.

---

## Public Ultra Testnet

Once the Ultra developer Testnet accounts/resources are available:

1. deploy `hashedlaunch.wasm/.abi`;
2. deploy `hashedpad.wasm/.abi`;
3. add the launchpad's `eosio.code` permission;
4. configure the launchpad for `eosio.token / 8,UOS`;
5. update Vercel with the real contract account names;
6. create a fixed-supply Testnet token;
7. lock minting;
8. create its meme launch;
9. escrow the full supply;
10. buy/sell using Testnet UOS;
11. verify tables and transactions through Ultra's Testnet APIs/explorer.

## Security status

This is a working local/Testnet-oriented MVP, **not an audited Mainnet release**.

Before Mainnet:

- independent contract audit
- fuzz/property testing of bonding-curve invariants
- large-number and rounding tests
- RAM/resource-cost review
- fee-model review
- griefing/spam protections
- trade-history retention/indexing strategy
- public Testnet soak testing
- explicit graduation/migration design

## Repository

```text
contract/
  include/hashedlaunch/hashedlaunch.hpp
  include/hashedpad/hashedpad.hpp
  src/hashedlaunch.cpp
  src/hashedpad.cpp

tests/
  launcher.ultra_test.js
  launchpad.ultra_test.js

web/
  src/main.ts
  src/style.css
```
