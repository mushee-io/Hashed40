import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const TOKEN_CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT || 'hashedlaunch';
const PAD_CONTRACT = import.meta.env.VITE_LAUNCHPAD_ACCOUNT || 'hashedpad';
const PAYMENT_CONTRACT = import.meta.env.VITE_PAYMENT_CONTRACT || 'eosio.token';
const PAYMENT_SYMBOL = import.meta.env.VITE_PAYMENT_SYMBOL || 'UOS';
const PAYMENT_DECIMALS = Number(import.meta.env.VITE_PAYMENT_DECIMALS || 8);
const RPC_URL = import.meta.env.VITE_ULTRA_RPC_URL || 'https://test.ultra.eosusa.io';

const ULTRA_MAINNET_CHAIN_ID =
  'a9c481dfbc7d9506dc7e87e9a137c931b0a9303f64fd7a1d08b8230133920097';
const ULTRA_TESTNET_CHAIN_ID =
  '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
const MAX_ASSET_AMOUNT = (1n << 62n) - 1n;

let account: string | undefined;
let selectedMarketId: number | undefined;

type StatusKind = 'ok' | 'error' | 'info';

type MarketRow = {
  id: number | string;
  creator: string;
  token_contract: string;
  token_symbol: string;
  token_allocation: string;
  deposited: string;
  sold: string;
  payment_contract: string;
  payment_symbol: string;
  start_price: string;
  end_price: string;
  graduation_target: string;
  reserve: string;
  volume: string;
  fee_receiver: string;
  fee_bps: number;
  display_name: string;
  image_uri: string;
  description: string;
  website: string;
  x_url: string;
  telegram_url: string;
  status: number;
  created_at: number;
  graduated_at: number;
};

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="shell">
    <nav>
      <div class="brand"><span class="mark">H</span> HASHED</div>
      <div class="tabs" aria-label="Hashed products">
        <button class="tab active" data-tab="launcher">Token Launcher</button>
        <button class="tab" data-tab="launchpad">Meme Launchpad</button>
      </div>
      <button id="connect" class="wallet">Connect Ultra Wallet</button>
    </nav>

    <section class="hero">
      <div class="eyebrow">ULTRA TESTNET · TOKEN LAUNCHER + MEME LAUNCHPAD</div>
      <h1>Create it.<br/>Launch it on Ultra.</h1>
      <p>Create a native Ultra token, then launch it on Hashed's UOS bonding curve. No fundraising campaign flow and no DEX dependency.</p>
    </section>

    <section id="launcher-panel" class="panel active">
      <section class="card">
        <div class="form-head">
          <div><span class="step">01</span><h2>Create a token</h2></div>
          <span class="network">ULTRA TESTNET</span>
        </div>

        <form id="token-form">
          <div class="grid2">
            <label>Token name<input id="token-name" maxlength="64" placeholder="Ultra Dog" required /></label>
            <label>Symbol<input id="token-symbol" maxlength="7" placeholder="UDOG" pattern="[A-Z]{1,7}" required /></label>
          </div>

          <div class="grid2">
            <label>Maximum supply<input id="token-max" inputmode="decimal" value="1000000000" required /></label>
            <label>Initial supply<input id="token-initial" inputmode="decimal" value="1000000000" required /></label>
          </div>

          <div class="grid2">
            <label>Decimals
              <select id="token-decimals">
                <option>4</option>
                <option>6</option>
                <option selected>8</option>
              </select>
            </label>
            <label>Metadata URI <span>(optional)</span>
              <input id="token-uri" maxlength="256" placeholder="ipfs://..." />
            </label>
          </div>

          <div class="summary">
            <div><span>Issuer</span><strong id="issuer">Not connected</strong></div>
            <div><span>Contract</span><strong>${TOKEN_CONTRACT}</strong></div>
            <div><span>Network</span><strong>Ultra Testnet</strong></div>
          </div>

          <button id="create-token" class="primary" type="submit" disabled>Connect wallet to create token</button>
        </form>

        <div id="token-status" class="status"></div>
      </section>
    </section>

    <section id="launchpad-panel" class="panel">
      <section class="card">
        <div class="form-head">
          <div><span class="step">02</span><h2>Create a meme market</h2></div>
          <span class="network">BONDING CURVE</span>
        </div>

        <form id="market-form">
          <div class="grid3">
            <label>Display name<input id="market-name" maxlength="64" placeholder="Ultra Dog" required /></label>
            <label>Token symbol<input id="market-symbol" maxlength="7" placeholder="UDOG" pattern="[A-Z]{1,7}" required /></label>
            <label>Token decimals
              <select id="market-decimals">
                <option>4</option>
                <option>6</option>
                <option selected>8</option>
              </select>
            </label>
          </div>

          <div class="grid3">
            <label>Curve token allocation<input id="market-allocation" inputmode="decimal" value="800000000" required /></label>
            <label>Start price (${PAYMENT_SYMBOL}/token)<input id="market-start-price" inputmode="decimal" value="0.000001" required /></label>
            <label>End price (${PAYMENT_SYMBOL}/token)<input id="market-end-price" inputmode="decimal" value="0.00001" required /></label>
          </div>

          <div class="grid2">
            <label>Graduation target (${PAYMENT_SYMBOL})<input id="market-graduation" inputmode="decimal" value="5000" required /></label>
            <label>Token image URI<input id="market-image" maxlength="256" placeholder="ipfs://..." /></label>
          </div>

          <label>Description<textarea id="market-description" maxlength="512" placeholder="What is this token about?"></textarea></label>

          <div class="grid3">
            <label>Website<input id="market-website" maxlength="256" placeholder="https://..." /></label>
            <label>X / Twitter<input id="market-x" maxlength="256" placeholder="https://x.com/..." /></label>
            <label>Telegram<input id="market-telegram" maxlength="256" placeholder="https://t.me/..." /></label>
          </div>

          <div class="summary">
            <div><span>Creator</span><strong id="market-creator">Not connected</strong></div>
            <div><span>Payment</span><strong>${PAYMENT_SYMBOL}</strong></div>
            <div><span>Launchpad</span><strong>${PAD_CONTRACT}</strong></div>
          </div>

          <button id="create-market" class="primary" type="submit" disabled>Create meme market</button>
        </form>

        <div id="market-status" class="status"></div>
      </section>

      <section class="card">
        <div class="form-head">
          <div><span class="step">03</span><h2>Seed and go live</h2></div>
          <span class="network">CREATOR</span>
        </div>

        <div class="grid3">
          <label>Market ID<input id="manage-market-id" inputmode="numeric" placeholder="1" /></label>
          <label>Token symbol<input id="manage-symbol" maxlength="7" placeholder="UDOG" /></label>
          <label>Token decimals
            <select id="manage-decimals">
              <option>4</option>
              <option>6</option>
              <option selected>8</option>
            </select>
          </label>
        </div>

        <div class="grid2">
          <label>Token allocation<input id="manage-allocation" inputmode="decimal" value="800000000" /></label>
          <button id="seed-market" class="secondary action-button" type="button" disabled>Deposit curve tokens</button>
        </div>

        <div class="button-grid two">
          <button id="activate-market" class="primary" type="button" disabled>Activate market</button>
          <button id="settle-market" class="secondary" type="button" disabled>Settle graduated market</button>
        </div>

        <div id="manage-status" class="status"></div>
      </section>

      <section class="card">
        <div class="form-head">
          <div><span class="step">04</span><h2>Live launches</h2></div>
          <button id="refresh-markets" class="secondary compact" type="button">Refresh</button>
        </div>

        <div id="markets-empty" class="empty">No launch markets found yet.</div>
        <div id="markets-grid" class="market-grid"></div>
        <div id="markets-status" class="status"></div>
      </section>

      <section class="card trade-card">
        <div class="form-head">
          <div><span class="step">05</span><h2>Buy / sell on the curve</h2></div>
          <span id="selected-market-label" class="network">SELECT MARKET</span>
        </div>

        <div class="grid2">
          <label>Market ID<input id="trade-market-id" inputmode="numeric" placeholder="Select a market above" /></label>
          <label>Token symbol<input id="trade-symbol" maxlength="7" placeholder="UDOG" /></label>
        </div>

        <div class="grid2">
          <label>Buy with ${PAYMENT_SYMBOL}<input id="buy-amount" inputmode="decimal" value="10" /></label>
          <button id="buy-market" class="primary action-button" type="button" disabled>Buy token</button>
        </div>

        <div class="grid3">
          <label>Sell token amount<input id="sell-amount" inputmode="decimal" value="1000" /></label>
          <label>Token decimals
            <select id="trade-decimals">
              <option>4</option>
              <option>6</option>
              <option selected>8</option>
            </select>
          </label>
          <button id="sell-market" class="secondary action-button" type="button" disabled>Sell token</button>
        </div>

        <div id="trade-status" class="status"></div>
      </section>
    </section>

    <footer>Hashed · Native token creation + meme launches on Ultra</footer>
  </main>
`;

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const tokenButton = document.querySelector<HTMLButtonElement>('#create-token')!;
const marketButton = document.querySelector<HTMLButtonElement>('#create-market')!;
const issuer = document.querySelector<HTMLElement>('#issuer')!;
const marketCreator = document.querySelector<HTMLElement>('#market-creator')!;

const connectedButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(
    '#create-token, #create-market, #seed-market, #activate-market, #settle-market, #buy-market, #sell-market',
  ),
);

function statusElement(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}

function showStatus(target: HTMLElement, message: string, kind: StatusKind = 'info') {
  target.className = `status ${kind}`;
  target.textContent = message;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function parseAmount(raw: string, decimals: number): { atomic: bigint; normalized: string } {
  const value = raw.trim();

  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Enter a decimal amount using numbers only.');
  }

  const [wholeRaw, fractionRaw = ''] = value.split('.');

  if (fractionRaw.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }

  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.padEnd(decimals, '0');
  const atomicText = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';
  const atomic = BigInt(atomicText);

  if (atomic > MAX_ASSET_AMOUNT) {
    throw new Error('Amount exceeds the maximum value supported by an Antelope asset.');
  }

  return {
    atomic,
    normalized: decimals > 0 ? `${whole}.${fraction}` : whole,
  };
}

function formatAsset(raw: string, decimals: number, symbol: string): { atomic: bigint; asset: string } {
  const parsed = parseAmount(raw, decimals);
  return { atomic: parsed.atomic, asset: `${parsed.normalized} ${symbol}` };
}

function assetNumber(asset: string): number {
  return Number(asset.split(' ')[0]);
}

function symbolPrecision(symbol: string): number {
  return Number(symbol.split(',')[0]);
}

function symbolCode(symbol: string): string {
  return symbol.split(',')[1] || '';
}

function walletErrorCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidate = err as { code?: unknown };
  return typeof candidate.code === 'number' ? candidate.code : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (typeof err === 'object' && err !== null) {
    const candidate = err as {
      message?: string;
      data?: string | { message?: string; error?: { what?: string } };
    };

    if (typeof candidate.data === 'string') return candidate.data;

    if (candidate.data && typeof candidate.data === 'object') {
      return candidate.data.message ?? candidate.data.error?.what ?? candidate.message ?? 'Wallet request failed.';
    }

    return candidate.message ?? 'Wallet request failed.';
  }

  return 'Wallet request failed.';
}

function setWalletControls(enabled: boolean) {
  connectedButtons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function requiredAccount(): string {
  if (!account) throw new Error('Connect your Ultra Wallet first.');
  return account;
}

function positiveId(selector: string): number {
  const raw = document.querySelector<HTMLInputElement>(selector)!.value.trim();
  const id = Number(raw);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Enter a valid market ID.');
  }

  return id;
}

async function signTransaction(
  contract: string,
  action: string,
  data: Record<string, unknown>,
): Promise<string> {
  requiredAccount();

  const response = await wallet.signTransaction({ contract, action, data });
  const hash = response.data.transactionHash;

  if (!hash) {
    throw new Error('Ultra Wallet submitted the transaction without returning a transaction hash.');
  }

  return hash;
}

async function withButton(
  button: HTMLButtonElement,
  target: HTMLElement,
  pendingText: string,
  fn: () => Promise<string>,
) {
  const original = button.textContent || '';
  button.disabled = true;
  button.textContent = pendingText;

  try {
    const hash = await fn();
    showStatus(target, `Transaction submitted: ${hash}`, 'ok');
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    button.disabled = !account;
    button.textContent = original;
  }
}

async function fetchMarkets(): Promise<MarketRow[]> {
  const response = await fetch(`${RPC_URL}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      json: true,
      code: PAD_CONTRACT,
      scope: PAD_CONTRACT,
      table: 'markets',
      limit: 250,
    }),
  });

  if (!response.ok) {
    throw new Error(`Could not load markets from Ultra RPC (${response.status}).`);
  }

  const payload = (await response.json()) as { rows?: MarketRow[] };
  return payload.rows ?? [];
}

function statusName(status: number): string {
  if (status === 0) return 'Draft';
  if (status === 1) return 'Live';
  if (status === 2) return 'Graduated';
  if (status === 3) return 'Closed';
  return 'Unknown';
}

function marketCurrentPrice(market: MarketRow): number {
  const start = assetNumber(market.start_price);
  const end = assetNumber(market.end_price);
  const sold = assetNumber(market.sold);
  const allocation = assetNumber(market.token_allocation);
  const ratio = allocation > 0 ? Math.min(1, sold / allocation) : 0;
  return start + (end - start) * ratio;
}

function renderMarkets(markets: MarketRow[]) {
  const grid = document.querySelector<HTMLDivElement>('#markets-grid')!;
  const empty = document.querySelector<HTMLDivElement>('#markets-empty')!;

  grid.innerHTML = '';
  empty.style.display = markets.length ? 'none' : 'block';

  markets
    .slice()
    .reverse()
    .forEach((market) => {
      const id = Number(market.id);
      const code = symbolCode(market.token_symbol);
      const precision = symbolPrecision(market.token_symbol);
      const reserve = assetNumber(market.reserve);
      const target = assetNumber(market.graduation_target);
      const progress = target > 0 ? Math.min(100, (reserve / target) * 100) : 0;
      const price = marketCurrentPrice(market);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `market-card ${selectedMarketId === id ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="market-card-head">
          <div class="token-avatar">${market.image_uri ? '<span>IMG</span>' : code.slice(0, 2)}</div>
          <div>
            <strong>${market.display_name}</strong>
            <span>${code} · #${id}</span>
          </div>
          <span class="market-status status-${market.status}">${statusName(market.status)}</span>
        </div>
        <p>${market.description || 'Meme token launched on Ultra.'}</p>
        <div class="market-stats">
          <div><span>Price</span><strong>${price.toFixed(PAYMENT_DECIMALS)} ${PAYMENT_SYMBOL}</strong></div>
          <div><span>Reserve</span><strong>${reserve.toFixed(4)} ${PAYMENT_SYMBOL}</strong></div>
          <div><span>Volume</span><strong>${assetNumber(market.volume).toFixed(4)} ${PAYMENT_SYMBOL}</strong></div>
        </div>
        <div class="progress"><i style="width:${progress}%"></i></div>
        <div class="progress-label"><span>Graduation</span><strong>${progress.toFixed(1)}%</strong></div>
      `;

      card.addEventListener('click', () => {
        selectedMarketId = id;
        document.querySelector<HTMLInputElement>('#trade-market-id')!.value = String(id);
        document.querySelector<HTMLInputElement>('#trade-symbol')!.value = code;
        document.querySelector<HTMLSelectElement>('#trade-decimals')!.value = String(precision);
        document.querySelector<HTMLElement>('#selected-market-label')!.textContent = `#${id} · ${code}`;

        renderMarkets(markets);
      });

      grid.appendChild(card);
    });
}

async function refreshMarkets() {
  const target = statusElement('#markets-status');

  try {
    showStatus(target, 'Loading Ultra launch markets…');
    const markets = await fetchMarkets();
    renderMarkets(markets);
    showStatus(target, `${markets.length} market${markets.length === 1 ? '' : 's'} loaded.`, 'ok');
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
}

async function latestMarketForCreator(creator: string): Promise<MarketRow | undefined> {
  const markets = await fetchMarkets();
  return markets
    .filter((market) => market.creator === creator)
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));

    button.classList.add('active');
    document.querySelector<HTMLElement>(`#${button.dataset.tab}-panel`)!.classList.add('active');

    if (button.dataset.tab === 'launchpad') void refreshMarkets();
  });
});

connectButton.addEventListener('click', async () => {
  const target = statusElement('#token-status');

  if (!('ultra' in window)) {
    showStatus(
      target,
      'Ultra Wallet Extension was not detected. Testnet requires the Ultra browser extension.',
      'error',
    );
    return;
  }

  connectButton.disabled = true;

  try {
    showStatus(target, 'Checking Ultra Wallet network…');

    const chainResponse = await wallet.getChainId();
    const currentChainId = chainResponse.data;

    if (currentChainId !== ULTRA_TESTNET_CHAIN_ID) {
      const currentNetwork =
        currentChainId === ULTRA_MAINNET_CHAIN_ID ? 'Mainnet' : 'another network';

      showStatus(
        target,
        `Ultra Wallet is on ${currentNetwork}. Trying to switch to Ultra Testnet…`,
        'info',
      );

      try {
        await wallet.switchNetwork(ULTRA_TESTNET_CHAIN_ID);
      } catch (switchErr: unknown) {
        if (walletErrorCode(switchErr) === 4100) {
          throw new Error(
            'Your wallet is on Ultra Mainnet. Open Ultra Wallet → Networks → Testnet, switch to Testnet, then click Connect again.',
          );
        }

        throw new Error(
          `Could not switch Ultra Wallet to Testnet automatically. Switch it manually in the extension, then try again. ${errorMessage(switchErr)}`,
        );
      }

      const switched = await wallet.getChainId();
      if (switched.data !== ULTRA_TESTNET_CHAIN_ID) {
        throw new Error('Ultra Wallet did not switch to Testnet. Switch networks in the extension and try again.');
      }
    }

    const { data } = await wallet.connect();
    account = data.blockchainid;

    if (!account) {
      throw new Error('Ultra Testnet is selected, but the wallet did not return a Testnet account.');
    }

    connectButton.textContent = account;
    issuer.textContent = account;
    marketCreator.textContent = account;
    setWalletControls(true);
    showStatus(target, 'Wallet connected to Ultra Testnet.', 'ok');
  } catch (err: unknown) {
    account = undefined;
    setWalletControls(false);
    showStatus(target, errorMessage(err), 'error');
  } finally {
    connectButton.disabled = false;
  }
});

document.querySelector<HTMLFormElement>('#token-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  const target = statusElement('#token-status');

  try {
    const creator = requiredAccount();
    const name = document.querySelector<HTMLInputElement>('#token-name')!.value.trim();
    const symbol = document.querySelector<HTMLInputElement>('#token-symbol')!.value.trim().toUpperCase();
    const decimals = Number(document.querySelector<HTMLSelectElement>('#token-decimals')!.value);
    const maximum = formatAsset(
      document.querySelector<HTMLInputElement>('#token-max')!.value,
      decimals,
      symbol,
    );
    const initial = formatAsset(
      document.querySelector<HTMLInputElement>('#token-initial')!.value,
      decimals,
      symbol,
    );
    const uri = document.querySelector<HTMLInputElement>('#token-uri')!.value.trim();

    if (utf8Length(name) === 0 || utf8Length(name) > 64) {
      throw new Error('Token name must be between 1 and 64 UTF-8 bytes.');
    }

    if (!/^[A-Z]{1,7}$/.test(symbol)) {
      throw new Error('Symbol must be 1–7 uppercase A–Z characters.');
    }

    if (maximum.atomic <= 0n) throw new Error('Maximum supply must be greater than zero.');
    if (initial.atomic > maximum.atomic) throw new Error('Initial supply cannot exceed maximum supply.');
    if (utf8Length(uri) > 256) throw new Error('Metadata URI must be at most 256 UTF-8 bytes.');

    await withButton(tokenButton, target, 'Confirm in wallet…', () =>
      signTransaction(TOKEN_CONTRACT, 'launch', {
        issuer: creator,
        maximum_supply: maximum.asset,
        initial_supply: initial.asset,
        token_name: name,
        metadata_uri: uri,
      }),
    );

    document.querySelector<HTMLInputElement>('#market-name')!.value = name;
    document.querySelector<HTMLInputElement>('#market-symbol')!.value = symbol;
    document.querySelector<HTMLSelectElement>('#market-decimals')!.value = String(decimals);
    document.querySelector<HTMLInputElement>('#manage-symbol')!.value = symbol;
    document.querySelector<HTMLSelectElement>('#manage-decimals')!.value = String(decimals);

    document.querySelector<HTMLButtonElement>('[data-tab="launchpad"]')!.click();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLFormElement>('#market-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  const target = statusElement('#market-status');

  try {
    const creator = requiredAccount();
    const symbol = document.querySelector<HTMLInputElement>('#market-symbol')!.value.trim().toUpperCase();
    const decimals = Number(document.querySelector<HTMLSelectElement>('#market-decimals')!.value);
    const displayName = document.querySelector<HTMLInputElement>('#market-name')!.value.trim();

    if (!/^[A-Z]{1,7}$/.test(symbol)) throw new Error('Enter a valid token symbol.');
    if (utf8Length(displayName) === 0 || utf8Length(displayName) > 64) {
      throw new Error('Display name must be between 1 and 64 UTF-8 bytes.');
    }

    const allocationRaw = document.querySelector<HTMLInputElement>('#market-allocation')!.value;
    const allocation = formatAsset(allocationRaw, decimals, symbol);
    const startPrice = formatAsset(
      document.querySelector<HTMLInputElement>('#market-start-price')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );
    const endPrice = formatAsset(
      document.querySelector<HTMLInputElement>('#market-end-price')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );
    const graduation = formatAsset(
      document.querySelector<HTMLInputElement>('#market-graduation')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );

    if (allocation.atomic <= 0n) throw new Error('Curve token allocation must be greater than zero.');
    if (startPrice.atomic <= 0n) throw new Error('Start price must be greater than zero.');
    if (endPrice.atomic <= startPrice.atomic) throw new Error('End price must be greater than start price.');
    if (graduation.atomic <= 0n) throw new Error('Graduation target must be greater than zero.');

    const image = document.querySelector<HTMLInputElement>('#market-image')!.value.trim();
    const description = document.querySelector<HTMLTextAreaElement>('#market-description')!.value.trim();
    const website = document.querySelector<HTMLInputElement>('#market-website')!.value.trim();
    const xUrl = document.querySelector<HTMLInputElement>('#market-x')!.value.trim();
    const telegram = document.querySelector<HTMLInputElement>('#market-telegram')!.value.trim();

    await withButton(marketButton, target, 'Confirm market…', async () => {
      const hash = await signTransaction(PAD_CONTRACT, 'createmarket', {
        creator,
        token_symbol: `${decimals},${symbol}`,
        token_allocation: allocation.asset,
        start_price: startPrice.asset,
        end_price: endPrice.asset,
        graduation_target: graduation.asset,
        display_name: displayName,
        image_uri: image,
        description,
        website,
        x_url: xUrl,
        telegram_url: telegram,
      });

      document.querySelector<HTMLInputElement>('#manage-symbol')!.value = symbol;
      document.querySelector<HTMLSelectElement>('#manage-decimals')!.value = String(decimals);
      document.querySelector<HTMLInputElement>('#manage-allocation')!.value = allocationRaw;

      try {
        const latest = await latestMarketForCreator(creator);
        if (latest) {
          document.querySelector<HTMLInputElement>('#manage-market-id')!.value = String(latest.id);
          document.querySelector<HTMLInputElement>('#trade-market-id')!.value = String(latest.id);
        }
      } catch {
        // RPC indexing can lag the transaction; creator can enter the market ID manually.
      }

      return hash;
    });

    void refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#seed-market')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const target = statusElement('#manage-status');

  try {
    const creator = requiredAccount();
    const id = positiveId('#manage-market-id');
    const symbol = document.querySelector<HTMLInputElement>('#manage-symbol')!.value.trim().toUpperCase();
    const decimals = Number(document.querySelector<HTMLSelectElement>('#manage-decimals')!.value);
    const allocation = formatAsset(
      document.querySelector<HTMLInputElement>('#manage-allocation')!.value,
      decimals,
      symbol,
    );

    await withButton(button, target, 'Confirm deposit…', () =>
      signTransaction(TOKEN_CONTRACT, 'transfer', {
        from: creator,
        to: PAD_CONTRACT,
        quantity: allocation.asset,
        memo: `seed:${id}`,
      }),
    );
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#activate-market')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const target = statusElement('#manage-status');

  try {
    const id = positiveId('#manage-market-id');

    await withButton(button, target, 'Going live…', () =>
      signTransaction(PAD_CONTRACT, 'activate', { market_id: id }),
    );

    void refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#settle-market')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const target = statusElement('#manage-status');

  try {
    const id = positiveId('#manage-market-id');

    await withButton(button, target, 'Settling…', () =>
      signTransaction(PAD_CONTRACT, 'settle', { market_id: id }),
    );

    void refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#buy-market')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const target = statusElement('#trade-status');

  try {
    const buyer = requiredAccount();
    const id = positiveId('#trade-market-id');
    const payment = formatAsset(
      document.querySelector<HTMLInputElement>('#buy-amount')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );

    if (payment.atomic <= 0n) throw new Error('Buy amount must be greater than zero.');

    await withButton(button, target, 'Confirm buy…', () =>
      signTransaction(PAYMENT_CONTRACT, 'transfer', {
        from: buyer,
        to: PAD_CONTRACT,
        quantity: payment.asset,
        memo: `buy:${id}`,
      }),
    );

    void refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#sell-market')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const target = statusElement('#trade-status');

  try {
    const seller = requiredAccount();
    const id = positiveId('#trade-market-id');
    const symbol = document.querySelector<HTMLInputElement>('#trade-symbol')!.value.trim().toUpperCase();
    const decimals = Number(document.querySelector<HTMLSelectElement>('#trade-decimals')!.value);
    const quantity = formatAsset(
      document.querySelector<HTMLInputElement>('#sell-amount')!.value,
      decimals,
      symbol,
    );

    if (quantity.atomic <= 0n) throw new Error('Sell amount must be greater than zero.');

    await withButton(button, target, 'Confirm sell…', () =>
      signTransaction(TOKEN_CONTRACT, 'transfer', {
        from: seller,
        to: PAD_CONTRACT,
        quantity: quantity.asset,
        memo: `sell:${id}`,
      }),
    );

    void refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#refresh-markets')!.addEventListener('click', () => {
  void refreshMarkets();
});

setWalletControls(false);
void refreshMarkets();
