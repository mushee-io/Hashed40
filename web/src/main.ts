import { UltraWalletSDK } from '@ultraos/wallet-sdk';
import './style.css';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT || 'hashedlaunch';
const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });
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
      <p>Deploy a transferable fungible token under the Hashed launcher contract. You stay the issuer.</p>
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
          <label>Maximum supply<input id="max" type="number" min="0.0001" step="any" value="1000000" required /></label>
          <label>Initial supply<input id="initial" type="number" min="0" step="any" value="1000000" required /></label>
        </div>
        <div class="grid2">
          <label>Decimals<select id="decimals"><option>4</option><option>6</option><option selected>8</option></select></label>
          <label>Metadata URI <span>(optional)</span><input id="uri" placeholder="ipfs://... or https://..." /></label>
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

function formatAsset(raw: string, decimals: number, symbol: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid token amount');
  return `${value.toFixed(decimals)} ${symbol}`;
}

connectButton.addEventListener('click', async () => {
  showStatus('Opening Ultra Wallet…');
  try {
    const { data } = await wallet.connect();
    account = data.blockchainid;
    connectButton.textContent = account;
    issuer.textContent = account;
    launchButton.disabled = false;
    launchButton.textContent = 'Create token';
    showStatus('Wallet connected.', 'ok');
  } catch (err: any) {
    showStatus(err?.message ?? 'Wallet connection failed.', 'error');
  }
});

document.querySelector<HTMLFormElement>('#launch-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!account) return showStatus('Connect your Ultra Wallet first.', 'error');

  const tokenName = (document.querySelector<HTMLInputElement>('#name')!.value || '').trim();
  const tokenSymbol = document.querySelector<HTMLInputElement>('#symbol')!.value.trim().toUpperCase();
  const max = document.querySelector<HTMLInputElement>('#max')!.value;
  const initial = document.querySelector<HTMLInputElement>('#initial')!.value;
  const decimals = Number(document.querySelector<HTMLSelectElement>('#decimals')!.value);
  const metadataUri = document.querySelector<HTMLInputElement>('#uri')!.value.trim();

  if (!/^[A-Z]{1,7}$/.test(tokenSymbol)) return showStatus('Symbol must be 1–7 uppercase A–Z characters.', 'error');
  if (Number(initial) > Number(max)) return showStatus('Initial supply cannot exceed maximum supply.', 'error');

  try {
    launchButton.disabled = true;
    launchButton.textContent = 'Confirm in wallet…';

    const { data } = await wallet.signTransaction({
      contract: CONTRACT,
      action: 'launch',
      authorization: [{ actor: account, permission: 'active' }],
      data: {
        issuer: account,
        maximum_supply: formatAsset(max, decimals, tokenSymbol),
        initial_supply: formatAsset(initial, decimals, tokenSymbol),
        token_name: tokenName,
        metadata_uri: metadataUri,
      },
    });

    showStatus(`Token launched. Transaction: ${data.transactionHash}`, 'ok');
  } catch (err: any) {
    showStatus(err?.data?.message ?? err?.message ?? 'Token launch transaction failed.', 'error');
  } finally {
    launchButton.disabled = false;
    launchButton.textContent = 'Create token';
  }
});
