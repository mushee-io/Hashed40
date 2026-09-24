import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const PAD_CONTRACT = import.meta.env.VITE_LAUNCHPAD_ACCOUNT || '1aa2aa3aa4wp';
const TOKEN_FACTORY =
  import.meta.env.VITE_TOKEN_FACTORY_ACCOUNT ||
  import.meta.env.VITE_CONTRACT_ACCOUNT ||
  '1aa2aa3aa4wo';
const PAYMENT_CONTRACT = import.meta.env.VITE_PAYMENT_CONTRACT || 'eosio.token';
const PAYMENT_SYMBOL = import.meta.env.VITE_PAYMENT_SYMBOL || 'UOS';
const PAYMENT_DECIMALS = Number(import.meta.env.VITE_PAYMENT_DECIMALS || 8);
const RPC_URL = import.meta.env.VITE_ULTRA_RPC_URL || 'https://test.ultra.eosusa.io';

const RPC_URLS = Array.from(
  new Set([
    RPC_URL,
    'https://test.ultra.eosusa.io',
    'https://api.testnet.ultra.eossweden.org',
    'https://ultra-testnet.eosphere.io',
  ]),
);

const ULTRA_MAINNET_CHAIN_ID =
  'a9c481dfbc7d9506dc7e87e9a137c931b0a9303f64fd7a1d08b8230133920097';
const ULTRA_TESTNET_CHAIN_ID =
  '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';

const TOKEN_DECIMALS = 8;
const TOTAL_SUPPLY = '1000000000';
const CURVE_ALLOCATION = '1000000000';
const START_PRICE = '0.000001';

type StatusKind = 'ok' | 'error' | 'info';
type HomeFilter = 'recent' | 'newest' | 'cap' | 'volume' | 'graduating';

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

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
const app = document.querySelector<HTMLDivElement>('#app')!;

let account: string | undefined;
let allMarkets: MarketRow[] = [];
let selectedMarket: MarketRow | undefined;
let activeFilter: HomeFilter = 'recent';
let searchTerm = '';
let currentPage = 1;
const PAGE_SIZE = 15;

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[char]!,
  );
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { message?: string; data?: unknown };
    if (typeof maybe.data === 'string') return maybe.data;
    if (typeof maybe.message === 'string') return maybe.message;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Transaction failed.';
    }
  }
  return String(err);
}

function compactAccount(value: string) {
  return value.length <= 14 ? value : value.slice(0, 6) + '…' + value.slice(-4);
}

function utf8Length(value: string) {
  return new TextEncoder().encode(value).length;
}

function formatAmount(raw: string, decimals: number, symbol: string): string {
  const value = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a valid amount.');

  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new Error(\`Use no more than \${decimals} decimal places.\`);
  }

  return \`\${whole}.\${fraction.padEnd(decimals, '0')} \${symbol}\`;
}

function assetNumber(asset: string): number {
  const value = Number(String(asset || '0').split(' ')[0]);
  return Number.isFinite(value) ? value : 0;
}

function symbolCode(symbol: string) {
  return String(symbol || '').split(',').pop() || '';
}

function symbolPrecision(symbol: string) {
  const precision = Number(String(symbol || '').split(',')[0]);
  return Number.isFinite(precision) ? precision : TOKEN_DECIMALS;
}

function imageUrl(uri: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) return \`https://ipfs.io/ipfs/\${uri.slice(7)}\`;
  if (/^https?:\/\//i.test(uri)) return uri;
  return undefined;
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000_000) return \`\${(value / 1_000_000_000).toFixed(1)}B\`;
  if (Math.abs(value) >= 1_000_000) return \`\${(value / 1_000_000).toFixed(1)}M\`;
  if (Math.abs(value) >= 1_000) return \`\${(value / 1_000).toFixed(1)}K\`;
  if (Math.abs(value) >= 1) return value.toFixed(value >= 100 ? 0 : 2);
  return value.toFixed(6);
}

function progress(market: MarketRow): number {
  const target = assetNumber(market.graduation_target);
  if (target <= 0) return 0;
  if (market.status === 2) return 100;
  return Math.max(0, Math.min(100, (assetNumber(market.reserve) / target) * 100));
}

function currentPrice(market: MarketRow): number {
  const allocation = assetNumber(market.token_allocation);
  const sold = assetNumber(market.sold);
  const start = assetNumber(market.start_price);
  const end = assetNumber(market.end_price);

  if (allocation <= 0) return start;
  const ratio = Math.max(0, Math.min(1, sold / allocation));
  return start + (end - start) * ratio;
}

function estimatedMarketCap(market: MarketRow) {
  return currentPrice(market) * Number(TOTAL_SUPPLY);
}

function statusLabel(market: MarketRow) {
  if (market.status === 2) return 'Graduated';
  if (market.status === 1) return 'Live';
  return 'Booting';
}

function marketImage(market: MarketRow, className = '') {
  const src = imageUrl(market.image_uri);
  const ticker = escapeHtml(symbolCode(market.token_symbol).slice(0, 2) || '#');
  if (src) {
    return \`<img class="\${className}" src="\${escapeHtml(src)}" alt="" loading="lazy" />\`;
  }
  return \`<div class="image-fallback \${className}"><span>\${ticker}</span></div>\`;
}

function showStatus(element: HTMLElement | null, message: string, kind: StatusKind = 'info') {
  if (!element) return;
  element.className = \`status \${kind}\`;
  element.textContent = message;
}

function setOnline(isOnline: boolean) {
  document.querySelectorAll<HTMLElement>('[data-network-status]').forEach((node) => {
    node.textContent = isOnline ? 'Online' : 'RPC issue';
    node.classList.toggle('offline', !isOnline);
  });
}

async function fetchMarkets(): Promise<MarketRow[]> {
  let lastError = 'Ultra Testnet RPC unavailable.';

  for (const rpcUrl of RPC_URLS) {
    try {
      const response = await fetch(\`\${rpcUrl}/v1/chain/get_table_rows\`, {
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

      const text = await response.text();
      if (!response.ok) {
        lastError = \`\${rpcUrl} returned \${response.status}\`;
        continue;
      }

      const parsed = JSON.parse(text) as { rows?: MarketRow[] };
      setOnline(true);
      return Array.isArray(parsed.rows) ? parsed.rows : [];
    } catch (err) {
      lastError = errorMessage(err);
    }
  }

  setOnline(false);
  throw new Error(\`Could not reach the Hashed40 market table. \${lastError}\`);
}

async function waitForMarket(creator: string, symbol: string): Promise<MarketRow> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const markets = await fetchMarkets();
    const match = markets
      .slice()
      .reverse()
      .find(
        (market) =>
          market.creator === creator &&
          symbolCode(market.token_symbol).toUpperCase() === symbol.toUpperCase(),
      );

    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  throw new Error('The meme token was created, but its market has not appeared yet. Refresh in a moment.');
}

async function sign(contract: string, action: string, data: Record<string, unknown>): Promise<string> {
  if (!account) throw new Error('Connect your Ultra Wallet first.');
  const response = await wallet.signTransaction({ contract, action, data });
  return response.data.transactionHash || 'submitted';
}

async function connectWallet() {
  if (!('ultra' in window)) {
    throw new Error('Ultra Wallet Extension was not detected.');
  }

  const chain = await wallet.getChainId();
  if (!chain.data) {
    throw new Error('Ultra Wallet could not reach its current network. Unlock it, select Testnet, then try again.');
  }

  if (chain.data !== ULTRA_TESTNET_CHAIN_ID) {
    if (chain.data === ULTRA_MAINNET_CHAIN_ID) {
      throw new Error('Ultra Wallet is on Mainnet. Switch to Testnet, then connect again.');
    }
    throw new Error('Ultra Wallet is not on Ultra Testnet. Switch the extension to Testnet, then connect again.');
  }

  const { data } = await wallet.connect();
  const connectedAccount = data.blockchainid;

  if (!connectedAccount) throw new Error('Ultra Testnet account was not returned by the wallet.');
  if (connectedAccount === PAD_CONTRACT) {
    throw new Error(
      \`\${PAD_CONTRACT} is the Hash40 contract/admin account. Switch Ultra Wallet to a different Testnet user account.\`,
    );
  }

  account = connectedAccount;
  syncWalletButtons();
  return connectedAccount;
}

function syncWalletButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-connect-wallet]').forEach((button) => {
    button.textContent = account ? compactAccount(account) : 'Connect';
    button.classList.toggle('connected', Boolean(account));
  });

  const launch = document.querySelector<HTMLButtonElement>('#create-submit');
  if (launch) {
    launch.disabled = !account;
    launch.textContent = account ? 'Launch meme on Ultra' : 'Connect wallet to launch';
  }

  const buy = document.querySelector<HTMLButtonElement>('#buy-button');
  const sell = document.querySelector<HTMLButtonElement>('#sell-button');
  if (buy) buy.disabled = !account || selectedMarket?.status !== 1;
  if (sell) sell.disabled = !account || selectedMarket?.status !== 1;
}

function bindWalletButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-connect-wallet]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await connectWallet();
        toast('Ultra Testnet wallet connected.', 'ok');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });
}

function toast(message: string, kind: StatusKind = 'info') {
  let node = document.querySelector<HTMLDivElement>('#global-toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'global-toast';
    document.body.appendChild(node);
  }

  node.className = \`global-toast \${kind} visible\`;
  node.textContent = message;
  window.setTimeout(() => node?.classList.remove('visible'), 3600);
}

function brandMarkup() {
  return \`
    <a class="brand" href="/" aria-label="Hashed40 home">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <strong>HASH40</strong>
    </a>
  \`;
}

function topBarMarkup(createMode = false) {
  return \`
    <header class="topbar">
      <div class="topbar-inner">
        \${brandMarkup()}
        <div class="nav-search">
          <span>⌕</span>
          <input id="nav-search" type="search" placeholder="Search memes…" autocomplete="off" />
          <kbd>/</kbd>
        </div>
        <div class="top-actions">
          <button class="network-chip" type="button"><span class="ultra-dot">U</span> Ultra</button>
          <button class="language-chip" type="button" title="English">EN</button>
          <button class="boost-button" type="button">Boost</button>
          \${createMode ? '<a class="create-button nav-create" href="/">Explore</a>' : '<button class="create-button nav-create" type="button" data-open-launch>Create Meme +</button>'}
          <button class="wallet-button" type="button" data-connect-wallet>Connect</button>
          <button class="menu-button" type="button" aria-label="Menu">☰</button>
        </div>
      </div>
    </header>
  \`;
}

function tickerMarkup() {
  return \`
    <div class="market-ticker" aria-label="Live meme market ticker">
      <div id="ticker-track" class="ticker-track">
        <span class="ticker-empty">Loading Ultra markets…</span>
      </div>
    </div>
  \`;
}

function bottomBarMarkup() {
  return \`
    <div class="bottom-status">
      <div><strong>Watchlist</strong><span>No memes in watchlist</span></div>
      <div class="bottom-right">
        <span class="chain-balance">UOS · Ultra Testnet</span>
        <span class="online"><i></i><b data-network-status>Connecting</b></span>
      </div>
    </div>
  \`;
}

function renderTicker(markets: MarketRow[]) {
  const track = document.querySelector<HTMLDivElement>('#ticker-track');
  if (!track) return;

  const source = markets
    .slice()
    .sort((a, b) => assetNumber(b.volume) - assetNumber(a.volume))
    .slice(0, 10);

  if (!source.length) {
    track.innerHTML = '<span class="ticker-empty">Ultra Testnet · No live meme markets yet</span>';
    return;
  }

  const items = source
    .map((market) => {
      const ticker = escapeHtml(symbolCode(market.token_symbol));
      const price = currentPrice(market);
      const image = imageUrl(market.image_uri);
      return \`
        <span class="ticker-item">
          <span class="ticker-avatar">\${image ? \`<img src="\${escapeHtml(image)}" alt="" />\` : ticker.slice(0, 1)}</span>
          <strong>\${ticker}</strong>
          <span>\${price.toFixed(8)} \${PAYMENT_SYMBOL}</span>
        </span>
      \`;
    })
    .join('');

  track.innerHTML = items + items;
}

function renderTrending(markets: MarketRow[]) {
  const root = document.querySelector<HTMLDivElement>('#trending-row');
  if (!root) return;

  const trending = markets
    .slice()
    .sort((a, b) => {
      const scoreA = assetNumber(a.volume) + progress(a) * 10;
      const scoreB = assetNumber(b.volume) + progress(b) * 10;
      return scoreB - scoreA;
    })
    .slice(0, 4);

  if (!trending.length) {
    root.innerHTML = \`
      <div class="trending-empty">
        <strong>No trending memes yet.</strong>
        <span>The first live Hashed40 markets will appear here.</span>
      </div>
    \`;
    return;
  }

  root.innerHTML = trending
    .map((market) => {
      const ticker = symbolCode(market.token_symbol);
      return \`
        <button class="trending-card" type="button" data-market-id="\${market.id}">
          <div class="trending-image">\${marketImage(market)}</div>
          <div class="trending-copy">
            <div class="trend-title">
              <strong>\${escapeHtml(market.display_name || ticker)}</strong>
              <span>$\${escapeHtml(ticker)}</span>
            </div>
            <div class="trend-cap">
              <strong>\${formatCompact(estimatedMarketCap(market))} \${PAYMENT_SYMBOL}</strong>
              <span class="\${market.status === 2 ? 'positive' : ''}">\${statusLabel(market)}</span>
            </div>
            <div class="trend-meta">
              <span>Vol \${formatCompact(assetNumber(market.volume))}</span>
              <span>Curve \${progress(market).toFixed(0)}%</span>
            </div>
          </div>
        </button>
      \`;
    })
    .join('');

  root.querySelectorAll<HTMLButtonElement>('[data-market-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const market = markets.find((item) => String(item.id) === button.dataset.marketId);
      if (market) openTradeDrawer(market);
    });
  });
}

function filteredMarkets() {
  let copy = allMarkets.slice();

  if (searchTerm) {
    const needle = searchTerm.toLowerCase();
    copy = copy.filter((market) => {
      const ticker = symbolCode(market.token_symbol).toLowerCase();
      return (
        market.display_name.toLowerCase().includes(needle) ||
        ticker.includes(needle) ||
        market.creator.toLowerCase().includes(needle)
      );
    });
  }

  if (activeFilter === 'recent' || activeFilter === 'newest') {
    copy.sort((a, b) => Number(b.created_at) - Number(a.created_at));
  } else if (activeFilter === 'cap') {
    copy.sort((a, b) => estimatedMarketCap(b) - estimatedMarketCap(a));
  } else if (activeFilter === 'volume') {
    copy.sort((a, b) => assetNumber(b.volume) - assetNumber(a.volume));
  } else if (activeFilter === 'graduating') {
    copy = copy.filter((market) => market.status !== 2).sort((a, b) => progress(b) - progress(a));
  }

  return copy;
}

function renderMarketGrid() {
  const root = document.querySelector<HTMLDivElement>('#market-grid');
  const pagination = document.querySelector<HTMLDivElement>('#pagination');
  const resultCount = document.querySelector<HTMLElement>('#market-result-count');
  if (!root || !pagination) return;

  const filtered = filteredMarkets();
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  if (resultCount) {
    resultCount.textContent = \`\${filtered.length} meme\${filtered.length === 1 ? '' : 's'}\`;
  }

  if (!rows.length) {
    root.innerHTML = \`
      <div class="market-empty">
        <strong>No memes found.</strong>
        <span>Launch the first one or change your filters.</span>
        <button type="button" data-open-launch>Create Meme</button>
      </div>
    \`;
    root.querySelector<HTMLButtonElement>('[data-open-launch]')?.addEventListener('click', openLaunchModal);
  } else {
    root.innerHTML = rows
      .map((market) => {
        const ticker = symbolCode(market.token_symbol);
        const pct = progress(market);
        return \`
          <button class="meme-card" type="button" data-market-id="\${market.id}">
            <div class="meme-card-image">
              \${marketImage(market)}
              <span class="card-status">\${statusLabel(market)}</span>
              <span class="card-chain">U</span>
            </div>
            <div class="meme-card-body">
              <strong class="meme-name">\${escapeHtml(market.display_name || ticker)}</strong>
              <span class="meme-ticker">$\${escapeHtml(ticker)}</span>
              <div class="meme-metrics">
                <strong>\${formatCompact(estimatedMarketCap(market))} <small>MC</small></strong>
                <span class="\${market.status === 2 ? 'positive' : 'muted'}">\${market.status === 2 ? 'Graduated' : \`\${pct.toFixed(1)}%\`}</span>
              </div>
              <div class="bonding-line"><i style="width:\${pct}%"></i></div>
              <div class="bonding-copy"><span>Bonding</span><span>\${pct.toFixed(0)}%</span></div>
            </div>
          </button>
        \`;
      })
      .join('');

    root.querySelectorAll<HTMLButtonElement>('[data-market-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const market = allMarkets.find((item) => String(item.id) === button.dataset.marketId);
        if (market) openTradeDrawer(market);
      });
    });
  }

  const pageNumbers = Array.from({ length: Math.min(pages, 5) }, (_, index) => index + 1);
  pagination.innerHTML = \`
    <button type="button" data-page="\${Math.max(1, currentPage - 1)}" \${currentPage === 1 ? 'disabled' : ''}>←</button>
    \${pageNumbers
      .map(
        (page) =>
          \`<button type="button" data-page="\${page}" class="\${page === currentPage ? 'active' : ''}">\${page}</button>\`,
      )
      .join('')}
    \${pages > 5 ? '<span>…</span>' : ''}
    \${pages > 5 ? \`<button type="button" data-page="\${pages}">\${pages}</button>\` : ''}
    <button type="button" data-page="\${Math.min(pages, currentPage + 1)}" \${currentPage === pages ? 'disabled' : ''}>→</button>
  \`;

  pagination.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page || 1);
      renderMarketGrid();
      document.querySelector('#explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function openLaunchModal() {
  const modal = document.querySelector<HTMLElement>('#launch-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeLaunchModal() {
  const modal = document.querySelector<HTMLElement>('#launch-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function openTradeDrawer(market: MarketRow) {
  selectedMarket = market;
  const drawer = document.querySelector<HTMLElement>('#trade-drawer');
  if (!drawer) return;

  const ticker = symbolCode(market.token_symbol);
  const pct = progress(market);
  const src = imageUrl(market.image_uri);

  document.querySelector<HTMLElement>('#trade-image')!.innerHTML = src
    ? \`<img src="\${escapeHtml(src)}" alt="" />\`
    : \`<div class="image-fallback"><span>\${escapeHtml(ticker.slice(0, 2))}</span></div>\`;
  document.querySelector<HTMLElement>('#trade-name')!.textContent = market.display_name || ticker;
  document.querySelector<HTMLElement>('#trade-ticker')!.textContent = '$' + ticker;
  document.querySelector<HTMLElement>('#trade-description')!.textContent =
    market.description || 'Meme market on Ultra.';
  document.querySelector<HTMLElement>('#trade-price')!.textContent =
    \`\${currentPrice(market).toFixed(8)} \${PAYMENT_SYMBOL}\`;
  document.querySelector<HTMLElement>('#trade-cap')!.textContent =
    \`\${formatCompact(estimatedMarketCap(market))} \${PAYMENT_SYMBOL}\`;
  document.querySelector<HTMLElement>('#trade-volume')!.textContent =
    \`\${formatCompact(assetNumber(market.volume))} \${PAYMENT_SYMBOL}\`;
  document.querySelector<HTMLElement>('#trade-reserve')!.textContent =
    \`\${formatCompact(assetNumber(market.reserve))} \${PAYMENT_SYMBOL}\`;
  document.querySelector<HTMLElement>('#trade-progress')!.textContent = \`\${pct.toFixed(1)}%\`;
  document.querySelector<HTMLElement>('#trade-progress-bar')!.style.width = \`\${pct}%\`;
  document.querySelector<HTMLElement>('#sell-symbol')!.textContent = ticker;
  document.querySelector<HTMLElement>('#trade-market-state')!.textContent = statusLabel(market);

  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  syncWalletButtons();
}

function closeTradeDrawer() {
  document.querySelector<HTMLElement>('#trade-drawer')?.classList.remove('open');
  document.querySelector<HTMLElement>('#trade-drawer')?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
}

async function refreshHome() {
  const state = document.querySelector<HTMLElement>('#market-status');
  showStatus(state, 'Reading Hashed40 markets from Ultra Testnet…');

  try {
    allMarkets = await fetchMarkets();
    renderTicker(allMarkets);
    renderTrending(allMarkets);
    renderMarketGrid();
    showStatus(state, \`\${allMarkets.length} on-chain market\${allMarkets.length === 1 ? '' : 's'} loaded.\`, 'ok');
  } catch (err) {
    renderTicker([]);
    allMarkets = [];
    renderTrending([]);
    renderMarketGrid();
    showStatus(state, errorMessage(err), 'error');
  }
}

function renderHome() {
  document.title = 'Hashed40 — Trade Memes on Ultra';
  app.innerHTML = \`
    \${topBarMarkup(false)}
    \${tickerMarkup()}

    <main class="page-shell home-shell">
      <section class="product-hero">
        <div>
          <h1>Trade memes on Ultra.</h1>
          <p>Discover. Launch. Trade.<br /><strong>Built natively on Ultra.</strong></p>
        </div>
        <button class="hero-create" type="button" data-open-launch>Create Meme</button>
      </section>

      <section class="trending-section">
        <div class="section-heading">
          <h2>Trending memes</h2>
          <span>On-chain activity</span>
        </div>
        <div id="trending-row" class="trending-row"></div>
      </section>

      <section id="explore" class="explore-section">
        <div class="explore-head">
          <div>
            <h2>Explore</h2>
            <span id="market-result-count">0 memes</span>
          </div>
          <div class="explore-right">
            <button class="select-chip" type="button">All memes⌄</button>
            <div class="timeframes" title="Historical timeframe data is not available from the current contract">
              <button class="active" type="button">24h</button>
              <button type="button" disabled>6h</button>
              <button type="button" disabled>1h</button>
              <button type="button" disabled>5m</button>
            </div>
          </div>
        </div>

        <div class="explore-toolbar">
          <div class="filter-row">
            <button class="filter-pill active" type="button" data-filter="recent">Recent</button>
            <button class="filter-pill" type="button" data-filter="newest">Newest</button>
            <button class="filter-pill" type="button" data-filter="cap">Market cap</button>
            <button class="filter-pill" type="button" data-filter="volume">Volume</button>
            <button class="filter-pill" type="button" data-filter="graduating">Graduating</button>
          </div>
        </div>

        <div id="market-status" class="status market-status"></div>
        <div id="market-grid" class="meme-grid"></div>
        <div id="pagination" class="pagination"></div>
      </section>
    </main>

    <div id="launch-modal" class="modal-layer hidden" aria-hidden="true">
      <div class="launch-modal" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <button id="close-launch" class="modal-close" type="button" aria-label="Close">×</button>
        <h2 id="launch-title">Launch your meme</h2>
        <p>Choose how your meme trades.</p>

        <div class="launch-options">
          <button class="launch-option selected" type="button">
            <span class="option-check">✓</span>
            <span class="ultra-orb">U</span>
            <strong>ULTRA Launch</strong>
            <small>Trade against UOS</small>
            <ul>
              <li>Buy & sell with UOS</li>
              <li>Native bonding curve</li>
              <li>Ultra Testnet settlement</li>
              <li>Launch immediately</li>
            </ul>
          </button>
        </div>

        <a class="continue-launch" href="/create">Continue with Ultra</a>
      </div>
    </div>

    <aside id="trade-drawer" class="trade-drawer" aria-hidden="true">
      <button id="close-trade" class="drawer-close" type="button">×</button>
      <div id="trade-image" class="trade-hero-image"></div>
      <div class="trade-title-row">
        <div>
          <span id="trade-ticker"></span>
          <h2 id="trade-name"></h2>
        </div>
        <span id="trade-market-state" class="trade-state"></span>
      </div>
      <p id="trade-description" class="trade-description"></p>

      <div class="trade-metrics">
        <div><span>Price</span><strong id="trade-price">—</strong></div>
        <div><span>Market cap</span><strong id="trade-cap">—</strong></div>
        <div><span>Volume</span><strong id="trade-volume">—</strong></div>
        <div><span>Reserve</span><strong id="trade-reserve">—</strong></div>
      </div>

      <div class="trade-curve">
        <div><span>Bonding curve</span><strong id="trade-progress">0%</strong></div>
        <div class="bonding-line"><i id="trade-progress-bar"></i></div>
      </div>

      <div class="trade-tabs">
        <button id="buy-tab" class="active" type="button">Buy</button>
        <button id="sell-tab" type="button">Sell</button>
      </div>

      <div id="buy-panel" class="order-panel">
        <label>Spend
          <div class="trade-input"><input id="buy-amount" inputmode="decimal" value="1" /><span>\${PAYMENT_SYMBOL}</span></div>
        </label>
        <div class="quick-row">
          <button type="button" data-buy="1">1</button>
          <button type="button" data-buy="5">5</button>
          <button type="button" data-buy="10">10</button>
          <button type="button" data-buy="25">25</button>
        </div>
        <button id="buy-button" class="trade-cta buy" type="button" disabled>Buy meme</button>
      </div>

      <div id="sell-panel" class="order-panel hidden">
        <label>Sell
          <div class="trade-input"><input id="sell-amount" inputmode="decimal" value="1" /><span id="sell-symbol">MEME</span></div>
        </label>
        <button id="sell-button" class="trade-cta sell" type="button" disabled>Sell meme</button>
      </div>

      <div id="trade-status" class="status"></div>
    </aside>
    <div id="drawer-scrim" class="drawer-scrim"></div>

    \${bottomBarMarkup()}
  \`;

  bindWalletButtons();

  document.querySelectorAll<HTMLButtonElement>('[data-open-launch]').forEach((button) => {
    button.addEventListener('click', openLaunchModal);
  });
  document.querySelector<HTMLButtonElement>('#close-launch')?.addEventListener('click', closeLaunchModal);
  document.querySelector<HTMLElement>('#launch-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeLaunchModal();
  });

  document.querySelector<HTMLButtonElement>('.boost-button')?.addEventListener('click', () => {
    toast('Boost campaigns are coming soon.', 'info');
  });

  const search = document.querySelector<HTMLInputElement>('#nav-search');
  search?.addEventListener('input', () => {
    searchTerm = search.value.trim().toLowerCase();
    currentPage = 1;
    renderMarketGrid();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter as HomeFilter;
      currentPage = 1;
      document.querySelectorAll('[data-filter]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      renderMarketGrid();
    });
  });

  document.querySelector<HTMLButtonElement>('#close-trade')?.addEventListener('click', closeTradeDrawer);
  document.querySelector<HTMLDivElement>('#drawer-scrim')?.addEventListener('click', closeTradeDrawer);

  document.querySelector<HTMLButtonElement>('#buy-tab')?.addEventListener('click', () => {
    document.querySelector('#buy-tab')?.classList.add('active');
    document.querySelector('#sell-tab')?.classList.remove('active');
    document.querySelector('#buy-panel')?.classList.remove('hidden');
    document.querySelector('#sell-panel')?.classList.add('hidden');
  });
  document.querySelector<HTMLButtonElement>('#sell-tab')?.addEventListener('click', () => {
    document.querySelector('#sell-tab')?.classList.add('active');
    document.querySelector('#buy-tab')?.classList.remove('active');
    document.querySelector('#sell-panel')?.classList.remove('hidden');
    document.querySelector('#buy-panel')?.classList.add('hidden');
  });

  document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.querySelector<HTMLInputElement>('#buy-amount');
      if (input) input.value = button.dataset.buy || '1';
    });
  });

  document.querySelector<HTMLButtonElement>('#buy-button')?.addEventListener('click', async () => {
    const target = document.querySelector<HTMLElement>('#trade-status');
    if (!account || !selectedMarket) {
      showStatus(target, 'Connect your wallet and choose a live market.', 'error');
      return;
    }
    if (selectedMarket.status !== 1) {
      showStatus(target, 'This market is not live.', 'error');
      return;
    }

    const button = document.querySelector<HTMLButtonElement>('#buy-button')!;
    try {
      button.disabled = true;
      button.textContent = 'Approve in wallet…';
      const amount = document.querySelector<HTMLInputElement>('#buy-amount')!.value;
      const hash = await sign(PAYMENT_CONTRACT, 'transfer', {
        from: account,
        to: PAD_CONTRACT,
        quantity: formatAmount(amount, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
        memo: \`buy:\${selectedMarket.id}\`,
      });
      showStatus(target, \`Buy submitted · \${hash}\`, 'ok');
      await refreshHome();
      const fresh = allMarkets.find((market) => String(market.id) === String(selectedMarket?.id));
      if (fresh) openTradeDrawer(fresh);
    } catch (err) {
      showStatus(target, errorMessage(err), 'error');
    } finally {
      button.textContent = 'Buy meme';
      syncWalletButtons();
    }
  });

  document.querySelector<HTMLButtonElement>('#sell-button')?.addEventListener('click', async () => {
    const target = document.querySelector<HTMLElement>('#trade-status');
    if (!account || !selectedMarket) {
      showStatus(target, 'Connect your wallet and choose a live market.', 'error');
      return;
    }
    if (selectedMarket.status !== 1) {
      showStatus(target, 'This market is not live.', 'error');
      return;
    }

    const button = document.querySelector<HTMLButtonElement>('#sell-button')!;
    try {
      button.disabled = true;
      button.textContent = 'Approve in wallet…';
      const ticker = symbolCode(selectedMarket.token_symbol);
      const amount = document.querySelector<HTMLInputElement>('#sell-amount')!.value;
      const tokenContract = selectedMarket.token_contract || TOKEN_FACTORY;
      const hash = await sign(tokenContract, 'transfer', {
        from: account,
        to: PAD_CONTRACT,
        quantity: formatAmount(amount, symbolPrecision(selectedMarket.token_symbol), ticker),
        memo: \`sell:\${selectedMarket.id}\`,
      });
      showStatus(target, \`Sell submitted · \${hash}\`, 'ok');
      await refreshHome();
      const fresh = allMarkets.find((market) => String(market.id) === String(selectedMarket?.id));
      if (fresh) openTradeDrawer(fresh);
    } catch (err) {
      showStatus(target, errorMessage(err), 'error');
    } finally {
      button.textContent = 'Sell meme';
      syncWalletButtons();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeLaunchModal();
      closeTradeDrawer();
    }

    if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      event.preventDefault();
      search?.focus();
    }
  });

  syncWalletButtons();
  void refreshHome();
}

type CurveChoice = 'fair' | 'standard' | 'steep' | 'custom';

function renderCreate() {
  document.title = 'Create Meme — Hashed40';
  app.innerHTML = \`
    \${topBarMarkup(true)}
    \${tickerMarkup()}

    <main class="page-shell create-page">
      <div class="create-page-top">
        <a class="back-button" href="/">← Back</a>
        <button class="wallet-button create-wallet" type="button" data-connect-wallet>Connect wallet</button>
      </div>

      <section class="create-layout">
        <form id="create-form" class="create-workbench">
          <div class="create-form-column">
            <div class="create-title">
              <span>ULTRA LAUNCH</span>
              <h1>Create meme</h1>
              <p>Configure the meme, bonding curve and initial buy. Settlement happens on Ultra Testnet.</p>
            </div>

            <section class="form-section identity-section">
              <div class="image-field">
                <div id="create-image-preview" class="image-upload-preview"><span>＋</span></div>
                <label>
                  <strong>Meme image</strong>
                  <small>Paste an HTTPS or IPFS image URL so the image persists on-chain.</small>
                  <input id="create-image" type="text" placeholder="https://… or ipfs://…" maxlength="256" />
                </label>
              </div>

              <div class="field-grid">
                <label class="tile-field">
                  <span>Meme name *</span>
                  <input id="create-name" type="text" placeholder="Untitled Meme" maxlength="64" required />
                </label>
                <label class="tile-field">
                  <span>Ticker symbol *</span>
                  <input id="create-symbol" type="text" placeholder="$TICKER" maxlength="7" required />
                </label>
              </div>

              <label class="tile-field textarea-field">
                <span>Description *</span>
                <textarea id="create-description" placeholder="Briefly describe your meme" maxlength="512" required></textarea>
              </label>
            </section>

            <section class="form-section">
              <h2>Socials</h2>
              <div class="social-grid">
                <label class="compact-field"><span>Telegram</span><input id="create-telegram" type="url" placeholder="t.me/yourgroup" maxlength="256" /></label>
                <label class="compact-field"><span>X</span><input id="create-x" type="url" placeholder="x.com/yourhandle" maxlength="256" /></label>
                <label class="compact-field"><span>Website</span><input id="create-website" type="url" placeholder="yoursite.com" maxlength="256" /></label>
              </div>
            </section>

            <section class="form-section">
              <div class="section-row">
                <h2>Creator fees</h2>
                <span class="coming-badge">Protocol v2</span>
              </div>
              <div class="segmented disabled-control" aria-disabled="true">
                <button type="button" disabled>My wallet</button>
                <button type="button" disabled>X creator</button>
                <button type="button" disabled>Community</button>
              </div>
              <p class="helper-copy">The deployed Hashed40 contract currently has a 0 bps protocol fee, so creator fee sharing is intentionally disabled rather than simulated.</p>
            </section>

            <section class="form-section option-pair">
              <div class="option-tile disabled-control">
                <span>Anti-snipe</span>
                <strong>No protection</strong>
                <small>Not implemented in the current contract.</small>
              </div>
              <div class="option-tile">
                <span>Launch time</span>
                <strong>Launch immediately</strong>
                <small>Market activates after the curve is seeded.</small>
              </div>
            </section>

            <section class="form-section curve-section">
              <div class="section-row">
                <div>
                  <h2>Sale & curve</h2>
                  <p>Configure real parameters written into the Hashed40 market.</p>
                </div>
              </div>

              <div class="control-block">
                <div class="control-heading">
                  <div><strong>Target raise</strong><span>How much UOS the curve collects before graduation.</span></div>
                  <b><span id="target-raise-value">3</span> UOS</b>
                </div>
                <div class="segmented five">
                  \${[1, 2, 3, 4, 5]
                    .map((value) => \`<button type="button" data-target-raise="\${value}" class="\${value === 3 ? 'active' : ''}">\${value}</button>\`)
                    .join('')}
                </div>
              </div>

              <div class="control-block">
                <div class="control-heading">
                  <div><strong>Initial buy</strong><span>Tokens you buy after launch. Leave at zero to buy nothing.</span></div>
                  <div class="inline-amount"><input id="create-initial-buy" inputmode="decimal" value="0" /><span>UOS</span></div>
                </div>
                <div class="segmented four">
                  <button type="button" data-initial-buy="0.25">0.25</button>
                  <button type="button" data-initial-buy="0.5">0.5</button>
                  <button type="button" data-initial-buy="1">1</button>
                  <button type="button" data-initial-buy="0">Zero</button>
                </div>
              </div>

              <div class="control-block">
                <div class="control-heading">
                  <div><strong>Curve steepness</strong><span>The final buyer before graduation pays more than the first buyer.</span></div>
                  <b><span id="curve-multiplier-value">6</span>×</b>
                </div>
                <div class="segmented four curve-options">
                  <button type="button" data-curve="fair"><strong>Fair</strong><small>1.1× rise</small></button>
                  <button type="button" data-curve="standard" class="active"><strong>Standard</strong><small>6× rise</small></button>
                  <button type="button" data-curve="steep"><strong>Steep</strong><small>16× rise</small></button>
                  <button type="button" data-curve="custom"><strong>Custom</strong><small>1.1×–21×</small></button>
                </div>
                <label id="custom-curve-wrap" class="custom-curve hidden">
                  Custom multiplier
                  <input id="custom-curve" type="number" min="1.1" max="21" step="0.1" value="8" />
                </label>
              </div>

              <div class="control-block">
                <div class="control-heading">
                  <div><strong>Fee split</strong><span>Creator fee distribution is not active on the deployed contract.</span></div>
                  <b class="muted">0 bps</b>
                </div>
                <div class="segmented four disabled-control" aria-disabled="true">
                  <button type="button" disabled>25%</button>
                  <button type="button" disabled>50%</button>
                  <button type="button" disabled>75%</button>
                  <button type="button" disabled>Custom</button>
                </div>
              </div>
            </section>

            <div class="launch-summary">
              <div><span>Token factory</span><strong>\${TOKEN_FACTORY}</strong></div>
              <div><span>Market contract</span><strong>\${PAD_CONTRACT}</strong></div>
              <div><span>Settlement</span><strong>\${PAYMENT_SYMBOL}</strong></div>
            </div>

            <button id="create-submit" class="launch-submit" type="submit" disabled>Connect wallet to launch</button>
            <div id="create-status" class="status create-status"></div>
          </div>

          <aside class="live-preview">
            <h2>Live preview</h2>
            <div class="preview-card">
              <div id="preview-image" class="preview-image">
                <div class="image-fallback"><span>#</span></div>
                <span class="preview-chain">ULTRA</span>
                <div class="preview-overlay">
                  <strong id="preview-name">Meme name</strong>
                  <span id="preview-symbol">$TICKER</span>
                </div>
              </div>
              <p id="preview-description">A short pitch lands here.</p>
              <div class="preview-range">
                <div><span>Opens at</span><strong id="preview-open-cap">1.0K UOS MC</strong></div>
                <i>→</i>
                <div><span>Graduates at</span><strong id="preview-target">3 UOS raised</strong></div>
              </div>
              <div class="preview-info">
                <span>Curve</span><strong id="preview-curve">6× rise</strong>
                <span>Supply</span><strong>1B</strong>
                <span>Trading asset</span><strong>UOS</strong>
              </div>
              <div class="preview-fees">
                <div>
                  <strong>Creator trading fees</strong>
                  <span>Not enabled on current contract</span>
                </div>
                <b>0 bps</b>
              </div>
            </div>
          </aside>
        </form>
      </section>
    </main>

    \${bottomBarMarkup()}
  \`;

  bindWalletButtons();

  let targetRaise = 3;
  let curveChoice: CurveChoice = 'standard';
  let curveMultiplier = 6;

  const nameInput = document.querySelector<HTMLInputElement>('#create-name')!;
  const symbolInput = document.querySelector<HTMLInputElement>('#create-symbol')!;
  const descriptionInput = document.querySelector<HTMLTextAreaElement>('#create-description')!;
  const imageInput = document.querySelector<HTMLInputElement>('#create-image')!;
  const initialBuyInput = document.querySelector<HTMLInputElement>('#create-initial-buy')!;
  const customCurveInput = document.querySelector<HTMLInputElement>('#custom-curve')!;

  const updatePreview = () => {
    const name = nameInput.value.trim() || 'Meme name';
    const symbol = symbolInput.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 7) || 'TICKER';
    const description = descriptionInput.value.trim() || 'A short pitch lands here.';
    const image = imageUrl(imageInput.value.trim());

    document.querySelector<HTMLElement>('#preview-name')!.textContent = name;
    document.querySelector<HTMLElement>('#preview-symbol')!.textContent = '$' + symbol;
    document.querySelector<HTMLElement>('#preview-description')!.textContent = description;
    document.querySelector<HTMLElement>('#preview-target')!.textContent = \`\${targetRaise} UOS raised\`;
    document.querySelector<HTMLElement>('#preview-curve')!.textContent = \`\${curveMultiplier.toFixed(curveMultiplier % 1 ? 1 : 0)}× rise\`;
    document.querySelector<HTMLElement>('#curve-multiplier-value')!.textContent =
      curveMultiplier.toFixed(curveMultiplier % 1 ? 1 : 0);
    document.querySelector<HTMLElement>('#target-raise-value')!.textContent = String(targetRaise);

    const openCap = Number(START_PRICE) * Number(TOTAL_SUPPLY);
    document.querySelector<HTMLElement>('#preview-open-cap')!.textContent =
      \`\${formatCompact(openCap)} UOS MC\`;

    const previewImage = document.querySelector<HTMLElement>('#preview-image')!;
    const previewBase = image
      ? \`<img src="\${escapeHtml(image)}" alt="" />\`
      : '<div class="image-fallback"><span>#</span></div>';
    previewImage.innerHTML = \`
      \${previewBase}
      <span class="preview-chain">ULTRA</span>
      <div class="preview-overlay">
        <strong id="preview-name">\${escapeHtml(name)}</strong>
        <span id="preview-symbol">$\${escapeHtml(symbol)}</span>
      </div>
    \`;

    const imagePreview = document.querySelector<HTMLElement>('#create-image-preview')!;
    imagePreview.innerHTML = image ? \`<img src="\${escapeHtml(image)}" alt="" />\` : '<span>＋</span>';
  };

  [nameInput, symbolInput, descriptionInput, imageInput].forEach((input) =>
    input.addEventListener('input', updatePreview),
  );

  document.querySelectorAll<HTMLButtonElement>('[data-target-raise]').forEach((button) => {
    button.addEventListener('click', () => {
      targetRaise = Number(button.dataset.targetRaise || 3);
      document.querySelectorAll('[data-target-raise]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      updatePreview();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-initial-buy]').forEach((button) => {
    button.addEventListener('click', () => {
      initialBuyInput.value = button.dataset.initialBuy || '0';
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-curve]').forEach((button) => {
    button.addEventListener('click', () => {
      curveChoice = button.dataset.curve as CurveChoice;
      document.querySelectorAll('[data-curve]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');

      if (curveChoice === 'fair') curveMultiplier = 1.1;
      if (curveChoice === 'standard') curveMultiplier = 6;
      if (curveChoice === 'steep') curveMultiplier = 16;
      if (curveChoice === 'custom') curveMultiplier = Number(customCurveInput.value || 8);

      document.querySelector('#custom-curve-wrap')?.classList.toggle('hidden', curveChoice !== 'custom');
      updatePreview();
    });
  });

  customCurveInput.addEventListener('input', () => {
    const value = Number(customCurveInput.value);
    curveMultiplier = Math.max(1.1, Math.min(21, Number.isFinite(value) ? value : 8));
    updatePreview();
  });

  document.querySelector<HTMLButtonElement>('.boost-button')?.addEventListener('click', () => {
    toast('Boost campaigns are coming soon.', 'info');
  });

  document.querySelector<HTMLFormElement>('#create-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();

    const target = document.querySelector<HTMLElement>('#create-status');
    if (!account) {
      showStatus(target, 'Connect a normal Ultra Testnet user account first.', 'error');
      return;
    }

    if (account === PAD_CONTRACT) {
      showStatus(
        target,
        \`\${PAD_CONTRACT} is the Hash40 contract account. Use a separate Testnet user account to launch memes.\`,
        'error',
      );
      return;
    }

    const name = nameInput.value.trim();
    const symbol = symbolInput.value.trim().toUpperCase();
    const image = imageInput.value.trim();
    const description = descriptionInput.value.trim();
    const website = document.querySelector<HTMLInputElement>('#create-website')!.value.trim();
    const xUrl = document.querySelector<HTMLInputElement>('#create-x')!.value.trim();
    const telegram = document.querySelector<HTMLInputElement>('#create-telegram')!.value.trim();
    const initialBuyRaw = initialBuyInput.value.trim() || '0';

    if (!name || utf8Length(name) > 64) {
      showStatus(target, 'Meme name must be between 1 and 64 UTF-8 bytes.', 'error');
      return;
    }
    if (!/^[A-Z]{1,7}$/.test(symbol)) {
      showStatus(target, 'Ticker must be 1–7 letters.', 'error');
      return;
    }
    if (!description || utf8Length(description) > 512) {
      showStatus(target, 'Description is required and must be 512 UTF-8 bytes or fewer.', 'error');
      return;
    }
    if (image && !imageUrl(image)) {
      showStatus(target, 'Image must be an HTTPS URL or ipfs:// URI.', 'error');
      return;
    }

    const launchButton = document.querySelector<HTMLButtonElement>('#create-submit')!;
    launchButton.disabled = true;

    try {
      const supply = formatAmount(TOTAL_SUPPLY, TOKEN_DECIMALS, symbol);
      const endPrice = (Number(START_PRICE) * curveMultiplier).toFixed(PAYMENT_DECIMALS);

      launchButton.textContent = '1/4 · Creating token…';
      showStatus(target, 'Approve the HashTL token launch in Ultra Wallet.');
      await sign(TOKEN_FACTORY, 'launch', {
        issuer: account,
        maximum_supply: supply,
        initial_supply: supply,
        token_name: name,
        metadata_uri: image,
      });

      launchButton.textContent = '2/4 · Creating market…';
      showStatus(target, 'Approve the Hashed40 bonding-curve market.');
      await sign(PAD_CONTRACT, 'createmarket', {
        creator: account,
        token_symbol: \`\${TOKEN_DECIMALS},\${symbol}\`,
        token_allocation: formatAmount(CURVE_ALLOCATION, TOKEN_DECIMALS, symbol),
        start_price: formatAmount(START_PRICE, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
        end_price: formatAmount(endPrice, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
        graduation_target: formatAmount(String(targetRaise), PAYMENT_DECIMALS, PAYMENT_SYMBOL),
        display_name: name,
        image_uri: image,
        description,
        website,
        x_url: xUrl,
        telegram_url: telegram,
      });

      showStatus(target, 'Waiting for the market row to appear on Ultra…');
      const market = await waitForMarket(account, symbol);
      const marketId = Number(market.id);

      launchButton.textContent = '3/4 · Seeding curve…';
      showStatus(target, 'Approve the meme supply deposit.');
      await sign(TOKEN_FACTORY, 'transfer', {
        from: account,
        to: PAD_CONTRACT,
        quantity: formatAmount(CURVE_ALLOCATION, TOKEN_DECIMALS, symbol),
        memo: \`seed:\${marketId}\`,
      });

      launchButton.textContent = '4/4 · Going live…';
      showStatus(target, 'Approve market activation.');
      await sign(PAD_CONTRACT, 'activate', { market_id: marketId });

      const initialBuy = Number(initialBuyRaw);
      if (Number.isFinite(initialBuy) && initialBuy > 0) {
        launchButton.textContent = 'Initial buy…';
        showStatus(target, 'Market is live. Approve your optional initial UOS buy.');
        await sign(PAYMENT_CONTRACT, 'transfer', {
          from: account,
          to: PAD_CONTRACT,
          quantity: formatAmount(initialBuyRaw, PAYMENT_DECIMALS, PAYMENT_SYMBOL),
          memo: \`buy:\${marketId}\`,
        });
      }

      showStatus(target, \`$\${symbol} is live on Hashed40.\`, 'ok');
      launchButton.textContent = 'Live ✓';
      window.setTimeout(() => {
        window.location.href = '/?launched=' + marketId;
      }, 900);
    } catch (err) {
      showStatus(target, errorMessage(err), 'error');
      launchButton.textContent = 'Launch meme on Ultra';
      launchButton.disabled = false;
    }
  });

  syncWalletButtons();
  updatePreview();
  void fetchMarkets().then((markets) => renderTicker(markets)).catch(() => renderTicker([]));
}

function route() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/create') {
    renderCreate();
  } else {
    renderHome();
  }
}

route();
