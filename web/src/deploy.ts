import { Api, JsonRpc, Serialize } from 'eosjs';
import { UltraWalletSDK } from '@ultraos/wallet-sdk';

const TARGET = '1aa2aa3aa4wp';
const TESTNET_CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';
const RPC = 'https://test.ultra.eosusa.io';

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });

const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const accountEl = document.querySelector<HTMLSpanElement>('#account')!;
const connectBtn = document.querySelector<HTMLButtonElement>('#connect')!;
const deployBtn = document.querySelector<HTMLButtonElement>('#deploy')!;
const wasmInput = document.querySelector<HTMLInputElement>('#wasm')!;
const abiInput = document.querySelector<HTMLInputElement>('#abi')!;
let account = '';

function status(message: string, type: 'info' | 'ok' | 'error' = 'info') {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
}

function messageOf(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as { message?: string; data?: unknown };
    if (typeof e.data === 'string') return e.data;
    return e.message ?? JSON.stringify(err);
  }
  return String(err);
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function dummySignatureProvider() {
  return {
    getAvailableKeys: async () => [],
    sign: async () => {
      throw new Error('Signing is handled by Ultra Wallet.');
    },
  };
}

async function packAbi(file: File) {
  const raw = JSON.parse(await file.text()) as Record<string, unknown>;
  const api = new Api({
    rpc: new JsonRpc(RPC),
    signatureProvider: dummySignatureProvider(),
    textEncoder: new TextEncoder(),
    textDecoder: new TextDecoder(),
  });

  const abiDefinition = api.abiTypes.get('abi_def');
  if (!abiDefinition) throw new Error('Could not initialize ABI serializer.');

  const fields = (abiDefinition as unknown as { fields: Array<{ name: string }> }).fields;
  const normalized = fields.reduce<Record<string, unknown>>(
    (acc, { name }) => Object.assign(acc, { [name]: acc[name] ?? [] }),
    raw,
  );

  const buffer = new Serialize.SerialBuffer({
    textEncoder: new TextEncoder(),
    textDecoder: new TextDecoder(),
  });

  abiDefinition.serialize(buffer, normalized);
  return toHex(buffer.asUint8Array());
}

async function connect() {
  if (!('ultra' in window)) throw new Error('Ultra Wallet Extension was not detected.');

  const chain = await wallet.getChainId();
  if (chain.data !== TESTNET_CHAIN_ID) {
    throw new Error('Switch Ultra Wallet to Testnet, then connect again.');
  }

  const result = await wallet.connect();
  const connected = result.data.blockchainid;
  if (!connected) throw new Error('Ultra Wallet did not return an account.');
  if (connected !== TARGET) {
    throw new Error(`Wrong account connected. Select ${TARGET}@active in Ultra Wallet.`);
  }

  account = connected;
  accountEl.textContent = `${account}@active`;
  connectBtn.textContent = 'Connected';
  deployBtn.disabled = false;
  status('Wallet connected. Select hashedpad.wasm and hashedpad.abi.', 'ok');
}

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  try {
    status('Opening Ultra Wallet…');
    await connect();
  } catch (err) {
    status(messageOf(err), 'error');
  } finally {
    connectBtn.disabled = false;
  }
});

deployBtn.addEventListener('click', async () => {
  if (!account) {
    status('Connect Ultra Wallet first.', 'error');
    return;
  }

  const wasm = wasmInput.files?.[0];
  const abi = abiInput.files?.[0];

  if (!wasm || !abi) {
    status('Select both hashedpad.wasm and hashedpad.abi.', 'error');
    return;
  }

  if (!wasm.name.endsWith('.wasm') || !abi.name.endsWith('.abi')) {
    status('Use the hashedpad.wasm and hashedpad.abi files from the GitHub artifact.', 'error');
    return;
  }

  deployBtn.disabled = true;
  connectBtn.disabled = true;

  try {
    status('Preparing contract deployment…');

    const wasmHex = toHex(new Uint8Array(await wasm.arrayBuffer()));
    const abiHex = await packAbi(abi);

    status('Waiting for Ultra Wallet approval…');

    const result = await wallet.signTransaction([
      {
        contract: 'eosio',
        action: 'setcode',
        authorization: [{ actor: TARGET, permission: 'active' }],
        data: {
          account: TARGET,
          vmtype: 0,
          vmversion: 0,
          code: wasmHex,
        },
      },
      {
        contract: 'eosio',
        action: 'setabi',
        authorization: [{ actor: TARGET, permission: 'active' }],
        data: {
          account: TARGET,
          abi: abiHex,
        },
      },
    ]);

    status(`Deployed successfully. Transaction: ${result.data.transactionHash}`, 'ok');
    deployBtn.textContent = 'Deployed';
  } catch (err) {
    status(messageOf(err), 'error');
    deployBtn.disabled = false;
  } finally {
    connectBtn.disabled = false;
  }
});
