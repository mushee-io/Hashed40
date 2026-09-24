import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const TOKEN_CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT || 'hashedlaunch';
const PAD_CONTRACT = import.meta.env.VITE_LAUNCHPAD_ACCOUNT || 'hashedpad';
const PAYMENT_CONTRACT = import.meta.env.VITE_PAYMENT_CONTRACT || 'eosio.token';
const PAYMENT_SYMBOL = import.meta.env.VITE_PAYMENT_SYMBOL || 'UOS';
const PAYMENT_DECIMALS = Number(import.meta.env.VITE_PAYMENT_DECIMALS || 8);
const RPC_URL = import.meta.env.VITE_ULTRA_RPC_URL || 'https://test.ultra.eosusa.io';

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
const MAX_ASSET_AMOUNT = (1n << 62n) - 1n;

let account: string | undefined;

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="shell">
    <nav>
      <div class="brand"><span class="mark">H</span> HASHED</div>
      <div class="tabs" aria-label="Hashed products">
        <button class="tab active" data-tab="launcher">Token Launcher</button>
        <button class="tab" data-tab="launchpad">Launchpad</button>
      </div>
      <button id="connect" class="wallet">Connect Ultra Wallet</button>
    </nav>

    <section class="hero">
      <div class="eyebrow">ULTRA TESTNET · TOKEN LAUNCHER + LAUNCHPAD</div>
      <h1>Create the token.<br/>Run the launch.</h1>
      <p>Hashed is focused on two things: creating native Ultra tokens and launching them through an escrowed token sale.</p>
    </section>

    <section id="launcher-panel" class="panel active">
      <section class="card">
        <div class="form-head">
          <div><span class="step">01</span><h2>Create token</h2></div>
          <span class="network">ULTRA TESTNET</span>
        </div>

        <form id="launch-form">
          <div class="grid2">
            <label>Token name<input id="name" maxlength="64" placeholder="Hashed Dollar" required /></label>
            <label>Symbol<input id="symbol" maxlength="7" placeholder="HUSD" pattern="[A-Z]{1,7}" required /></label>
          </div>
          <div class="grid2">
            <label>Maximum supply<input id="max" inputmode="decimal" value="1000000" required /></label>
            <label>Initial supply<input id="initial" inputmode="decimal" value="1000000" required /></label>
          </div>
          <div class="grid2">
            <label>Decimals<select id="decimals"><option>4</option><option>6</option><option selected>8</option></select></label>
            <label>Metadata URI <span>(optional)</span><input id="uri" maxlength="256" placeholder="ipfs://... or https://..." /></label>
          </div>
          <div class="summary">
            <div><span>Issuer</span><strong id="issuer">Not connected</strong></div>
            <div><span>Token contract</span><strong>${TOKEN_CONTRACT}</strong></div>
            <div><span>Network</span><strong>Ultra Testnet</strong></div>
          </div>
          <button id="launch" class="primary" type="submit" disabled>Connect wallet to create token</button>
        </form>
        <div id="launcher-status" class="status"></div>
      </section>
    </section>

    <section id="launchpad-panel" class="panel">
      <section class="card">
        <div class="form-head">
          <div><span class="step">02</span><h2>Create launch campaign</h2></div>
          <span class="network">UOS RAISE</span>
        </div>

        <form id="campaign-form">
          <div class="grid3">
            <label>Sale token symbol<input id="sale-symbol" maxlength="7" value="HASH" pattern="[A-Z]{1,7}" required /></label>
            <label>Sale token decimals<select id="sale-decimals"><option>4</option><option>6</option><option selected>8</option></select></label>
            <label>Token allocation<input id="sale-allocation" inputmode="decimal" value="100000" required /></label>
          </div>

          <div class="grid2">
            <label>Tokens per 1 ${PAYMENT_SYMBOL}<input id="sale-rate" inputmode="decimal" value="10" required /></label>
            <label>Payment asset<input value="${PAYMENT_SYMBOL} · ${PAYMENT_CONTRACT}" disabled /></label>
          </div>

          <div class="grid2">
            <label>Start time<input id="start-at" type="datetime-local" required /></label>
            <label>End time<input id="end-at" type="datetime-local" required /></label>
          </div>

          <div class="grid2">
            <label>Soft cap (${PAYMENT_SYMBOL})<input id="soft-cap" inputmode="decimal" value="1000" required /></label>
            <label>Hard cap (${PAYMENT_SYMBOL})<input id="hard-cap" inputmode="decimal" value="2500" required /></label>
          </div>

          <div class="grid2">
            <label>Minimum contribution<input id="min-contribution" inputmode="decimal" value="10" required /></label>
            <label>Maximum contribution<input id="max-contribution" inputmode="decimal" value="1500" required /></label>
          </div>

          <label class="checkbox-row">
            <input id="allowlist-enabled" type="checkbox" />
            <span>Use an allowlist for this launch</span>
          </label>

          <div class="summary">
            <div><span>Creator</span><strong id="campaign-creator">Not connected</strong></div>
            <div><span>Launchpad contract</span><strong>${PAD_CONTRACT}</strong></div>
            <div><span>Payment</span><strong>${PAYMENT_SYMBOL}</strong></div>
          </div>

          <button id="create-campaign" class="primary" type="submit" disabled>Connect wallet to create campaign</button>
        </form>
        <div id="campaign-status" class="status"></div>
      </section>

      <section class="card operations">
        <div class="form-head">
          <div><span class="step">03</span><h2>Campaign operations</h2></div>
          <span class="network">ESCROW + CLAIMS</span>
        </div>

        <div class="grid3">
          <label>Campaign ID<input id="campaign-id" inputmode="numeric" placeholder="1" /></label>
          <label>Sale token symbol<input id="ops-symbol" maxlength="7" value="HASH" /></label>
          <label>Sale token decimals<select id="ops-decimals"><option>4</option><option>6</option><option selected>8</option></select></label>
        </div>

        <div class="grid2">
          <label>Escrow allocation<input id="ops-allocation" inputmode="decimal" value="100000" /></label>
          <button id="fund-campaign" class="secondary action-button" type="button" disabled>Deposit sale tokens</button>
        </div>

        <div class="button-grid">
          <button id="activate-campaign" class="secondary" type="button" disabled>Activate</button>
          <button id="finalize-campaign" class="secondary" type="button" disabled>Finalize</button>
          <button id="withdraw-proceeds" class="secondary" type="button" disabled>Withdraw proceeds</button>
          <button id="reclaim-tokens" class="secondary" type="button" disabled>Reclaim unsold tokens</button>
        </div>

        <div class="divider"></div>

        <div class="grid2">
          <label>Contribute ${PAYMENT_SYMBOL}<input id="buy-amount" inputmode="decimal" value="100" /></label>
          <button id="buy-campaign" class="primary action-button" type="button" disabled>Contribute to launch</button>
        </div>

        <div class="button-grid two">
          <button id="claim-tokens" class="secondary" type="button" disabled>Claim purchased tokens</button>
          <button id="refund-payment" class="secondary" type="button" disabled>Claim refund</button>
        </div>

        <div class="divider"></div>

        <div class="grid2">
          <label>Allowlist account<input id="allowlist-account" placeholder="Ultra account" /></label>
          <div class="inline-actions">
            <button id="allow-account" class="secondary" type="button" disabled>Add</button>
            <button id="remove-account" class="secondary" type="button" disabled>Remove</button>
          </div>
        </div>

        <div id="operations-status" class="status"></div>
      </section>
    </section>

    <footer>Hashed · Token Launcher + Launchpad on Ultra</footer>
  </main>
`;

type StatusKind = 'ok' | 'error' | 'info';

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const tokenLaunchButton = document.querySelector<HTMLButtonElement>('#launch')!;
const campaignCreateButton = document.querySelector<HTMLButtonElement>('#create-campaign')!;
const issuer = document.querySelector<HTMLElement>('#issuer')!;
const campaignCreator = document.querySelector<HTMLElement>('#campaign-creator')!;

const walletButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(
    '#fund-campaign, #activate-campaign, #finalize-campaign, #withdraw-proceeds, #reclaim-tokens, #buy-campaign, #claim-tokens, #refund-payment, #allow-account, #remove-account',
  ),
);

function statusElement(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(id)!;
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
  return {
    atomic: parsed.atomic,
    asset: `${parsed.normalized} ${symbol}`,
  };
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
  tokenLaunchButton.disabled = !enabled;
  campaignCreateButton.disabled = !enabled;
  walletButtons.forEach((button) => {
    button.disabled = !enabled;
  });

  if (enabled) {
    tokenLaunchButton.textContent = 'Create token';
    campaignCreateButton.textContent = 'Create launch campaign';
  }
}

function requiredAccount(): string {
  if (!account) throw new Error('Connect your Ultra Wallet first.');
  return account;
}

function campaignId(): number {
  const raw = document.querySelector<HTMLInputElement>('#campaign-id')!.value.trim();
  const id = Number(raw);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Enter a valid campaign ID.');
  }

  return id;
}

function unixSecondsFromLocalInput(id: string): number {
  const value = document.querySelector<HTMLInputElement>(id)!.value;
  const milliseconds = new Date(value).getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new Error('Enter a valid campaign date and time.');
  }

  return Math.floor(milliseconds / 1000);
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

async function signTransaction(contract: string, action: string, data: Record<string, unknown>): Promise<string> {
  requiredAccount();

  const response = await wallet.signTransaction({
    contract,
    action,
    data,
  });

  const hash = response.data.transactionHash;
  if (!hash) throw new Error('Ultra Wallet submitted the transaction without returning a transaction hash.');
  return hash;
}

async function latestCampaignForCreator(creator: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${RPC_URL}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        json: true,
        code: PAD_CONTRACT,
        scope: PAD_CONTRACT,
        table: 'campaigns',
        limit: 250,
      }),
    });

    if (!response.ok) return undefined;

    const payload = (await response.json()) as {
      rows?: Array<{ id: number | string; creator: string }>;
    };

    const ids = (payload.rows ?? [])
      .filter((row) => row.creator === creator)
      .map((row) => Number(row.id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);

    return ids.length ? Math.max(...ids) : undefined;
  } catch {
    return undefined;
  }
}

function setDefaultCampaignDates() {
  const start = document.querySelector<HTMLInputElement>('#start-at')!;
  const end = document.querySelector<HTMLInputElement>('#end-at')!;

  const startDate = new Date(Date.now() + 5 * 60 * 1000);
  const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const localValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  start.value = localValue(startDate);
  end.value = localValue(endDate);
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));

    button.classList.add('active');
    document.querySelector<HTMLElement>(`#${button.dataset.tab}-panel`)!.classList.add('active');
  });
});

connectButton.addEventListener('click', async () => {
  const launcherStatus = statusElement('#launcher-status');

  if (!('ultra' in window)) {
    showStatus(
      launcherStatus,
      'Ultra Wallet Extension was not detected. On Testnet, use the browser extension and open this site over HTTPS.',
      'error',
    );
    return;
  }

  showStatus(launcherStatus, 'Opening Ultra Wallet…');

  try {
    const { data } = await wallet.connect();
    account = data.blockchainid;

    if (!account) {
      throw new Error('Ultra Wallet connected without returning a blockchain account.');
    }

    connectButton.textContent = account;
    issuer.textContent = account;
    campaignCreator.textContent = account;
    setWalletControls(true);
    showStatus(launcherStatus, 'Wallet connected to Ultra Testnet.', 'ok');
  } catch (err: unknown) {
    showStatus(launcherStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLFormElement>('#launch-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();
  const target = statusElement('#launcher-status');

  try {
    const creator = requiredAccount();
    const tokenName = document.querySelector<HTMLInputElement>('#name')!.value.trim();
    const tokenSymbol = document.querySelector<HTMLInputElement>('#symbol')!.value.trim().toUpperCase();
    const maxRaw = document.querySelector<HTMLInputElement>('#max')!.value;
    const initialRaw = document.querySelector<HTMLInputElement>('#initial')!.value;
    const decimals = Number(document.querySelector<HTMLSelectElement>('#decimals')!.value);
    const metadataUri = document.querySelector<HTMLInputElement>('#uri')!.value.trim();

    if (utf8Length(tokenName) === 0 || utf8Length(tokenName) > 64) {
      throw new Error('Token name must be between 1 and 64 UTF-8 bytes.');
    }

    if (!/^[A-Z]{1,7}$/.test(tokenSymbol)) {
      throw new Error('Symbol must be 1–7 uppercase A–Z characters.');
    }

    if (![4, 6, 8].includes(decimals)) {
      throw new Error('Unsupported token precision.');
    }

    if (utf8Length(metadataUri) > 256) {
      throw new Error('Metadata URI must be at most 256 UTF-8 bytes.');
    }

    const maximumSupply = formatAsset(maxRaw, decimals, tokenSymbol);
    const initialSupply = formatAsset(initialRaw, decimals, tokenSymbol);

    if (maximumSupply.atomic <= 0n) throw new Error('Maximum supply must be greater than zero.');
    if (initialSupply.atomic > maximumSupply.atomic) {
      throw new Error('Initial supply cannot exceed maximum supply.');
    }

    await withButton(tokenLaunchButton, target, 'Confirm in wallet…', () =>
      signTransaction(TOKEN_CONTRACT, 'launch', {
        issuer: creator,
        maximum_supply: maximumSupply.asset,
        initial_supply: initialSupply.asset,
        token_name: tokenName,
        metadata_uri: metadataUri,
      }),
    );

    document.querySelector<HTMLInputElement>('#sale-symbol')!.value = tokenSymbol;
    document.querySelector<HTMLSelectElement>('#sale-decimals')!.value = String(decimals);
    document.querySelector<HTMLInputElement>('#ops-symbol')!.value = tokenSymbol;
    document.querySelector<HTMLSelectElement>('#ops-decimals')!.value = String(decimals);
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLFormElement>('#campaign-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();
  const target = statusElement('#campaign-status');

  try {
    const creator = requiredAccount();
    const saleSymbol = document.querySelector<HTMLInputElement>('#sale-symbol')!.value.trim().toUpperCase();
    const saleDecimals = Number(document.querySelector<HTMLSelectElement>('#sale-decimals')!.value);
    const allocation = formatAsset(
      document.querySelector<HTMLInputElement>('#sale-allocation')!.value,
      saleDecimals,
      saleSymbol,
    );
    const rate = formatAsset(
      document.querySelector<HTMLInputElement>('#sale-rate')!.value,
      saleDecimals,
      saleSymbol,
    );
    const softCap = formatAsset(
      document.querySelector<HTMLInputElement>('#soft-cap')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );
    const hardCap = formatAsset(
      document.querySelector<HTMLInputElement>('#hard-cap')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );
    const minContribution = formatAsset(
      document.querySelector<HTMLInputElement>('#min-contribution')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );
    const maxContribution = formatAsset(
      document.querySelector<HTMLInputElement>('#max-contribution')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );
    const startAt = unixSecondsFromLocalInput('#start-at');
    const endAt = unixSecondsFromLocalInput('#end-at');
    const allowlistEnabled = document.querySelector<HTMLInputElement>('#allowlist-enabled')!.checked;

    if (!/^[A-Z]{1,7}$/.test(saleSymbol)) throw new Error('Enter a valid sale token symbol.');
    if (allocation.atomic <= 0n) throw new Error('Token allocation must be greater than zero.');
    if (rate.atomic <= 0n) throw new Error('Token rate must be greater than zero.');
    if (hardCap.atomic <= 0n) throw new Error('Hard cap must be greater than zero.');
    if (softCap.atomic > hardCap.atomic) throw new Error('Soft cap cannot exceed hard cap.');
    if (minContribution.atomic <= 0n) throw new Error('Minimum contribution must be greater than zero.');
    if (maxContribution.atomic < minContribution.atomic) {
      throw new Error('Maximum contribution must be at least the minimum contribution.');
    }
    if (maxContribution.atomic > hardCap.atomic) {
      throw new Error('Maximum contribution cannot exceed the hard cap.');
    }
    if (endAt <= startAt) throw new Error('Campaign end time must be after start time.');

    await withButton(campaignCreateButton, target, 'Confirm campaign…', async () => {
      const hash = await signTransaction(PAD_CONTRACT, 'createcamp', {
        creator,
        sale_contract: TOKEN_CONTRACT,
        token_allocation: allocation.asset,
        payment_contract: PAYMENT_CONTRACT,
        payment_symbol: `${PAYMENT_DECIMALS},${PAYMENT_SYMBOL}`,
        tokens_per_payment: rate.asset,
        start_at: startAt,
        end_at: endAt,
        soft_cap: softCap.asset,
        hard_cap: hardCap.asset,
        min_contribution: minContribution.asset,
        max_contribution: maxContribution.asset,
        allowlist_enabled: allowlistEnabled,
      });

      document.querySelector<HTMLInputElement>('#ops-symbol')!.value = saleSymbol;
      document.querySelector<HTMLSelectElement>('#ops-decimals')!.value = String(saleDecimals);
      document.querySelector<HTMLInputElement>('#ops-allocation')!.value =
        document.querySelector<HTMLInputElement>('#sale-allocation')!.value;

      const latestId = await latestCampaignForCreator(creator);
      if (latestId) {
        document.querySelector<HTMLInputElement>('#campaign-id')!.value = String(latestId);
      }

      return hash;
    });
  } catch (err: unknown) {
    showStatus(target, errorMessage(err), 'error');
  }
});

const operationsStatus = statusElement('#operations-status');

document.querySelector<HTMLButtonElement>('#fund-campaign')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    const creator = requiredAccount();
    const id = campaignId();
    const symbol = document.querySelector<HTMLInputElement>('#ops-symbol')!.value.trim().toUpperCase();
    const decimals = Number(document.querySelector<HTMLSelectElement>('#ops-decimals')!.value);
    const allocation = formatAsset(
      document.querySelector<HTMLInputElement>('#ops-allocation')!.value,
      decimals,
      symbol,
    );

    await withButton(button, operationsStatus, 'Confirm deposit…', () =>
      signTransaction(TOKEN_CONTRACT, 'transfer', {
        from: creator,
        to: PAD_CONTRACT,
        quantity: allocation.asset,
        memo: `deposit:${id}`,
      }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#activate-campaign')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    await withButton(button, operationsStatus, 'Confirm activation…', () =>
      signTransaction(PAD_CONTRACT, 'activate', { campaign_id: campaignId() }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#finalize-campaign')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    await withButton(button, operationsStatus, 'Confirm finalization…', () =>
      signTransaction(PAD_CONTRACT, 'finalize', { campaign_id: campaignId() }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#withdraw-proceeds')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    await withButton(button, operationsStatus, 'Confirm withdrawal…', () =>
      signTransaction(PAD_CONTRACT, 'withdraw', { campaign_id: campaignId() }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#reclaim-tokens')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    await withButton(button, operationsStatus, 'Confirm reclaim…', () =>
      signTransaction(PAD_CONTRACT, 'reclaim', { campaign_id: campaignId() }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#buy-campaign')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    const buyer = requiredAccount();
    const id = campaignId();
    const payment = formatAsset(
      document.querySelector<HTMLInputElement>('#buy-amount')!.value,
      PAYMENT_DECIMALS,
      PAYMENT_SYMBOL,
    );

    if (payment.atomic <= 0n) throw new Error('Contribution must be greater than zero.');

    await withButton(button, operationsStatus, 'Confirm contribution…', () =>
      signTransaction(PAYMENT_CONTRACT, 'transfer', {
        from: buyer,
        to: PAD_CONTRACT,
        quantity: payment.asset,
        memo: `buy:${id}`,
      }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#claim-tokens')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    const participant = requiredAccount();

    await withButton(button, operationsStatus, 'Confirm claim…', () =>
      signTransaction(PAD_CONTRACT, 'claim', {
        campaign_id: campaignId(),
        participant,
      }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

document.querySelector<HTMLButtonElement>('#refund-payment')!.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;

  try {
    const participant = requiredAccount();

    await withButton(button, operationsStatus, 'Confirm refund…', () =>
      signTransaction(PAD_CONTRACT, 'refund', {
        campaign_id: campaignId(),
        participant,
      }),
    );
  } catch (err: unknown) {
    showStatus(operationsStatus, errorMessage(err), 'error');
  }
});

async function updateAllowlist(button: HTMLButtonElement, allowed: boolean) {