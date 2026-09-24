# Hashed40 — Meme Launchpad on Ultra

Hashed40 is a **Pump.fun-style meme launchpad for the Ultra blockchain**.

This repository is intentionally focused on one product:

> Create a meme coin, put it on a UOS bonding curve, and let people buy/sell it.

The standalone native Ultra token launcher now lives in **mushee-io/HashTL**.

## Product flow

```text
Create coin
   ↓
Name + ticker + logo + description
   ↓
Hashed40 uses HashTL to create the Ultra token
   ↓
Hashed40 creates and seeds the bonding curve
   ↓
Trading goes live
   ↓
Buy with UOS ↔ Sell token for UOS
   ↓
Graduation threshold
```

The creator does **not** have to configure maximum supply, decimals, curve allocation, start price, end price, or other protocol engineering parameters in the UI. Hashed40 owns those defaults.

## Create Coin UX

Creators enter:

- logo
- name
- ticker
- description
- website (optional)
- X (optional)
- Telegram (optional)
- optional initial UOS buy

The frontend then orchestrates the required Ultra transactions:

1. create the fungible token through the configured HashTL contract;
2. create the Hashed40 meme market;
3. deposit the fixed token supply into the curve;
4. activate trading;
5. optionally perform the creator's first buy.

## Meme market

Each market tracks:

- creator
- token symbol
- logo and metadata
- UOS bonding-curve reserve
- token amount sold
- volume
- protocol fee
- graduation target
- market status

Users can discover markets by:

- New
- Trending
- Graduating
- Graduated

A token page/card displays price, volume, reserve and graduation progress.

## Bonding curve

Hashed40 currently uses a deterministic linear bonding curve.

While a market is live:

- users buy with UOS;
- the token price rises as curve inventory is sold;
- users can sell tokens back into the curve for UOS;
- protocol fees apply to buys and sells;
- unused buy input is refunded automatically.

When the graduation reserve target is reached, the contract marks the market as graduated and disables further curve trading.

The graduated reserve stays locked in the Hashed40 contract in this MVP. It is **not withdrawable by the token creator**. A future migration mechanism can be added separately without turning this repository into a DEX.

## HashTL dependency

Hashed40 does not contain the standalone token-launcher product anymore.

Production configuration points Hashed40 at the deployed HashTL contract:

```env
VITE_TOKEN_FACTORY_ACCOUNT=<HASHTL_TESTNET_ACCOUNT>
```

The Hashed40 contract also stores the trusted token-factory account in `setconfig`, so markets cannot arbitrarily point at unrelated token contracts.

Repository:

`https://github.com/mushee-io/HashTL`

## Contract actions

| Action | Purpose |
|---|---|
| `setconfig` | Configure trusted HashTL token contract, UOS payment asset and protocol fee |
| `createmarket` | Create a meme bonding-curve market |
| `activate` | Open trading after the market supply is deposited |

Transfers into Hashed40 use:

| Memo | Meaning |
|---|---|
| `seed:<market_id>` | seed the curve with the launched token |
| `buy:<market_id>` | buy the meme token with UOS |
| `sell:<market_id>` | sell the meme token back to the curve |

## Local tests

The repository contains a **test-only** token fixture under `tests/fixtures/hashedlaunch` so Hashed40 can be tested independently in CI.

That fixture is not the HashTL product.

Run:

```bash
bash scripts/test_ultra.sh
```

The integration suite verifies:

- meme market creation
- token escrow
- activation
- UOS buys
- sells back into the curve
- protocol fees
- reserve accounting
- automatic graduation
- trading disabled after graduation
- graduated reserve remains locked

## Build

Only the Hashed40 launchpad is built as the product artifact:

```bash
bash scripts/compile_ultra.sh
```

Output:

```text
contract/build/hashedpad.wasm
contract/build/hashedpad.abi
```

## Frontend

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Environment:

```env
VITE_TOKEN_FACTORY_ACCOUNT=<HASHTL_TESTNET_ACCOUNT>
VITE_LAUNCHPAD_ACCOUNT=<HASHED40_TESTNET_ACCOUNT>
VITE_PAYMENT_CONTRACT=eosio.token
VITE_PAYMENT_SYMBOL=UOS
VITE_PAYMENT_DECIMALS=8
VITE_ULTRA_RPC_URL=https://ultra-testnet.eosphere.io
```

## Repository scope

Hashed40 is:

- meme token creation UX
- token discovery
- UOS bonding-curve trading
- graduation

Hashed40 is **not**:

- the generic native token launcher
- a DEX
- a lending protocol
- an IDO/fundraising launchpad

Those are separate ecosystem products.

## Security status

This is a Testnet/local-chain MVP, not an audited Mainnet release.

Before Mainnet:

- independent contract audit
- fuzz/property testing of bonding-curve invariants
- review of price rounding and extreme token sizes
- protocol fee review
- RAM/resource model review
- spam/moderation controls for token metadata
- public Ultra Testnet soak testing
- formal graduation/migration design
