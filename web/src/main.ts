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
        `${PAD_CONTRACT} is the Hash40 contract/admin account. Switch Ultra Wallet to a different Testnet user account before creating or trading memes.`,
      );
    }

    account = connectedAccount;
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
  if (creator === PAD_CONTRACT) {
    showStatus(
      target,
      `${PAD_CONTRACT} is the Hash40 contract account and cannot seed tokens to itself. Switch to a separate Testnet user account.`,
      'error',
    );
    return;
  }

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
