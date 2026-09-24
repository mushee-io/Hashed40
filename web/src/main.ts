import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT || 'hashedlaunch';
const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
const MAX_ASSET_AMOUNT = (1n << 62n) - 1n;

let account: string | undefined;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="shell">
    <nav>
      <div class="brand"><span class="mark">H</span> HASHED</div>
      <button id="connect" class="wallet">Connect Ultra Wallet</button>
    </nav>

    <section class="hero">
      <div class="eyebrow">ULTRA TESTNET · TOKEN LAUNCHER</div>
      <h1>Create an Ultra token<br/>in one transaction.</h1>
      <p>Create a transferable fungible token under the Hashed launcher contract. You stay the issuer.</p>
    </section>

    <section class="card">
      <div class="form-head">
        <div><span class="step">01</span><h2>Token configuration</h2></div>
        <span class="network">TESTNET</span>
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
          <div><span>Contract</span><strong>${CONTRACT}</strong></div>
          <div><span>Network</span><strong>Ultra Testnet</strong></div>
        </div>
        <button id="launch" class="launch" type="submit" disabled>Connect wallet to launch</button>
      </form>
      <div id="status" class="status"></div>
    </section>

    <footer>Hashed · Native Ultra / Antelope token launcher MVP</footer>
  </main>
`;

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const launchButton = document.querySelector<HTMLButtonElement>('#launch')!;
const issuer = document.querySelector<HTMLElement>('#issuer')!;
const status = document.querySelector<HTMLElement>('#status')!;

function showStatus(message: string, kind: 'ok' | 'error' | 'info' = 'info') {
  status.className = `status ${kind}`;
  status.textContent = message;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function parseAmount(raw: string, decimals: number): { atomic: bigint; normalized: string } {
  const value = raw.trim();

  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Enter a positive decimal amount using numbers only.');
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

  const normalized = decimals > 0 ? `${whole}.${fraction}` : whole;
  return { atomic, normalized };
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

connectButton.addEventListener('click', async () => {
  if (!('ultra' in window)) {
    showStatus(
      'Ultra Wallet Extension was not detected. On Testnet, use the browser extension and open this site over HTTPS.',
      'error',
    );
    return;
  }

  showStatus('Opening Ultra Wallet…');

  try {
    const { data } = await wallet.connect();
    account = data.blockchainid;

    if (!account) throw new Error('Ultra Wallet connected without returning a blockchain account.');

    connectButton.textContent = account;
    issuer.textContent = account;
    launchButton.disabled = false;
    launchButton.textContent = 'Create token';
    showStatus('Wallet connected to Ultra Testnet.', 'ok');
  } catch (err: unknown) {
    showStatus(errorMessage(err), 'error');
  }
});

document.querySelector<HTMLFormElement>('#launch-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!account) {
    showStatus('Connect your Ultra Wallet first.', 'error');
    return;
  }

  const tokenName = document.querySelector<HTMLInputElement>('#name')!.value.trim();
  const tokenSymbol = document.querySelector<HTMLInputElement>('#symbol')!.value.trim().toUpperCase();
  const maxRaw = document.querySelector<HTMLInputElement>('#max')!.value;
  const initialRaw = document.querySelector<HTMLInputElement>('#initial')!.value;
  const decimals = Number(document.querySelector<HTMLSelectElement>('#decimals')!.value);
  const metadataUri = document.querySelector<HTMLInputElement>('#uri')!.value.trim();

  if (utf8Length(tokenName) === 0 || utf8Length(tokenName) > 64) {
    showStatus('Token name must be between 1 and 64 UTF-8 bytes.', 'error');
    return;
  }

  if (!/^[A-Z]{1,7}$/.test(tokenSymbol)) {
    showStatus('Symbol must be 1–7 uppercase A–Z characters.', 'error');
    return;
  }

  if (![4, 6, 8].includes(decimals)) {
    showStatus('Unsupported token precision.', 'error');
    return;
  }

  if (utf8Length(metadataUri) > 256) {
    showStatus('Metadata URI must be at most 256 UTF-8 bytes.', 'error');
    return;
  }

  try {
    const maximumSupply = formatAsset(maxRaw, decimals, tokenSymbol);
    const initialSupply = formatAsset(initialRaw, decimals, tokenSymbol);

    if (maximumSupply.atomic <= 0n) {
      throw new Error('Maximum supply must be greater than zero.');
    }

    if (initialSupply.atomic > maximumSupply.atomic) {
      throw new Error('Initial supply cannot exceed maximum supply.');
    }

    launchButton.disabled = true;
    launchButton.textContent = 'Confirm in wallet…';

    // The connected Ultra account signs with its active permission by default.
    // Keeping the transaction shape minimal follows the official Wallet SDK format.
    const { data } = await wallet.signTransaction({
      contract: CONTRACT,
      action: 'launch',
      data: {
        issuer: account,
        maximum_supply: maximumSupply.asset,
        initial_supply: initialSupply.asset,
        token_name: tokenName,
        metadata_uri: metadataUri,
      },
    });

    showStatus(`Token launched. Transaction: ${data.transactionHash}`, 'ok');
  } catch (err: unknown) {
    showStatus(errorMessage(err), 'error');
  } finally {
    launchButton.disabled = false;
    launchButton.textContent = 'Create token';
  }
});
