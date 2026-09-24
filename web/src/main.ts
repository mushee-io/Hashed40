import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const PAD_CONTRACT = import.meta.env.VITE_LAUNCHPAD_ACCOUNT || 'hashedpad';
const FALLBACK_TOKEN_CONTRACT =
  import.meta.env.VITE_TOKEN_FACTORY_ACCOUNT ||
  import.meta.env.VITE_CONTRACT_ACCOUNT ||
  'hashedlaunch';
const PAYMENT_CONTRACT = import.meta.env.VITE_PAYMENT_CONTRACT || 'eosio.token';
const PAYMENT_SYMBOL = import.meta.env.VITE_PAYMENT_SYMBOL || 'UOS';
const PAYMENT_DECIMALS = Number(import.meta.env.VITE_PAYMENT_DECIMALS || 8);
const RPC_URL = import.meta.env.VITE_ULTRA_RPC_URL || 'https://ultra-testnet.eosphere.io';

const ULTRA_MAINNET_CHAIN_ID =
  'a9c481dfbc7d9506dc7e87e9a137c931b0a9303f64fd7a1d08b8230133920097';
const ULTRA_TESTNET_CHAIN_ID =
  '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';

// Protocol defaults stay hidden from the meme creator.
const TOKEN_DECIMALS = 8;
const TOTAL_SUPPLY = '1000000000';
const CURVE_ALLOCATION = '1000000000';
const START_PRICE = '0.000001';
const END_PRICE = '0.000010';
const GRADUATION_TARGET = '5000';

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
let account: string | undefined;
let selectedMarket: MarketRow | undefined;
let allMarkets: MarketRow[] = [];
let activeFilter: 'new' | 'trending' | 'graduating' | 'graduated' = 'trending';
let searchTerm = '';

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
    <nav class="topbar">
      <a class="brand" href="#markets" aria-label="Hashed40 home">
        <span class="brand-mark">#</span>
        <span>HASHED40</span>
      </a>

      <div class="nav-center">
        <button class="nav-chip active" data-filter-jump="trending">Trending</button>
        <button class="nav-chip" data-filter-jump="new">New</button>
        <button class="nav-chip" data-filter-jump="graduating">Graduating</button>
      </div>

      <div class="top-actions">
        <button id="create-meme" class="create-trigger">+ Create meme</button>
        <button id="connect" class="wallet">Connect Ultra Wallet</button>
      </div>
    </nav>

    <header class="hero">
      <div class="hero-copy">
        <div class="eyebrow">ULTRA MEME MARKET</div>
        <h1>Trade memes.<br/><span>On Ultra.</span></h1>
        <p>Discover live meme coins, buy and sell with UOS, and watch the bonding curve move in real time.</p>
        <div class="hero-actions">
          <button id="hero-create" class="create-trigger hero-create">Create a meme</button>
          <button class="hero-market-link" data-filter-jump="trending">Browse trending</button>
        </div>
      </div>

      <div class="hero-stats">
        <div>
          <span>Markets</span>
          <strong id="stat-markets">—</strong>
        </div>
        <div>
          <span>Live</span>
          <strong id="stat-live">—</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong id="stat-volume">—</strong>
        </div>
      </div>
    </header>

    <section id="markets" class="markets-section">
      <div class="market-toolbar">
        <div>
          <span class="kicker">MEME BOARD</span>
          <h2>Find your next questionable decision.</h2>
        </div>

        <div class="market-actions">
          <label class="search-box" aria-label="Search meme coins">
            <span>⌕</span>
            <input id="market-search" placeholder="Search name or ticker" />
          </label>
          <button id="refresh" class="ghost">Refresh</button>
        </div>
      </div>

      <div class="filters" role="tablist" aria-label="Market filters">
        <button class="filter" data-filter="new">New</button>
        <button class="filter active" data-filter="trending">Trending</button>
        <button class="filter" data-filter="graduating">Graduating</button>
        <button class="filter" data-filter="graduated">Graduated</button>
      </div>

      <div class="trading-layout">
        <div class="market-feed">
          <div id="market-grid" class="market-grid"></div>
          <div id="market-empty" class="empty">No memes match this view.</div>
          <div id="market-status" class="status"></div>
        </div>

        <aside id="trade-panel" class="trade-panel">
          <div id="trade-placeholder" class="trade-placeholder">
            <div class="placeholder-face">#</div>
            <span>SELECT A MEME</span>
            <h3>Pick a coin from the board.</h3>
            <p>The buy/sell terminal will open here.</p>
          </div>

          <div id="trade-content" class="trade-content hidden">
            <div class="trade-token-head">
              <div id="trade-logo" class="trade-logo">#</div>
              <div class="trade-token-copy">
                <div class="ticker-line">
                  <span id="trade-ticker">$COIN</span>
                  <span id="trade-state" class="state-badge">LIVE</span>
                </div>
                <h3 id="trade-name">Meme coin</h3>
              </div>
            </div>

            <p id="trade-description" class="trade-description"></p>

            <div class="trade-stats">
              <div><span>Price</span><strong id="trade-price">—</strong></div>
              <div><span>Volume</span><strong id="trade-volume">—</strong></div>
              <div><span>Reserve</span><strong id="trade-reserve">—</strong></div>
              <div><span>Curve</span><strong id="trade-progress">—</strong></div>
            </div>

            <div class="curve-block">
              <div class="curve-copy"><span>Bonding curve</span><strong id="trade-progress-copy">0%</strong></div>
              <div class="curve-progress"><i id="trade-progress-bar"></i></div>
            </div>

            <div class="trade-tabs">
              <button id="buy-tab" class="trade-tab active">Buy</button>
              <button id="sell-tab" class="trade-tab">Sell</button>
            </div>

            <div id="buy-panel" class="order-panel">
              <label>Pay with
                <div class="asset-input">
                  <input id="buy-amount" inputmode="decimal" value="10" />
                  <span>${PAYMENT_SYMBOL}</span>
                </div>
              </label>
              <div class="quick-row">
                <button type="button" data-buy="10">10</button>
                <button type="button" data-buy="50">50</button>
                <button type="button" data-buy="100">100</button>
              </div>
              <button id="buy-button" class="trade-cta buy" disabled>Buy meme</button>
            </div>

            <div id="sell-panel" class="order-panel hidden">
              <label>Sell amount
                <div class="asset-input">
                  <input id="sell-amount" inputmode="decimal" value="1000" />
                  <span id="sell-symbol">COIN</span>
                </div>
              </label>
              <button id="sell-button" class="trade-cta sell" disabled>Sell meme</button>
            </div>

            <div id="trade-status" class="status"></div>
          </div>
        </aside>
      </div>
    </section>

    <div id="create-modal" class="modal-backdrop hidden" aria-hidden="true">
      <section class="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div class="create-modal-head">
          <div>
            <span class="kicker">CREATE MEME</span>
            <h2 id="create-title">Launch it on Ultra.</h2>
            <p>Name it, meme it, send it. Hashed40 handles the token and bonding curve.</p>
          </div>
          <button id="close-create" class="modal-close" type="button" aria-label="Close">×</button>
        </div>

        <form id="create-form" class="create-form">
          <div class="create-image-row">
            <div id="create-image-preview" class="create-image-preview">#</div>
            <label>Meme image URL
              <input id="create-image" maxlength="256" placeholder="https://... or ipfs://..." />
              <small>Square images work best.</small>
            </label>
          </div>

          <div class="create-grid">
            <label>Name
              <input id="create-name" maxlength="64" placeholder="Purple Wojak" required />
            </label>
            <label>Ticker
              <input id="create-symbol" maxlength="7" placeholder="MOJAK" pattern="[A-Za-z]{1,7}" required />
            </label>
          </div>

          <label>Description
            <textarea id="create-description" maxlength="512" placeholder="What is this meme about?"></textarea>
          </label>

          <details class="create-links">
            <summary>Add links <span>optional</span></summary>
            <div class="create-grid links-grid">
              <label>Website
                <input id="create-website" maxlength="256" placeholder="https://..." />
              </label>
              <label>X
                <input id="create-x" maxlength="256" placeholder="https://x.com/..." />
              </label>
              <label>Telegram
                <input id="create-telegram" maxlength="256" placeholder="https://t.me/..." />
              </label>
            </div>
          </details>

          <label>Initial buy <span>optional</span>
            <div class="asset-input create-buy-input">
              <input id="create-initial-buy" inputmode="decimal" value="0" />
              <span>${PAYMENT_SYMBOL}</span>
            </div>
          </label>

          <div class="create-note">
            Your wallet will approve the launch steps. Supply, pricing and curve settings are handled by Hashed40.
          </div>

          <button id="create-submit" class="create-submit" type="submit" disabled>Connect wallet to create</button>
          <div id="create-status" class="status"></div>
        </form>
      </section>
    </div>

    <footer>
      <strong>HASHED40</strong>
      <span>Meme trading on Ultra · Testnet</span>
    </footer>
  </main>
`;

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const buyButton = document.querySelector<HTMLButtonElement>('#buy-button')!;
const sellButton = document.querySelector<HTMLButtonElement>('#sell-button')!;
const createButton = document.querySelector<HTMLButtonElement>('#create-meme')!;
const heroCreateButton = document.querySelector<HTMLButtonElement>('#hero-create')!;
const createSubmit = document.querySelector<HTMLButtonElement>('#create-submit')!;
const createModal = document.querySelector<HTMLElement>('#create-modal')!;

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  const value = Number(asset.split(' ')[0]);
  return Number.isFinite(value) ? value : 0;
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

function compactAccount(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function setTradeEnabled() {
  const live = Boolean(selectedMarket && selectedMarket.status === 1);
  buyButton.disabled = !account || !live;
  sellButton.disabled = !account || !live;

  if (selectedMarket && selectedMarket.status !== 1) {
    buyButton.textContent = selectedMarket.status === 2 ? 'Market graduated' : 'Market not live';
    sellButton.textContent = selectedMarket.status === 2 ? 'Market graduated' : 'Market not live';
  } else {
    buyButton.textContent = account ? 'Buy meme' : 'Connect wallet to buy';
    sellButton.textContent = account ? 'Sell meme' : 'Connect wallet to sell';
  }

  createSubmit.disabled = !account;
  createSubmit.textContent = account ? 'Launch meme' : 'Connect wallet to create';
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

async function waitForMarket(creator: string, symbol: string): Promise<MarketRow> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const markets = await fetchMarkets();
    const match = markets
      .filter(
        (market) =>
          market.creator === creator &&
          symbolCode(market.token_symbol) === symbol &&
          market.status === 0,
      )
      .sort((a, b) => Number(b.id) - Number(a.id))[0];

    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('The meme token was created, but its market has not appeared yet. Refresh in a moment.');
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

function filteredMarkets(markets: MarketRow[]): MarketRow[] {
  let copy = markets.slice();

  if (searchTerm) {
    const needle = searchTerm.toLowerCase();
    copy = copy.filter((market) => {
      const ticker = symbolCode(market.token_symbol).toLowerCase();
      return market.display_name.toLowerCase().includes(needle) || ticker.includes(needle);
    });
  }

  if (activeFilter === 'graduated') {
    return copy.filter((m) => m.status === 2).sort((a, b) => b.graduated_at - a.graduated_at);
  }

  if (activeFilter === 'graduating') {
    return copy.filter((m) => m.status === 1).sort((a, b) => progress(b) - progress(a));
  }

  if (activeFilter === 'trending') {
    return copy.filter((m) => m.status === 1).sort((a, b) => assetNumber(b.volume) - assetNumber(a.volume));
  }

  return copy.sort((a, b) => b.created_at - a.created_at);
}

function renderStats(markets: MarketRow[]) {
  const live = markets.filter((market) => market.status === 1).length;
  const volume = markets.reduce((sum, market) => sum + assetNumber(market.volume), 0);

  document.querySelector<HTMLElement>('#stat-markets')!.textContent = String(markets.length);
  document.querySelector<HTMLElement>('#stat-live')!.textContent = String(live);
  document.querySelector<HTMLElement>('#stat-volume')!.textContent =
    `${formatCompact(volume)} ${PAYMENT_SYMBOL}`;
}

function renderMarkets(markets: MarketRow[]) {
  const grid = document.querySelector<HTMLDivElement>('#market-grid')!;
  const empty = document.querySelector<HTMLDivElement>('#market-empty')!;
  const filtered = filteredMarkets(markets);

  grid.innerHTML = '';
  empty.style.display = filtered.length ? 'none' : 'block';

  for (const market of filtered) {
    const ticker = symbolCode(market.token_symbol);
    const pct = progress(market);
    const logo = imageUrl(market.image_uri);
    const name = escapeHtml(market.display_name || ticker || 'Untitled');
    const safeTicker = escapeHtml(ticker);
    const description = escapeHtml(market.description || 'Meme coin trading on Ultra.');
    const creator = escapeHtml(compactAccount(market.creator));
    const stateText = market.status === 2 ? 'Graduated' : market.status === 1 ? 'Live' : 'Booting';

    const card = document.createElement('button');
    card.type = 'button';
    card.className = `coin-card${selectedMarket && Number(selectedMarket.id) === Number(market.id) ? ' selected' : ''}`;
    card.innerHTML = `
      <div class="coin-card-top">
        <div class="coin-logo">${logo ? `<img src="${logo}" alt="" loading="lazy" />` : safeTicker.slice(0, 2)}</div>
        <div class="coin-title">
          <strong>${name}</strong>
          <span>$${safeTicker}</span>
        </div>
        <span class="coin-state state-${market.status}">${stateText}</span>
      </div>

      <p>${description}</p>

      <div class="coin-meta">
        <span>by ${creator}</span>
        <span>#${escapeHtml(String(market.id))}</span>
      </div>

      <div class="coin-numbers">
        <div><span>Price</span><strong>${currentPrice(market).toFixed(8)} ${PAYMENT_SYMBOL}</strong></div>
        <div><span>Volume</span><strong>${formatCompact(assetNumber(market.volume))} ${PAYMENT_SYMBOL}</strong></div>
      </div>

      <div class="mini-progress"><i style="width:${pct}%"></i></div>
      <div class="progress-row"><span>Curve</span><strong>${pct.toFixed(1)}%</strong></div>
    `;

    card.addEventListener('click', () => selectMarket(market));
    grid.appendChild(card);
  }
}

function selectMarket(market: MarketRow) {
  selectedMarket = market;
  const ticker = symbolCode(market.token_symbol);
  const pct = progress(market);
  const logo = imageUrl(market.image_uri);

  document.querySelector<HTMLElement>('#trade-placeholder')!.classList.add('hidden');
  document.querySelector<HTMLElement>('#trade-content')!.classList.remove('hidden');

  document.querySelector<HTMLElement>('#trade-ticker')!.textContent = `$${ticker}`;
  document.querySelector<HTMLElement>('#trade-name')!.textContent = market.display_name || ticker;
  document.querySelector<HTMLElement>('#trade-description')!.textContent =
    market.description || 'Meme coin trading on Ultra.';
  document.querySelector<HTMLElement>('#trade-state')!.textContent =
    market.status === 2 ? 'GRADUATED' : market.status === 1 ? 'LIVE' : 'BOOTING';
  document.querySelector<HTMLElement>('#trade-state')!.className = `state-badge state-${market.status}`;
  document.querySelector<HTMLElement>('#trade-price')!.textContent =
    `${currentPrice(market).toFixed(8)} ${PAYMENT_SYMBOL}`;
  document.querySelector<HTMLElement>('#trade-reserve')!.textContent =
    `${assetNumber(market.reserve).toFixed(2)} ${PAYMENT_SYMBOL}`;
  document.querySelector<HTMLElement>('#trade-volume')!.textContent =
    `${assetNumber(market.volume).toFixed(2)} ${PAYMENT_SYMBOL}`;
  document.querySelector<HTMLElement>('#trade-progress')!.textContent = `${pct.toFixed(1)}%`;
  document.querySelector<HTMLElement>('#trade-progress-copy')!.textContent = `${pct.toFixed(1)}%`;
  document.querySelector<HTMLElement>('#trade-progress-bar')!.style.width = `${pct}%`;
  document.querySelector<HTMLElement>('#sell-symbol')!.textContent = ticker;

  const logoElement = document.querySelector<HTMLElement>('#trade-logo')!;
  logoElement.innerHTML = logo ? `<img src="${logo}" alt="" />` : escapeHtml(ticker.slice(0, 2));

  setTradeEnabled();
  renderMarkets(allMarkets);

  if (window.innerWidth < 980) {
    document.querySelector<HTMLElement>('#trade-panel')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function refreshMarkets() {
  const target = status('#market-status');

  try {
    allMarkets = await fetchMarkets();
    renderStats(allMarkets);
    renderMarkets(allMarkets);

    if (selectedMarket) {
      const fresh = allMarkets.find((market) => Number(market.id) === Number(selectedMarket!.id));
      if (fresh) selectMarket(fresh);
    } else {
      const first = filteredMarkets(allMarkets)[0];
      if (first && window.innerWidth >= 980) selectMarket(first);
    }

    showStatus(target, `${allMarkets.length} market${allMarkets.length === 1 ? '' : 's'} loaded from Ultra.`, 'ok');
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
}

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true;

  try {
    if (!('ultra' in window)) throw new Error('Ultra Wallet Extension was not detected.');

    const chain = await wallet.getChainId();

    if (chain.data !== ULTRA_TESTNET_CHAIN_ID) {
      if (chain.data === ULTRA_MAINNET_CHAIN_ID) {
        connectButton.textContent = 'Switching to Testnet…';
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

    connectButton.textContent = compactAccount(account);
    connectButton.classList.add('connected');
    setTradeEnabled();
    if (selectedMarket) showStatus(status('#trade-status'), 'Wallet connected.', 'ok');
  } catch (err: unknown) {
    account = undefined;
    connectButton.textContent = 'Connect Ultra Wallet';
    connectButton.classList.remove('connected');
    setTradeEnabled();
    if (selectedMarket) showStatus(status('#trade-status'), errorMessage(err), 'error');
  } finally {
    connectButton.disabled = false;
  }
});

buyButton.addEventListener('click', async () => {
  const target = status('#trade-status');

  if (!account || !selectedMarket) {
    showStatus(target, 'Connect your wallet and select a live meme.', 'error');
    return;
  }

  if (selectedMarket.status !== 1) {
    showStatus(target, 'This market is not open for bonding-curve trading.', 'error');
    return;
  }

  try {
    buyButton.disabled = true;
    buyButton.textContent = 'Approve in wallet…';
    const amount = document.querySelector<HTMLInputElement>('#buy-amount')!.value;

    const hash = await sign(PAYMENT_CONTRACT, 'transfer', {
      from: account,
      to: PAD_CONTRACT,
      quantity: formatAmount(amount, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      memo: `buy:${selectedMarket.id}`,
    });

    showStatus(target, `Buy submitted · ${hash}`, 'ok');
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    setTradeEnabled();
  }
});

sellButton.addEventListener('click', async () => {
  const target = status('#trade-status');

  if (!account || !selectedMarket) {
    showStatus(target, 'Connect your wallet and select a live meme.', 'error');
    return;
  }

  if (selectedMarket.status !== 1) {
    showStatus(target, 'This market is not open for bonding-curve trading.', 'error');
    return;
  }

  try {
    sellButton.disabled = true;
    sellButton.textContent = 'Approve in wallet…';

    const ticker = symbolCode(selectedMarket.token_symbol);
    const decimals = symbolPrecision(selectedMarket.token_symbol);
    const amount = document.querySelector<HTMLInputElement>('#sell-amount')!.value;
    const tokenContract = selectedMarket.token_contract || FALLBACK_TOKEN_CONTRACT;

    const hash = await sign(tokenContract, 'transfer', {
      from: account,
      to: PAD_CONTRACT,
      quantity: formatAmount(amount, decimals, ticker),
      memo: `sell:${selectedMarket.id}`,
    });

    showStatus(target, `Sell submitted · ${hash}`, 'ok');
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    setTradeEnabled();
  }
});

function openCreateModal() {
  createModal.classList.remove('hidden');
  createModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.querySelector<HTMLInputElement>('#create-name')!.focus();
}

function closeCreateModal() {
  createModal.classList.add('hidden');
  createModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

createButton.addEventListener('click', openCreateModal);
heroCreateButton.addEventListener('click', openCreateModal);
document.querySelector<HTMLButtonElement>('#close-create')!.addEventListener('click', closeCreateModal);

createModal.addEventListener('click', (event) => {
  if (event.target === createModal) closeCreateModal();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !createModal.classList.contains('hidden')) closeCreateModal();
});

document.querySelector<HTMLInputElement>('#create-image')!.addEventListener('input', (event) => {
  const uri = (event.currentTarget as HTMLInputElement).value.trim();
  const logo = imageUrl(uri);
  const preview = document.querySelector<HTMLElement>('#create-image-preview')!;
  preview.innerHTML = logo ? `<img src="${logo}" alt="" />` : '#';
});

document.querySelector<HTMLFormElement>('#create-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  const target = status('#create-status');
  if (!account) {
    showStatus(target, 'Connect your Ultra Wallet first.', 'error');
    return;
  }

  const creator = account;
  const name = document.querySelector<HTMLInputElement>('#create-name')!.value.trim();
  const symbol = document.querySelector<HTMLInputElement>('#create-symbol')!.value.trim().toUpperCase();
  const image = document.querySelector<HTMLInputElement>('#create-image')!.value.trim();
  const description = document.querySelector<HTMLTextAreaElement>('#create-description')!.value.trim();
  const website = document.querySelector<HTMLInputElement>('#create-website')!.value.trim();
  const xUrl = document.querySelector<HTMLInputElement>('#create-x')!.value.trim();
  const telegram = document.querySelector<HTMLInputElement>('#create-telegram')!.value.trim();
  const initialBuyRaw =
    document.querySelector<HTMLInputElement>('#create-initial-buy')!.value.trim() || '0';

  if (!name || utf8Length(name) > 64) {
    showStatus(target, 'Name must be between 1 and 64 UTF-8 bytes.', 'error');
    return;
  }

  if (!/^[A-Z]{1,7}$/.test(symbol)) {
    showStatus(target, 'Ticker must be 1–7 letters.', 'error');
    return;
  }

  createSubmit.disabled = true;

  try {
    const supply = formatAmount(TOTAL_SUPPLY, TOKEN_DECIMALS, symbol);

    createSubmit.textContent = '1/4 · Creating token…';
    showStatus(target, 'Approve token creation in Ultra Wallet.');
    await sign(FALLBACK_TOKEN_CONTRACT, 'launch', {
      issuer: creator,
      maximum_supply: supply,
      initial_supply: supply,
      token_name: name,
      metadata_uri: image,
    });

    createSubmit.textContent = '2/4 · Creating market…';
    showStatus(target, 'Approve the Hashed40 bonding-curve market.');
    await sign(PAD_CONTRACT, 'createmarket', {
      creator,
      token_symbol: `${TOKEN_DECIMALS},${symbol}`,
      token_allocation: formatAmount(CURVE_ALLOCATION, TOKEN_DECIMALS, symbol),
      start_price: formatAmount(START_PRICE, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      end_price: formatAmount(END_PRICE, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      graduation_target: formatAmount(GRADUATION_TARGET, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
      display_name: name,
      image_uri: image,
      description,
      website,
      x_url: xUrl,
      telegram_url: telegram,
    });

    showStatus(target, 'Waiting for the new meme market to appear on Ultra…');
    const market = await waitForMarket(creator, symbol);
    const marketId = Number(market.id);

    createSubmit.textContent = '3/4 · Seeding curve…';
    showStatus(target, 'Approve the meme supply deposit into the curve.');
    await sign(FALLBACK_TOKEN_CONTRACT, 'transfer', {
      from: creator,
      to: PAD_CONTRACT,
      quantity: formatAmount(CURVE_ALLOCATION, TOKEN_DECIMALS, symbol),
      memo: `seed:${marketId}`,
    });

    createSubmit.textContent = '4/4 · Going live…';
    showStatus(target, 'Approve trading activation.');
    await sign(PAD_CONTRACT, 'activate', { market_id: marketId });

    const initialBuy = Number(initialBuyRaw);
    if (Number.isFinite(initialBuy) && initialBuy > 0) {
      createSubmit.textContent = 'Initial buy…';
      showStatus(target, 'Meme is live. Approve your optional first buy.');
      await sign(PAYMENT_CONTRACT, 'transfer', {
        from: creator,
        to: PAD_CONTRACT,
        quantity: formatAmount(initialBuyRaw, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
        memo: `buy:${marketId}`,
      });
    }

    showStatus(target, `$${symbol} is live on Hashed40.`, 'ok');
    activeFilter = 'new';
    await refreshMarkets();

    const live = allMarkets.find((item) => Number(item.id) === marketId);
    if (live) selectMarket(live);

    setTimeout(() => {
      closeCreateModal();
      document.querySelector('#markets')!.scrollIntoView({ behavior: 'smooth' });
    }, 700);
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  } finally {
    createSubmit.disabled = !account;
    createSubmit.textContent = account ? 'Launch meme' : 'Connect wallet to create';
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

document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#buy-amount')!.value = button.dataset.buy || '10';
  });
});

function setFilter(filter: typeof activeFilter) {
  activeFilter = filter;
  document.querySelectorAll<HTMLButtonElement>('.filter').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
  document.querySelectorAll<HTMLButtonElement>('.nav-chip').forEach((button) => {
    button.classList.toggle('active', button.dataset.filterJump === filter);
  });
  renderMarkets(allMarkets);
}

document.querySelectorAll<HTMLButtonElement>('.filter').forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter as typeof activeFilter));
});

document.querySelectorAll<HTMLButtonElement>('[data-filter-jump]').forEach((button) => {
  button.addEventListener('click', () => {
    setFilter(button.dataset.filterJump as typeof activeFilter);
    document.querySelector('#markets')!.scrollIntoView({ behavior: 'smooth' });
  });
});

document.querySelector<HTMLInputElement>('#market-search')!.addEventListener('input', (event) => {
  searchTerm = (event.currentTarget as HTMLInputElement).value.trim();
  renderMarkets(allMarkets);
});

document.querySelector<HTMLButtonElement>('#refresh')!.addEventListener('click', () => void refreshMarkets());

setTradeEnabled();
void refreshMarkets();
