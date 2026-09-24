import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const TOKEN_CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT || 'hashedlaunch';
const PAD_CONTRACT = import.meta.env.VITE_LAUNCHPAD_ACCOUNT || 'hashedpad';
const PAYMENT_CONTRACT = import.meta.env.VITE_PAYMENT_CONTRACT || 'eosio.token';
const PAYMENT_SYMBOL = import.meta.env.VITE_PAYMENT_SYMBOL || 'UOS';
const PAYMENT_DECIMALS = Number(import.meta.env.VITE_PAYMENT_DECIMALS || 8);
const RPC_URL = import.meta.env.VITE_ULTRA_RPC_URL || 'https://ultra-testnet.eosphere.io';

const ULTRA_MAINNET_CHAIN_ID = 'a9c481dfbc7d9506dc7e87e9a137c931b0a9303f64fd7a1d08b8230133920097';
const ULTRA_TESTNET_CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
const MAX_ASSET_AMOUNT = (1n << 62n) - 1n;

let account: string | undefined;

type StatusKind = 'ok' | 'error' | 'info';

type LaunchRow = {
  id: number | string;
  creator: string;
  sale_contract: string;
  sale_symbol: string;
  token_allocation: string;
  token_reserve: string;
  payment_contract: string;
  payment_symbol: string;
  virtual_payment: string;
  payment_reserve: string;
  graduation_target: string;
  fee_receiver: string;
  protocol_fee_bps: number;
  creator_fee_bps: number;
  graduated: boolean;
  status: number;
  volume: string;
  trade_count: number | string;
  created_at: number | string;
  token_name: string;
  image_uri: string;
  description: string;
  website: string;
  x_url: string;
  telegram_url: string;
};

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="shell">
    <nav>
      <div class="brand"><span class="mark">H</span> HASHED</div>
      <div class="tabs">
        <button class="tab active" data-tab="launcher">Token Launcher</button>
        <button class="tab" data-tab="meme">Meme Launchpad</button>
      </div>
      <button id="connect" class="wallet">Connect Ultra Wallet</button>
    </nav>

    <section class="hero">
      <div class="eyebrow">ULTRA TESTNET · CREATE · LAUNCH · TRADE</div>
      <h1>Launch tokens<br/>natively on Ultra.</h1>
      <p>Create a fixed-supply token, put the full supply on a bonding curve, and let anyone buy or sell it with UOS.</p>
    </section>

    <section id="launcher-panel" class="panel active">
      <section class="card">
        <div class="form-head">
          <div><span class="step">01</span><h2>Create token</h2></div>
          <span class="network">ULTRA TESTNET</span>
        </div>

        <form id="token-form">
          <div class="grid2">
            <label>Token name<input id="token-name" maxlength="64" placeholder="Ultra Dog" required /></label>
            <label>Symbol<input id="token-symbol" maxlength="7" placeholder="UDOG" pattern="[A-Z]{1,7}" required /></label>
          </div>

          <div class="grid3">
            <label>Maximum supply<input id="token-max" inputmode="decimal" value="1000000000" required /></label>
            <label>Initial supply<input id="token-initial" inputmode="decimal" value="1000000000" required /></label>
            <label>Decimals<select id="token-decimals"><option>4</option><option>6</option><option selected>8</option></select></label>
          </div>

          <label>Metadata URI <span>(optional)</span><input id="token-uri" maxlength="256" placeholder="ipfs://... or https://..." /></label>

          <label class="checkbox-row">
            <input id="meme-ready" type="checkbox" checked />
            <span><strong>Meme-ready fixed supply</strong> — issue the full supply and permanently lock future minting.</span>
          </label>

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

    <section id="meme-panel" class="panel">
      <section class="launch-layout">
        <section class="card">
          <div class="form-head">
            <div><span class="step">02</span><h2>Create meme launch</h2></div>
            <span class="network">BONDING CURVE</span>
          </div>

          <form id="meme-form">
            <div class="grid2">
              <label>Token name<input id="meme-name" maxlength="64" placeholder="Ultra Dog" required /></label>
              <label>Token symbol<input id="meme-symbol" maxlength="7" placeholder="UDOG" pattern="[A-Z]{1,7}" required /></label>
            </div>

            <div class="grid2">
              <label>Token decimals<select id="meme-decimals"><option>4</option><option>6</option><option selected>8</option></select></label>
              <label>Image URI<input id="meme-image" maxlength="256" placeholder="https://... or ipfs://..." required /></label>
            </div>

            <label>Description<textarea id="meme-description" maxlength="512" placeholder="What is this meme about?"></textarea></label>

            <div class="grid3">
              <label>Website <span>(optional)</span><input id="meme-website" maxlength="256" placeholder="https://..." /></label>
              <label>X <span>(optional)</span><input id="meme-x" maxlength="256" placeholder="https://x.com/..." /></label>
              <label>Telegram <span>(optional)</span><input id="meme-telegram" maxlength="256" placeholder="https://t.me/..." /></label>
            </div>

            <div class="notice">
              The token must be created through Hashed, have its entire max supply issued, and have minting permanently locked.
            </div>

            <div class="button-row">
              <button id="lock-mint" class="secondary" type="button" disabled>Lock minting</button>
              <button id="create-meme" class="primary" type="submit" disabled>Create meme launch</button>
            </div>
          </form>

          <div id="meme-status" class="status"></div>
        </section>

        <section class="card">
          <div class="form-head">
            <div><span class="step">03</span><h2>Go live</h2></div>
            <span class="network">FULL SUPPLY ESCROW</span>
          </div>

          <label>Launch ID<input id="launch-id" inputmode="numeric" placeholder="1" /></label>
          <p class="muted">Going live transfers the token's entire fixed supply into the Hashed bonding curve. The creator cannot mint more afterwards.</p>

          <button id="go-live" class="primary" type="button" disabled>Escrow supply & go live</button>
          <div id="live-status" class="status"></div>

          <div class="divider"></div>

          <div class="form-head compact">
            <div><span class="step">04</span><h2>Trade</h2></div>
            <button id="refresh-launch" class="ghost" type="button">Refresh</button>
          </div>

          <div id="selected-launch" class="selected-launch empty">Enter a launch ID to load market data.</div>

          <div class="grid2">
            <label>Buy with ${PAYMENT_SYMBOL}<input id="buy-amount" inputmode="decimal" value="10" /></label>
            <button id="buy-token" class="primary action-button" type="button" disabled>Buy token</button>
          </div>

          <div class="grid2">
            <label>Sell token amount<input id="sell-amount" inputmode="decimal" value="1000" /></label>
            <button id="sell-token" class="secondary action-button" type="button" disabled>Sell token</button>
          </div>

          <div id="trade-status" class="status"></div>
        </section>
      </section>

      <section class="market-section">
        <div class="market-head">
          <div>
            <div class="eyebrow">LIVE ON HASHED</div>
            <h2>Meme launches</h2>
          </div>
          <button id="refresh-markets" class="secondary" type="button">Refresh markets</button>
        </div>
        <div id="market-grid" class="market-grid">
          <div class="empty-state">No launches loaded yet.</div>
        </div>
      </section>
    </section>

    <footer>Hashed · Token Launcher + Meme Launchpad on Ultra</footer>
  </main>
`;

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const createTokenButton = document.querySelector<HTMLButtonElement>('#create-token')!;
const createMemeButton = document.querySelector<HTMLButtonElement>('#create-meme')!;
const lockMintButton = document.querySelector<HTMLButtonElement>('#lock-mint')!;
const goLiveButton = document.querySelector<HTMLButtonElement>('#go-live')!;
const buyButton = document.querySelector<HTMLButtonElement>('#buy-token')!;
const sellButton = document.querySelector<HTMLButtonElement>('#sell-token')!;
const issuer = document.querySelector<HTMLElement>('#issuer')!;
const marketGrid = document.querySelector<HTMLDivElement>('#market-grid')!;
const selectedLaunch = document.querySelector<HTMLDivElement>('#selected-launch')!;

function showStatus(id: string, message: string, kind: StatusKind = 'info') {
  const target = document.querySelector<HTMLElement>(id)!;
  target.className = `status ${kind}`;
  target.textContent = message;
}

function setWalletControls(enabled: boolean) {
  [createTokenButton, createMemeButton, lockMintButton, goLiveButton, buyButton, sellButton].forEach((button) => {
    button.disabled = !enabled;
  });

  if (enabled) createTokenButton.textContent = 'Create token';
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

function requiredAccount(): string {
  if (!account) throw new Error('Connect your Ultra Wallet first.');
  return account;
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

function formatAsset(raw: string, decimals: number, symbol: string) {
  const parsed = parseAmount(raw, decimals);
  return {
    atomic: parsed.atomic,
    asset: `${parsed.normalized} ${symbol}`,
  };
}

function assetNumber(asset: string): number {
  const value = Number(asset.split(' ')[0]);
  return Number.isFinite(value) ? value : 0;
}

function symbolCode(assetOrSymbol: string): string {
  const parts = assetOrSymbol.trim().split(' ');
  if (parts.length > 1) return parts[1];
  const comma = assetOrSymbol.indexOf(',');
  return comma >= 0 ? assetOrSymbol.slice(comma + 1) : assetOrSymbol;
}

function statusLabel(status: number): string {
  if (status === 0) return 'Draft';
  if (status === 1) return 'Live';
  if (status === 2) return 'Cancelled';
  return 'Unknown';
}

async function signTransaction(contract: string, action: string, data: Record<string, unknown>): Promise<string> {
  requiredAccount();

  const response = await wallet.signTransaction({ contract, action, data });
  const hash = response.data.transactionHash;

  if (!hash) {
    throw new Error('Ultra Wallet submitted the transaction without returning a transaction hash.');
  }

  return hash;
}

async function chainRows<T>(table: string, scope = PAD_CONTRACT, limit = 250): Promise<T[]> {
  const response = await fetch(`${RPC_URL}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      json: true,
      code: PAD_CONTRACT,
      scope,
      table,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ultra RPC returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { rows?: T[] };
  return payload.rows ?? [];
}

async function getLaunch(id: number): Promise<LaunchRow> {
  const rows = await chainRows<LaunchRow>('launches');
  const launch = rows.find((row) => Number(row.id) === id);
  if (!launch) throw new Error(`Launch #${id} was not found on Ultra Testnet.`);
  return launch;
}

function launchId(): number {
  const id = Number(document.querySelector<HTMLInputElement>('#launch-id')!.value.trim());
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Enter a valid launch ID.');
  return id;
}

function priceOf(launch: LaunchRow): number {
  const payment = assetNumber(launch.virtual_payment) + assetNumber(launch.payment_reserve);
  const tokens = assetNumber(launch.token_reserve);
  return tokens > 0 ? payment / tokens : 0;
}

function graduationProgress(launch: LaunchRow): number {
  const reserve = assetNumber(launch.payment_reserve);
  const target = assetNumber(launch.graduation_target);
  if (target <= 0) return 0;
  return Math.min(100, (reserve / target) * 100);
}

function shortNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function renderSelectedLaunch(launch: LaunchRow) {
  selectedLaunch.className = 'selected-launch';
  selectedLaunch.replaceChildren();

  const title = document.createElement('div');
  title.className = 'selected-title';

  const name = document.createElement('strong');
  name.textContent = `${launch.token_name} · ${symbolCode(launch.sale_symbol)}`;

  const badge = document.createElement('span');
  badge.className = launch.graduated ? 'badge graduated' : 'badge';
  badge.textContent = launch.graduated ? 'Curve target reached' : statusLabel(launch.status);

  title.append(name, badge);

  const stats = document.createElement('div');
  stats.className = 'mini-stats';

  const currentPrice = priceOf(launch);
  const marketCap = currentPrice * assetNumber(launch.token_allocation);

  const items = [
    ['Price', `${currentPrice.toFixed(8)} ${PAYMENT_SYMBOL}`],
    ['Market cap', `${shortNumber(marketCap)} ${PAYMENT_SYMBOL}`],
    ['Curve reserve', launch.payment_reserve],
    ['Volume', launch.volume],
  ];

  for (const [label, value] of items) {
    const item = document.createElement('div');
    const small = document.createElement('span');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(small, strong);
    stats.append(item);
  }

  const progress = document.createElement('div');
  progress.className = 'progress-wrap';
  const progressTop = document.createElement('div');
  progressTop.className = 'progress-top';
  progressTop.textContent = `Graduation progress · ${graduationProgress(launch).toFixed(1)}%`;
  const track = document.createElement('div');
  track.className = 'progress-track';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = `${graduationProgress(launch)}%`;
  track.append(fill);
  progress.append(progressTop, track);

  selectedLaunch.append(title, stats, progress);
}

function renderMarkets(launches: LaunchRow[]) {
  marketGrid.replaceChildren();

  if (!launches.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No meme launches found on the configured Ultra network.';
    marketGrid.append(empty);
    return;
  }

  for (const launch of [...launches].reverse()) {
    const card = document.createElement('article');
    card.className = 'market-card';

    const image = document.createElement('div');
    image.className = 'token-image';

    const imageUrl = safeHttpUrl(launch.image_uri);
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      image.append(img);
    } else {
      image.textContent = symbolCode(launch.sale_symbol).slice(0, 2);
    }

    const body = document.createElement('div');
    body.className = 'market-body';

    const top = document.createElement('div');
    top.className = 'market-card-top';

    const heading = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = launch.token_name;
    const symbol = document.createElement('span');
    symbol.textContent = symbolCode(launch.sale_symbol);
    heading.append(name, symbol);

    const badge = document.createElement('span');
    badge.className = launch.graduated ? 'badge graduated' : 'badge';
    badge.textContent = launch.graduated ? 'Graduated' : statusLabel(launch.status);

    top.append(heading, badge);

    const description = document.createElement('p');
    description.textContent = launch.description || 'No description.';

    const price = priceOf(launch);
    const marketCap = price * assetNumber(launch.token_allocation);

    const stats = document.createElement('div');
    stats.className = 'card-stats';

    for (const [label, value] of [
      ['MCap', `${shortNumber(marketCap)} ${PAYMENT_SYMBOL}`],
      ['Volume', launch.volume],
      ['Trades', String(launch.trade_count)],
    ]) {
      const item = document.createElement('div');
      const small = document.createElement('span');
      small.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(small, strong);
      stats.append(item);
    }

    const progress = document.createElement('div');
    progress.className = 'progress-track';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${graduationProgress(launch)}%`;
    progress.append(fill);

    const open = document.createElement('button');
    open.className = 'secondary card-open';
    open.textContent = `Open launch #${launch.id}`;
    open.addEventListener('click', () => {
      document.querySelector<HTMLInputElement>('#launch-id')!.value = String(launch.id);
      renderSelectedLaunch(launch);
      window.scrollTo({ top: 620, behavior: 'smooth' });
    });

    body.append(top, description, stats, progress, open);
    card.append(image, body);
    marketGrid.append(card);
  }
}

async function refreshMarkets() {
  const launches = await chainRows<LaunchRow>('launches');
  renderMarkets(launches);
}

async function refreshSelected() {
  const launch = await getLaunch(launchId());
  renderSelectedLaunch(launch);
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));

    button.classList.add('active');
    document.querySelector<HTMLElement>(`#${button.dataset.tab}-panel`)!.classList.add('active');

    if (button.dataset.tab === 'meme') {
      void refreshMarkets().catch((err) => showStatus('#meme-status', errorMessage(err), 'error'));
    }
  });
});

connectButton.addEventListener('click', async () => {
  if (!('ultra' in window)) {
    showStatus(
      '#token-status',
      'Ultra Wallet Extension was not detected. Ultra Testnet requires the browser extension.',
      'error',
    );
    return;
  }

  connectButton.disabled = true;

  try {
    showStatus('#token-status', 'Checking Ultra Wallet network…');

    const chainResponse = await wallet.getChainId();
    const currentChainId = chainResponse.data;

    if (currentChainId !== ULTRA_TESTNET_CHAIN_ID) {
      try {
        await wallet.switchNetwork(ULTRA_TESTNET_CHAIN_ID);
      } catch (switchErr: unknown) {
        if (walletErrorCode(switchErr) === 4100 || currentChainId === ULTRA_MAINNET_CHAIN_ID) {
          throw new Error(
            'Ultra Wallet is on Mainnet. Open the extension → Networks → Testnet, switch to Testnet, then click Connect again.',
          );
        }
        throw switchErr;
      }
    }

    const { data } = await wallet.connect();
    account = data.blockchainid;

    if (!account) {
      throw new Error('Ultra Wallet did not return a Testnet blockchain account.');
    }

    connectButton.textContent = account;
    issuer.textContent = account;
    setWalletControls(true);
    showStatus('#token-status', 'Wallet connected to Ultra Testnet.', 'ok');
  } catch (err: unknown) {
    account = undefined;
    setWalletControls(false);
    showStatus('#token-status', errorMessage(err), 'error');
  } finally {
    connectButton.disabled = false;
  }
});

document.querySelector<HTMLFormElement>('#token-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  const creator = requiredAccount();
  const tokenName = document.querySelector<HTMLInputElement>('#token-name')!.value.trim();
  const tokenSymbol = document.querySelector<HTMLInputElement>('#token-symbol')!.value.trim().toUpperCase();
  const maxRaw = document.querySelector<HTMLInputElement>('#token-max')!.value;
  const initialRaw = document.querySelector<HTMLInputElement>('#token-initial')!.value;
  const decimals = Number(document.querySelector<HTMLSelectElement>('#token-decimals')!.value);
  const metadataUri = document.querySelector<HTMLInputElement>('#token-uri')!.value.trim();
  const memeReady = document.querySelector<HTMLInputElement>('#meme-ready')!.checked;

  try {
    if (!/^[A-Z]{1,7}$/.test(tokenSymbol)) throw new Error('Symbol must be 1–7 uppercase A–Z characters.');
    if (utf8Length(tokenName) === 0 || utf8Length(tokenName) > 64) throw new Error('Token name must be 1–64 bytes.');
    if (utf8Length(metadataUri) > 256) throw new Error('Metadata URI is too long.');

    const maximumSupply = formatAsset(maxRaw, decimals, tokenSymbol);
    const initialSupply = formatAsset(initialRaw, decimals, tokenSymbol);

    if (maximumSupply.atomic <= 0n) throw new Error('Maximum supply must be greater than zero.');
    if (initialSupply.atomic > maximumSupply.atomic) throw new Error('Initial supply cannot exceed maximum supply.');
    if (memeReady && initialSupply.atomic !== maximumSupply.atomic) {
      throw new Error('A meme-ready token must issue its full maximum supply before minting is locked.');
    }

    createTokenButton.disabled = true;
    createTokenButton.textContent = 'Confirm token creation…';

    const launchHash = await signTransaction(TOKEN_CONTRACT, 'launch', {
      issuer: creator,
      maximum_supply: maximumSupply.asset,
      initial_supply: initialSupply.asset,
      token_name: tokenName,
      metadata_uri: metadataUri,
    });

    let message = `Token created: ${launchHash}`;

    if (memeReady) {
      createTokenButton.textContent = 'Confirm permanent mint lock…';

      const lockHash = await signTransaction(TOKEN_CONTRACT, 'lockmint', {
        issuer: creator,
        symcode: tokenSymbol,
      });

      message += ` · Minting permanently locked: ${lockHash}`;
    }

    document.querySelector<HTMLInputElement>('#meme-name')!.value = tokenName;
    document.querySelector<HTMLInputElement>('#meme-symbol')!.value = tokenSymbol;
    document.querySelector<HTMLSelectElement>('#meme-decimals')!.value = String(decimals);

    showStatus('#token-status', message, 'ok');
  } catch (err: unknown) {
    showStatus('#token-status', errorMessage(err), 'error');
  } finally {
    createTokenButton.disabled = !account;
    createTokenButton.textContent = 'Create token';
  }
});

lockMintButton.addEventListener('click', async () => {
  try {
    const creator = requiredAccount();
    const symbol = document.querySelector<HTMLInputElement>('#meme-symbol')!.value.trim().toUpperCase();

    if (!/^[A-Z]{1,7}$/.test(symbol)) throw new Error('Enter a valid token symbol first.');

    lockMintButton.disabled = true;
    lockMintButton.textContent = 'Confirm permanent lock…';

    const hash = await signTransaction(TOKEN_CONTRACT, 'lockmint', {
      issuer: creator,
      symcode: symbol,
    });

    showStatus('#meme-status', `Minting permanently locked: ${hash}`, 'ok');
  } catch (err: unknown) {
    showStatus('#meme-status', errorMessage(err), 'error');
  } finally {
    lockMintButton.disabled = !account;
    lockMintButton.textContent = 'Lock minting';
  }
});

document.querySelector<HTMLFormElement>('#meme-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const creator = requiredAccount();
    const symbol = document.querySelector<HTMLInputElement>('#meme-symbol')!.value.trim().toUpperCase();
    const decimals = Number(document.querySelector<HTMLSelectElement>('#meme-decimals')!.value);
    const tokenName = document.querySelector<HTMLInputElement>('#meme-name')!.value.trim();
    const imageUri = document.querySelector<HTMLInputElement>('#meme-image')!.value.trim();
    const description = document.querySelector<HTMLTextAreaElement>('#meme-description')!.value.trim();
    const website = document.querySelector<HTMLInputElement>('#meme-website')!.value.trim();
    const xUrl = document.querySelector<HTMLInputElement>('#meme-x')!.value.trim();
    const telegramUrl = document.querySelector<HTMLInputElement>('#meme-telegram')!.value.trim();

    if (!/^[A-Z]{1,7}$/.test(symbol)) throw new Error('Enter a valid token symbol.');
    if (!imageUri) throw new Error('Add an image URI for the meme token.');

    createMemeButton.disabled = true;
    createMemeButton.textContent = 'Confirm meme launch…';

    const hash = await signTransaction(PAD_CONTRACT, 'creatememe', {
      creator,
      sale_symbol: `${decimals},${symbol}`,
      token_name: tokenName,
      image_uri: imageUri,
      description,
      website,
      x_url: xUrl,
      telegram_url: telegramUrl,
    });

    showStatus('#meme-status', `Meme launch created: ${hash}`, 'ok');

    await refreshMarkets();
    const rows = await chainRows<LaunchRow>('launches');
    const creatorRows = rows.filter((row) => row.creator === creator);
    const latest = creatorRows.sort((a, b) => Number(b.id) - Number(a.id))[0];

    if (latest) {
      document.querySelector<HTMLInputElement>('#launch-id')!.value = String(latest.id);
      renderSelectedLaunch(latest);
    }
  } catch (err: unknown) {
    showStatus('#meme-status', errorMessage(err), 'error');
  } finally {
    createMemeButton.disabled = !account;
    createMemeButton.textContent = 'Create meme launch';
  }
});

goLiveButton.addEventListener('click', async () => {
  try {
    const creator = requiredAccount();
    const launch = await getLaunch(launchId());

    if (launch.creator !== creator) {
      throw new Error('Only the launch creator can escrow the fixed token supply.');
    }

    if (launch.status !== 0) {
      throw new Error('This launch is no longer waiting for token escrow.');
    }

    goLiveButton.disabled = true;
    goLiveButton.textContent = 'Confirm full-supply escrow…';

    const hash = await signTransaction(launch.sale_contract, 'transfer', {
      from: creator,
      to: PAD_CONTRACT,
      quantity: launch.token_allocation,
      memo: `deposit:${launch.id}`,
    });

    showStatus('#live-status', `Launch is live: ${hash}`, 'ok');
    await refreshSelected();
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus('#live-status', errorMessage(err), 'error');
  } finally {
    goLiveButton.disabled = !account;
    goLiveButton.textContent = 'Escrow supply & go live';
  }
});

buyButton.addEventListener('click', async () => {
  try {
    const buyer = requiredAccount();
    const launch = await getLaunch(launchId());
    const payment = formatAsset(
      document.querySelector<HTMLInputElement>('#buy-amount')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );

    if (launch.status !== 1) throw new Error('This meme launch is not live.');
    if (payment.atomic <= 0n) throw new Error('Buy amount must be greater than zero.');

    buyButton.disabled = true;
    buyButton.textContent = 'Confirm buy…';

    const hash = await signTransaction(PAYMENT_CONTRACT, 'transfer', {
      from: buyer,
      to: PAD_CONTRACT,
      quantity: payment.asset,
      memo: `buy:${launch.id}`,
    });

    showStatus('#trade-status', `Buy confirmed: ${hash}`, 'ok');
    await refreshSelected();
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus('#trade-status', errorMessage(err), 'error');
  } finally {
    buyButton.disabled = !account;
    buyButton.textContent = 'Buy token';
  }
});

sellButton.addEventListener('click', async () => {
  try {
    const seller = requiredAccount();
    const launch = await getLaunch(launchId());
    const symbol = symbolCode(launch.sale_symbol);
    const decimals = Number(String(launch.sale_symbol).split(',')[0]);
    const sale = formatAsset(
      document.querySelector<HTMLInputElement>('#sell-amount')!.value,
      decimals,
      symbol,
    );

    if (launch.status !== 1) throw new Error('This meme launch is not live.');
    if (sale.atomic <= 0n) throw new Error('Sell amount must be greater than zero.');

    sellButton.disabled = true;
    sellButton.textContent = 'Confirm sell…';

    const hash = await signTransaction(launch.sale_contract, 'transfer', {
      from: seller,
      to: PAD_CONTRACT,
      quantity: sale.asset,
      memo: `sell:${launch.id}`,
    });

    showStatus('#trade-status', `Sell confirmed: ${hash}`, 'ok');
    await refreshSelected();
    await refreshMarkets();
  } catch (err: unknown) {
    showStatus('#trade-status', errorMessage(err), 'error');
  } finally {
    sellButton.disabled = !account;
    sellButton.textContent = 'Sell token';
  }
});

document.querySelector<HTMLButtonElement>('#refresh-launch')!.addEventListener('click', () => {
  void refreshSelected().catch((err) => showStatus('#trade-status', errorMessage(err), 'error'));
});

document.querySelector<HTMLButtonElement>('#refresh-markets')!.addEventListener('click', () => {
  void refreshMarkets().catch((err) => showStatus('#meme-status', errorMessage(err), 'error'));
});

document.querySelector<HTMLInputElement>('#launch-id')!.addEventListener('change', () => {
  void refreshSelected().catch(() => undefined);
});

setWalletControls(false);
