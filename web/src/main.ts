import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const TOKEN_FACTORY =
  import.meta.env.VITE_TOKEN_FACTORY_ACCOUNT ||
  import.meta.env.VITE_CONTRACT_ACCOUNT ||
  'hashedlaunch';
const PAD_CONTRACT = import.meta.env.VITE_LAUNCHPAD_ACCOUNT || 'hashedpad';
const PAYMENT_CONTRACT = import.meta.env.VITE_PAYMENT_CONTRACT || 'eosio.token';
const PAYMENT_SYMBOL = import.meta.env.VITE_PAYMENT_SYMBOL || 'UOS';
const PAYMENT_DECIMALS = Number(import.meta.env.VITE_PAYMENT_DECIMALS || 8);
const RPC_URL = import.meta.env.VITE_ULTRA_RPC_URL || 'https://ultra-testnet.eosphere.io';

const ULTRA_MAINNET_CHAIN_ID =
  'a9c481dfbc7d9506dc7e87e9a137c931b0a9303f64fd7a1d08b8230133920097';
const ULTRA_TESTNET_CHAIN_ID =
  '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';

// Protocol defaults stay out of the creator UX.
const TOKEN_DECIMALS = 8;
const TOTAL_SUPPLY = '1000000000';
const CURVE_ALLOCATION = '1000000000';
const START_PRICE = '0.000001';
const END_PRICE = '0.000010';
const GRADUATION_TARGET = '5000';

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
let account: string | undefined;
let selectedMarket: MarketRow | undefined;
let activeFilter: 'new' | 'trending' | 'graduating' | 'graduated' = 'new';

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
      <div class="brand"><span class="brand-mark">H40</span><strong>HASHED40</strong></div>
      <div class="nav-links">
        <button class="nav-link active" data-scroll="discover">Explore</button>
        <button class="nav-link" data-scroll="create">Create coin</button>
      </div>
      <button id="connect" class="wallet">Connect Ultra Wallet</button>
    </nav>

    <section class="hero">
      <div class="eyebrow">MEME COINS · NATIVE ON ULTRA</div>
      <h1>Launch a coin.<br/>Trade it instantly.</h1>
      <p>Pick a name, ticker and logo. Hashed40 handles the token creation and bonding curve behind the scenes.</p>
      <button id="hero-create" class="hero-button">Create a coin</button>
    </section>

    <section id="create" class="create-section">
      <div class="section-head">
        <div>
          <span class="kicker">CREATE</span>
          <h2>Launch your coin</h2>
        </div>
        <span class="pill">Ultra Testnet</span>
      </div>

      <form id="coin-form" class="create-card">
        <div class="logo-field">
          <div id="logo-preview" class="logo-preview">+</div>
          <label>Logo URL
            <input id="coin-logo" maxlength="256" placeholder="https://... or ipfs://..." />
          </label>
        </div>

        <div class="grid2">
          <label>Name
            <input id="coin-name" maxlength="64" placeholder="Ultra Dog" required />
          </label>
          <label>Ticker
            <input id="coin-symbol" maxlength="7" placeholder="UDOG" pattern="[A-Z]{1,7}" required />
          </label>
        </div>

        <label>Description
          <textarea id="coin-description" maxlength="512" placeholder="Tell Ultra what this coin is about."></textarea>
        </label>

        <div class="grid3">
          <label>Website <span>optional</span>
            <input id="coin-website" maxlength="256" placeholder="https://..." />
          </label>
          <label>X <span>optional</span>
            <input id="coin-x" maxlength="256" placeholder="https://x.com/..." />
          </label>
          <label>Telegram <span>optional</span>
            <input id="coin-telegram" maxlength="256" placeholder="https://t.me/..." />
          </label>
        </div>

        <div class="initial-buy">
          <div>
            <strong>Initial buy</strong>
            <span>Optional. Be the first buyer when your coin goes live.</span>
          </div>
          <div class="amount-input">
            <input id="initial-buy" inputmode="decimal" value="0" />
            <span>${PAYMENT_SYMBOL}</span>
          </div>
        </div>

        <div class="launch-note">
          <strong>One launch flow.</strong>
          <span>Hashed40 will create the token through HashTL, create its curve, seed the supply and activate trading. Your wallet will ask you to approve the required Ultra transactions.</span>
        </div>

        <button id="launch-coin" class="primary" type="submit" disabled>Connect wallet to launch</button>
        <div id="launch-status" class="status"></div>
      </form>
    </section>

    <section id="discover" class="discover-section">
      <div class="section-head">
        <div>
          <span class="kicker">DISCOVER</span>
          <h2>Coins on Hashed40</h2>
        </div>
        <button id="refresh" class="ghost">Refresh</button>
      </div>

      <div class="filters">
        <button class="filter active" data-filter="new">New</button>
        <button class="filter" data-filter="trending">Trending</button>
        <button class="filter" data-filter="graduating">Graduating</button>
        <button class="filter" data-filter="graduated">Graduated</button>
      </div>

      <div id="market-grid" class="market-grid"></div>
      <div id="market-empty" class="empty">No coins here yet.</div>
      <div id="market-status" class="status"></div>
    </section>

    <section id="trade" class="trade-section hidden">
      <div class="trade-header">
        <div class="trade-token">
          <div id="trade-logo" class="trade-logo">H40</div>
          <div>
            <span id="trade-ticker">$COIN</span>
            <h2 id="trade-name">Select a coin</h2>
          </div>
        </div>
        <span id="trade-state" class="pill">LIVE</span>
      </div>

      <p id="trade-description" class="trade-description"></p>

      <div class="trade-stats">
        <div><span>Price</span><strong id="trade-price">—</strong></div>
        <div><span>Reserve</span><strong id="trade-reserve">—</strong></div>
        <div><span>Volume</span><strong id="trade-volume">—</strong></div>
        <div><span>Graduation</span><strong id="trade-progress">—</strong></div>
      </div>

      <div class="curve-progress"><i id="trade-progress-bar"></i></div>

      <div class="trade-box">
        <div class="trade-tabs">
          <button id="buy-tab" class="trade-tab active">Buy</button>
          <button id="sell-tab" class="trade-tab">Sell</button>
        </div>

        <div id="buy-panel">
          <label>Spend
            <div class="asset-input">
              <input id="buy-amount" inputmode="decimal" value="10" />
              <span>${PAYMENT_SYMBOL}</span>
            </div>
          </label>
          <button id="buy-button" class="primary" disabled>Buy</button>
        </div>

        <div id="sell-panel" class="hidden">
          <label>Sell amount
            <div class="asset-input">
              <input id="sell-amount" inputmode="decimal" value="1000" />
              <span id="sell-symbol">COIN</span>
            </div>
          </label>
          <button id="sell-button" class="primary" disabled>Sell</button>
        </div>

        <div id="trade-status" class="status"></div>
      </div>
    </section>

    <footer>Hashed40 · Meme launches on Ultra</footer>
  </main>
`;

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const launchButton = document.querySelector<HTMLButtonElement>('#launch-coin')!;
const buyButton = document.querySelector<HTMLButtonElement>('#buy-button')!;
const sellButton = document.querySelector<HTMLButtonElement>('#sell-button')!;

function showStatus(target: HTMLElement, message: string, kind: StatusKind = 'info') {
  target.className = `status ${kind}`;
  target.textContent = message;
}

function status(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
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
      return candidate.data.message ?? candidate.data.error?.what ?? candidate.message ?? 'Transaction failed.';
    }
    return candidate.message ?? 'Transaction failed.';
  }
  return 'Transaction failed.';
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function formatAmount(raw: string, decimals: number, symbol: string): string {
  const value = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a valid amount.');

  const [wholeRaw, fractionRaw = ''] = value.split('.');
  if (fractionRaw.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }

  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.padEnd(decimals, '0');
  return `${whole}.${fraction} ${symbol}`;
}

function assetNumber(asset: string): number {
  return Number(asset.split(' ')[0]);
}

function symbolCode(symbol: string): string {
  return symbol.split(',')[1] || '';
}

function symbolPrecision(symbol: string): number {
  return Number(symbol.split(',')[0]);
}

function imageUrl(uri: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (/^https?:\/\//i.test(uri)) return uri;
  return undefined;
}

function setConnected(enabled: boolean) {
  launchButton.disabled = !enabled;
  buyButton.disabled = !enabled || !selectedMarket || selectedMarket.status !== 1;
  sellButton.disabled = !enabled || !selectedMarket || selectedMarket.status !== 1;

  if (enabled) launchButton.textContent = 'Launch coin';
}

async function sign(contract: string, action: string, data: Record<string, unknown>): Promise<string> {
  if (!account) throw new Error('Connect your Ultra Wallet first.');

  const response = await wallet.signTransaction({ contract, action, data });
  return response.data.transactionHash || 'submitted';
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

  if (!response.ok) throw new Error(`Ultra RPC returned ${response.status}.`);
  const payload = (await response.json()) as { rows?: MarketRow[] };
  return payload.rows ?? [];
}

function progress(market: MarketRow): number {
  const target = assetNumber(market.graduation_target);
  if (target <= 0) return 0;
  return Math.min(100, (assetNumber(market.reserve) / target) * 100);
}

function currentPrice(market: MarketRow): number {
  const allocation = assetNumber(market.token_allocation);
  const sold = assetNumber(market.sold);
  const start = assetNumber(market.start_price);
  const end = assetNumber(market.end_price);
  const ratio = allocation > 0 ? Math.min(1, sold / allocation) : 0;
  return start + (end - start) * ratio;
}

function filterMarkets(markets: MarketRow[]): MarketRow[] {
  const copy = markets.slice();

  if (activeFilter === 'graduated') {
    return copy.filter((m) => m.status === 2).sort((a, b) => b.graduated_at - a.graduated_at);
  }

  if (activeFilter === 'graduating') {
    return copy
      .filter((m) => m.status === 1)
      .sort((a, b) => progress(b) - progress(a));
  }

  if (activeFilter === 'trending') {
    return copy
      .filter((m) => m.status === 1)
      .sort((a, b) => assetNumber(b.volume) - assetNumber(a.volume));
  }

  return copy.sort((a, b) => b.created_at - a.created_at);
}

function renderMarkets(markets: MarketRow[]) {
  const grid = document.querySelector<HTMLDivElement>('#market-grid')!;
  const empty = document.querySelector<HTMLDivElement>('#market-empty')!;
  const filtered = filterMarkets(markets);

  grid.innerHTML = '';
  empty.style.display = filtered.length ? 'none' : 'block';

  for (const market of filtered) {
    const ticker = symbolCode(market.token_symbol);
    const pct = progress(market);
    const logo = imageUrl(market.image_uri);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'coin-card';
    card.innerHTML = `
      <div class="coin-card-top">
        <div class="coin-logo">${logo ? `<img src="${logo}" alt="" />` : ticker.slice(0, 2)}</div>
        <div class="coin-title">
          <strong>${market.display_name}</strong>
          <span>$${ticker}</span>
        </div>
        <span class="coin-state ${market.status === 2 ? 'graduated' : ''}">
          ${market.status === 2 ? 'Graduated' : 'Live'}
        </span>
      </div>
      <p>${market.description || 'Launched on Hashed40.'}</p>
      <div class="coin-numbers">
        <div><span>Price</span><strong>${currentPrice(market).toFixed(8)} ${PAYMENT_SYMBOL}</strong></div>
        <div><span>Volume</span><strong>${assetNumber(market.volume).toFixed(2)} ${PAYMENT_SYMBOL}</strong></div>
      </div>
      <div class="mini-progress"><i style="width:${pct}%"></i></div>
      <div class="progress-row"><span>Bonding curve</span><strong>${pct.toFixed(1)}%</strong></div>
    `;

    card.addEventListener('click', () => selectMarket(market));
    grid.appendChild(card);
  }
}

async function refreshMarkets() {
  const target = status('#market-status');

  try {
    const markets = await fetchMarkets();
    renderMarkets(markets);

    if (selectedMarket) {
      const fresh = markets.find((m) => Number(m.id) === Number(selectedMarket!.id));
      if (fresh) selectMarket(fresh, false);
    }

    showStatus(target, `${markets.length} coin${markets.length === 1 ? '' : 's'} loaded.`, 'ok');
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
}

function selectMarket(market: MarketRow, scroll = true) {
  selectedMarket = market;
  const ticker = symbolCode(market.token_symbol);
  const pct = progress(market);
  const logo = imageUrl(market.image_uri);

  document.querySelector<HTMLElement>('#trade')!.classList.remove('hidden');
  document.querySelector<HTMLElement>('#trade-ticker')!.textContent = `$${ticker}`;
  document.querySelector<HTMLElement>('#trade-name')!.textContent = market.display_name;
  document.querySelector<HTMLElement>('#trade-description')!.textContent = market.description || '';
  document.querySelector<HTMLElement>('#trade-state')!.textContent =
    market.status === 2 ? 'GRADUATED' : 'LIVE';
  document.querySelector<HTMLElement>('#trade-price')!.textContent =
    `${currentPrice(market).toFixed(8)} ${PAYMENT_SYMBOL}`;
  document.querySelector<HTMLElement>('#trade-reserve')!.textContent =
    `${assetNumber(market.reserve).toFixed(2)} ${PAYMENT_SYMBOL}`;
  document.querySelector<HTMLElement>('#trade-volume')!.textContent =
    `${assetNumber(market.volume).toFixed(2)} ${PAYMENT_SYMBOL}`;
  document.querySelector<HTMLElement>('#trade-progress')!.textContent = `${pct.toFixed(1)}%`;
  (document.querySelector<HTMLElement>('#trade-progress-bar')!).style.width = `${pct}%`;
  document.querySelector<HTMLElement>('#sell-symbol')!.textContent = ticker;

  const logoElement = document.querySelector<HTMLElement>('#trade-logo')!;
  logoElement.innerHTML = logo ? `<img src="${logo}" alt="" />` : ticker.slice(0, 2);

  setConnected(Boolean(account));

  if (scroll) {
    document.querySelector<HTMLElement>('#trade')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function waitForMarket(creator: string, symbol: string): Promise<MarketRow> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const markets = await fetchMarkets();
    const match = markets
      .filter(
        (m) =>
          m.creator === creator &&
          symbolCode(m.token_symbol) === symbol &&
          m.status === 0,
      )
      .sort((a, b) => Number(b.id) - Number(a.id))[0];

    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Coin was created, but the new Hashed40 market has not appeared in the Ultra RPC yet. Refresh in a moment.');
}

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true;
  const target = status('#launch-status');

  try {
    if (!('ultra' in window)) throw new Error('Ultra Wallet Extension was not detected.');

    const chain = await wallet.getChainId();

    if (chain.data !== ULTRA_TESTNET_CHAIN_ID) {
      if (chain.data === ULTRA_MAINNET_CHAIN_ID) {
        showStatus(target, 'Ultra Wallet is on Mainnet. Switching to Testnet…');
      }

      try {
        await wallet.switchNetwork(ULTRA_TESTNET_CHAIN_ID);
      } catch {
        throw new Error('Open Ultra Wallet → Networks → Testnet, switch to Testnet, then connect again.');
      }
    }

    const { data } = await wallet.connect();
    account = data.blockchainid;

    if (!account) throw new Error('Ultra Testnet account was not returned by the wallet.');

    connectButton.textContent = account;
    setConnected(true);
    showStatus(target, 'Wallet connected to Ultra Testnet.', 'ok');
  } catch (err: unknown) {
    account = undefined;
    setConnected(false);
    showStatus(target, errorMessage(err), 'error');
  } finally {
    connectButton.disabled = false;
  }
});

document.querySelector<HTMLInputElement>('#coin-logo')!.addEventListener('input', (event) => {
  const uri = (event.currentTarget as HTMLInputElement).value.trim();
  const logo = imageUrl(uri);
  const preview = document.querySelector<HTMLElement>('#logo-preview')!;
  preview.innerHTML = logo ? `<img src="${logo}" alt="" />` : '+';
});

document.querySelector<HTMLFormElement>('#coin-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  const target = status('#launch-status');

  if (!account) {
    showStatus(target, 'Connect your Ultra Wallet first.', 'error');
    return;
  }

  const creator = account;
  const name = document.querySelector<HTMLInputElement>('#coin-name')!.value.trim();
  const symbol = document.querySelector<HTMLInputElement>('#coin-symbol')!.value.trim().toUpperCase();
  const logo = document.querySelector<HTMLInputElement>('#coin-logo')!.value.trim();
  const description = document.querySelector<HTMLTextAreaElement>('#coin-description')!.value.trim();
  const website = document.querySelector<HTMLInputElement>('#coin-website')!.value.trim();
  const xUrl = document.querySelector<HTMLInputElement>('#coin-x')!.value.trim();
  const telegram = document.querySelector<HTMLInputElement>('#coin-telegram')!.value.trim();
  const initialBuyRaw = document.querySelector<HTMLInputElement>('#initial-buy')!.value.trim() || '0';

  if (!name || utf8Length(name) > 64) {
    showStatus(target, 'Name must be between 1 and 64 UTF-8 bytes.', 'error');
    return;
  }

  if (!/^[A-Z]{1,7}$/.test(symbol)) {
    showStatus(target, 'Ticker must be 1–7 uppercase A–Z characters.', 'error');
    return;
  }

  launchButton.disabled = true;

  try {
    launchButton.textContent = '1/4 · Create token…';
    showStatus(target, 'Step 1/4 — approve token creation in Ultra Wallet.');

    const supply = formatAmount(TOTAL_SUPPLY, TOKEN_DECIMALS, symbol);

    await sign(TOKEN_FACTORY, 'launch', {
      issuer: creator,
      maximum_supply: supply,
      initial_supply: supply,
      token_name: name,
      metadata_uri: logo,
    });

    launchButton.textContent = '2/4 · Create market…';
    showStatus(target, 'Step 2/4 — approve the Hashed40 bonding-curve market.');

    await sign(PAD_CONTRACT, 'createmarket', {
      creator,
      token_symbol: `${TOKEN_DECIMALS},${symbol}`,
      token_allocation: formatAmount(CURVE_ALLOCATION, TOKEN_DECIMALS, symbol),
      start_price: formatAmount(START_PRICE, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      end_price: formatAmount(END_PRICE, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      graduation_target: formatAmount(GRADUATION_TARGET, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      display_name: name,
      image_uri: logo,
      description,
      website,
      x_url: xUrl,
      telegram_url: telegram,
    });

    showStatus(target, 'Waiting for the new market to appear on Ultra…');
    const market = await waitForMarket(creator, symbol);
    const marketId = Number(market.id);

    launchButton.textContent = '3/4 · Seed curve…';
    showStatus(target, 'Step 3/4 — deposit the fixed meme supply into the bonding curve.');

    await sign(TOKEN_FACTORY, 'transfer', {
      from: creator,
      to: PAD_CONTRACT,
      quantity: formatAmount(CURVE_ALLOCATION, TOKEN_DECIMALS, symbol),
      memo: `seed:${marketId}`,
    });

    launchButton.textContent = '4/4 · Go live…';
    showStatus(target, 'Step 4/4 — activate trading.');

    await sign(PAD_CONTRACT, 'activate', { market_id: marketId });

    const initialBuy = Number(initialBuyRaw);
    if (Number.isFinite(initialBuy) && initialBuy > 0) {
      launchButton.textContent = 'Initial buy…';
      showStatus(target, 'Coin is live. Approve your optional initial buy.');

      await sign(PAYMENT_CONTRACT, 'transfer', {
        from: creator,
        to: PAD_CONTRACT,
        quantity: formatAmount(initialBuyRaw, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
        memo: `buy:${marketId}`,
      });
    }

    showStatus(target, `$${symbol} is live on Hashed40.`, 'ok');
    activeFilter = 'new';
    document.querySelectorAll('.filter').forEach((button) => button.classList.remove('active'));
    document.querySelector<HTMLButtonElement>('[data-filter="new"]')!.classList.add('active');

    await refreshMarkets();

    const markets = await fetchMarkets();
    const live = markets.find((m) => Number(m.id) === marketId);
    if (live) selectMarket(live);
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    launchButton.disabled = false;
    launchButton.textContent = 'Launch coin';
  }
});

buyButton.addEventListener('click', async () => {
  const target = status('#trade-status');

  if (!account || !selectedMarket) {
    showStatus(target, 'Connect your wallet and select a live coin.', 'error');
    return;
  }

  try {
    buyButton.disabled = true;
    const amount = document.querySelector<HTMLInputElement>('#buy-amount')!.value;

    await sign(PAYMENT_CONTRACT, 'transfer', {
      from: account,
      to: PAD_CONTRACT,
      quantity: formatAmount(amount, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      memo: `buy:${selectedMarket.id}`,
    });

    showStatus(target, 'Buy submitted.', 'ok');
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    setConnected(Boolean(account));
  }
});

sellButton.addEventListener('click', async () => {
  const target = status('#trade-status');

  if (!account || !selectedMarket) {
    showStatus(target, 'Connect your wallet and select a live coin.', 'error');
    return;
  }

  try {
    sellButton.disabled = true;

    const ticker = symbolCode(selectedMarket.token_symbol);
    const decimals = symbolPrecision(selectedMarket.token_symbol);
    const amount = document.querySelector<HTMLInputElement>('#sell-amount')!.value;

    await sign(TOKEN_FACTORY, 'transfer', {
      from: account,
      to: PAD_CONTRACT,
      quantity: formatAmount(amount, decimals, ticker),
      memo: `sell:${selectedMarket.id}`,
    });

    showStatus(target, 'Sell submitted.', 'ok');
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    setConnected(Boolean(account));
  }
});

document.querySelector<HTMLButtonElement>('#buy-tab')!.addEventListener('click', () => {
  document.querySelector('#buy-tab')!.classList.add('active');
  document.querySelector('#sell-tab')!.classList.remove('active');
  document.querySelector('#buy-panel')!.classList.remove('hidden');
  document.querySelector('#sell-panel')!.classList.add('hidden');
});

document.querySelector<HTMLButtonElement>('#sell-tab')!.addEventListener('click', () => {
  document.querySelector('#sell-tab')!.classList.add('active');
  document.querySelector('#buy-tab')!.classList.remove('active');
  document.querySelector('#sell-panel')!.classList.remove('hidden');
  document.querySelector('#buy-panel')!.classList.add('hidden');
});

document.querySelectorAll<HTMLButtonElement>('.filter').forEach((button) => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.filter as typeof activeFilter;

    try {
      renderMarkets(await fetchMarkets());
    } catch (err: unknown) {
      showStatus(status('#market-status'), errorMessage(err), 'error');
    }
  });
});

document.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', () => void refreshMarkets());

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scroll]')) {
  button.addEventListener('click', () => {
    document.getElementById(button.dataset.scroll!)?.scrollIntoView({ behavior: 'smooth' });
  });
}

document.querySelector<HTMLButtonElement>('#hero-create')!.addEventListener('click', () => {
  document.querySelector('#create')!.scrollIntoView({ behavior: 'smooth' });
});

setConnected(false);
void refreshMarkets();
