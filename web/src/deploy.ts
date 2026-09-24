import { Api, JsonRpc, Serialize } from 'eosjs';
import { UltraWalletSDK } from '@ultraos/wallet-sdk';

const TARGET = '1aa2aa3aa4wp';
const TOKEN_FACTORY = '1aa2aa3aa4wo';
const PAYMENT_CONTRACT = 'eosio.token';
const PAYMENT_SYMBOL = '8,UOS';
const TESTNET_CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';
const RPC_ENDPOINTS = [
  'https://test.ultra.eosusa.io',
  'https://api.testnet.ultra.eossweden.org',
];

const wallet = new UltraWalletSDK({ environment: 'testnet', provider: 'extension' });

const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const accountEl = document.querySelector<HTMLSpanElement>('#account')!;
const connectBtn = document.querySelector<HTMLButtonElement>('#connect')!;
const deployBtn = document.querySelector<HTMLButtonElement>('#deploy')!;
const finishBtn = document.querySelector<HTMLButtonElement>('#finish')!;
const wasmInput = document.querySelector<HTMLInputElement>('#wasm')!;
const abiInput = document.querySelector<HTMLInputElement>('#abi')!;
let account = '';

type Authority = {
  threshold: number;
  keys: Array<{ key: string; weight: number }>;
  accounts: Array<{ permission: { actor: string; permission: string }; weight: number }>;
  waits: Array<{ wait_sec: number; weight: number }>;
};

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

function charToSymbol(char: string) {
  if (char >= 'a' && char <= 'z') return char.charCodeAt(0) - 'a'.charCodeAt(0) + 6;
  if (char >= '1' && char <= '5') return char.charCodeAt(0) - '1'.charCodeAt(0) + 1;
  return 0;
}

function nameValue(name: string) {
  let value = 0n;
  for (let i = 0; i < 13; i += 1) {
    const symbol = BigInt(charToSymbol(name[i] ?? '.'));
    if (i < 12) {
      value <<= 5n;
      value |= symbol & 0x1fn;
    } else {
      value <<= 4n;
      value |= symbol & 0x0fn;
    }
  }
  return value;
}

function sortAuthorityAccounts(accounts: Authority['accounts']) {
  return [...accounts].sort((a, b) => {
    const actorA = nameValue(a.permission.actor);
    const actorB = nameValue(b.permission.actor);
    if (actorA < actorB) return -1;
    if (actorA > actorB) return 1;
    const permA = nameValue(a.permission.permission);
    const permB = nameValue(b.permission.permission);
    return permA < permB ? -1 : permA > permB ? 1 : 0;
  });
}

async function rpc<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let lastError = 'Ultra Testnet RPC request failed.';
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = `${endpoint}: ${response.status} ${text.slice(0, 240)}`;
        continue;
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = `${endpoint}: ${messageOf(err)}`;
    }
  }
  throw new Error(lastError);
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
    rpc: new JsonRpc(RPC_ENDPOINTS[0]),
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
  finishBtn.disabled = false;
  status('Wallet connected. Contract deployment and final setup are available.', 'ok');
}

async function ensureCodePermission() {
  const info = await rpc<{
    permissions: Array<{ perm_name: string; parent: string; required_auth: Authority }>;
  }>('/v1/chain/get_account', { account_name: TARGET });

  const active = info.permissions.find((permission) => permission.perm_name === 'active');
  if (!active) throw new Error('Could not find the active permission on the Hash40 account.');

  const hasCode = active.required_auth.accounts.some(
    (entry) => entry.permission.actor === TARGET && entry.permission.permission === 'eosio.code',
  );

  if (hasCode) return null;

  const authority: Authority = {
    threshold: active.required_auth.threshold,
    keys: active.required_auth.keys ?? [],
    accounts: sortAuthorityAccounts([
      ...(active.required_auth.accounts ?? []),
      {
        permission: { actor: TARGET, permission: 'eosio.code' },
        weight: active.required_auth.threshold,
      },
    ]),
    waits: active.required_auth.waits ?? [],
  };

  const result = await wallet.signTransaction([
    {
      contract: 'eosio',
      action: 'updateauth',
      authorization: [{ actor: TARGET, permission: 'owner' }],
      data: {
        account: TARGET,
        permission: 'active',
        parent: active.parent || 'owner',
        auth: authority,
      },
    },
  ]);

  return result.data.transactionHash;
}

async function configureLaunchpad() {
  const result = await wallet.signTransaction([
    {
      contract: TARGET,
      action: 'setconfig',
      authorization: [{ actor: TARGET, permission: 'active' }],
      data: {
        launcher_contract: TOKEN_FACTORY,
        payment_contract: PAYMENT_CONTRACT,
        payment_symbol: PAYMENT_SYMBOL,
        fee_receiver: TARGET,
        fee_bps: 0,
      },
    },
  ]);

  return result.data.transactionHash;
}

async function verifySetup() {
  const [info, config] = await Promise.all([
    rpc<{
      permissions: Array<{ perm_name: string; required_auth: Authority }>;
    }>('/v1/chain/get_account', { account_name: TARGET }),
    rpc<{ rows: Array<{
      launcher_contract: string;
      payment_contract: string;
      payment_symbol: string;
      fee_receiver: string;
      fee_bps: number;
    }> }>('/v1/chain/get_table_rows', {
      json: true,
      code: TARGET,
      scope: TARGET,
      table: 'config',
      limit: 1,
    }),
  ]);

  const active = info.permissions.find((permission) => permission.perm_name === 'active');
  const hasCode = active?.required_auth.accounts.some(
    (entry) => entry.permission.actor === TARGET && entry.permission.permission === 'eosio.code',
  );
  const row = config.rows[0];

  if (!hasCode) throw new Error('eosio.code permission was not found after setup.');
  if (!row) throw new Error('Hash40 config row was not found after setup.');
  if (row.launcher_contract !== TOKEN_FACTORY) throw new Error('HashTL token factory is not configured correctly.');
  if (row.payment_contract !== PAYMENT_CONTRACT) throw new Error('UOS payment contract is not configured correctly.');
  if (row.payment_symbol !== PAYMENT_SYMBOL) throw new Error('UOS payment symbol is not configured correctly.');

  return row;
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
  finishBtn.disabled = true;
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

    status(`Deployed successfully. Transaction: ${result.data.transactionHash}. Now click Finish setup.`, 'ok');
    deployBtn.textContent = 'Deployed';
  } catch (err) {
    status(messageOf(err), 'error');
    deployBtn.disabled = false;
  } finally {
    finishBtn.disabled = false;
    connectBtn.disabled = false;
  }
});

finishBtn.addEventListener('click', async () => {
  if (!account) {
    status('Connect Ultra Wallet first.', 'error');
    return;
  }

  finishBtn.disabled = true;
  deployBtn.disabled = true;
  connectBtn.disabled = true;

  try {
    status('Step 1/3: checking eosio.code permission…');
    const permissionTx = await ensureCodePermission();

    status(
      permissionTx
        ? `Step 1/3 complete: eosio.code added (${permissionTx}). Step 2/3: approve Hash40 configuration…`
        : 'Step 1/3 complete: eosio.code already present. Step 2/3: approve Hash40 configuration…',
    );

    const configTx = await configureLaunchpad();

    status(`Step 2/3 complete: config transaction ${configTx}. Step 3/3: verifying on-chain setup…`);
    const row = await verifySetup();

    finishBtn.textContent = 'Setup complete';
    status(
      `HASH40 READY. launcher=${row.launcher_contract}, payment=${row.payment_symbol}@${row.payment_contract}, fee=${row.fee_bps} bps. Config tx: ${configTx}`,
      'ok',
    );
  } catch (err) {
    status(messageOf(err), 'error');
    finishBtn.disabled = false;
  } finally {
    deployBtn.disabled = false;
    connectBtn.disabled = false;
  }
});
