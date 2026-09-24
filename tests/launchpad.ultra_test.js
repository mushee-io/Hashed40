const path = require('path');

module.exports = class test {
    requiresSystemContracts() {
        return false;
    }

    tests({ assert, common, cleos, keychain }) {
        let padPublicKey;

        const push = async (contract, action, authority, args, message) => {
            const result = await common.pushAction(contract, action, authority, args);
            assert(result, message || `${contract}::${action} failed`);
            return result;
        };

        const balanceString = async (account, symbol) => {
            const rows = await common.getTable('hashedlaunch', account, 'accounts');
            const row = rows.rows.find((entry) => entry.balance.endsWith(` ${symbol}`));
            return row ? row.balance : null;
        };

        const balanceAmount = async (account, symbol) => {
            const balance = await balanceString(account, symbol);
            if (!balance) return 0;
            return Number(balance.split(' ')[0]);
        };

        return {
            'bootstraps Hashed launcher and meme launchpad': async () => {
                const accounts = [
                    'hashedlaunch',
                    'hashedpad',
                    'hashcreator',
                    'buyerone',
                    'buyertwo',
                    'platformfee',
                ];

                for (const account of accounts) {
                    const publicKey = await keychain.generateAndReturnPublicKey(account);
                    assert(publicKey, `could not generate key for ${account}`);

                    if (account === 'hashedpad') {
                        padPublicKey = publicKey;
                    }

                    const created = await cleos(
                        `create account eosio ${account} ${publicKey} ${publicKey}`,
                        { swallow: false, fetch: false },
                    );
                    assert(created, `could not create local account ${account}`);
                }

                const buildDir = path.resolve(__dirname, '../contract/build');

                assert(
                    await cleos(
                        `set contract hashedlaunch "${buildDir}" hashedlaunch.wasm hashedlaunch.abi -p hashedlaunch@active`,
                        { swallow: false, fetch: false },
                    ),
                    'hashedlaunch deployment failed',
                );

                assert(
                    await cleos(
                        `set contract hashedpad "${buildDir}" hashedpad.wasm hashedpad.abi -p hashedpad@active`,
                        { swallow: false, fetch: false },
                    ),
                    'hashedpad deployment failed',
                );

                const activeAuthority = JSON.stringify({
                    threshold: 1,
                    keys: [{ key: padPublicKey, weight: 1 }],
                    accounts: [
                        {
                            permission: { actor: 'hashedpad', permission: 'eosio.code' },
                            weight: 1,
                        },
                    ],
                    waits: [],
                });

                assert(
                    await cleos(
                        `set account permission hashedpad active '${activeAuthority}' owner -p hashedpad@owner`,
                        { swallow: false, fetch: false },
                    ),
                    'could not add hashedpad@eosio.code permission',
                );

                await push(
                    'hashedpad',
                    'setconfig',
                    'hashedpad@active',
                    [
                        'hashedlaunch',
                        'hashedlaunch',
                        '8,TUOS',
                        'platformfee',
                        100,
                        50,
                        '1000.00000000 TUOS',
                        '200.00000000 TUOS',
                    ],
                    'meme launchpad configuration failed',
                );
            },

            'creates a fixed-supply meme token and local payment token': async () => {
                await push(
                    'hashedlaunch',
                    'launch',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '1000000.00000000 MEME',
                        '1000000.00000000 MEME',
                        'Ultra Meme',
                        'ipfs://ultra-meme-token',
                    ],
                );

                await push(
                    'hashedlaunch',
                    'lockmint',
                    'hashcreator@active',
                    ['hashcreator', 'MEME'],
                );

                await push(
                    'hashedlaunch',
                    'launch',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '1000000.00000000 TUOS',
                        '100000.00000000 TUOS',
                        'Test UOS',
                        'ipfs://test-uos',
                    ],
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'buyerone', '1000.00000000 TUOS', 'meme test funds'],
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'buyertwo', '1000.00000000 TUOS', 'meme test funds'],
                );

                const stats = await common.getTable('hashedlaunch', 'MEME', 'stat');
                assert(Boolean(stats.rows[0].mint_locked), 'MEME supply is not mint locked');
                assert(
                    stats.rows[0].supply === '1000000.00000000 MEME',
                    'MEME full supply was not issued',
                );
            },

            'creates a meme launch from the locked Hashed token': async () => {
                await push(
                    'hashedpad',
                    'creatememe',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '8,MEME',
                        'Ultra Meme',
                        'https://example.com/meme.png',
                        'A meme token launched natively on Ultra.',
                        'https://example.com',
                        'https://x.com/example',
                        'https://t.me/example',
                    ],
                );

                const launches = await common.getTable('hashedpad', 'hashedpad', 'launches');
                assert(launches.rows.length === 1, 'meme launch was not created');

                const launch = launches.rows[0];
                assert(launch.id === 1, 'unexpected meme launch id');
                assert(launch.status === 0, 'new meme launch should be a draft');
                assert(
                    launch.token_allocation === '1000000.00000000 MEME',
                    'launch did not capture the fixed token supply',
                );
                assert(launch.token_name === 'Ultra Meme', 'meme metadata was not stored');
            },

            'escrows the entire token supply and automatically goes live': async () => {
                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'hashedpad', '1000000.00000000 MEME', 'deposit:1'],
                );

                const launches = await common.getTable('hashedpad', 'hashedpad', 'launches');
                const launch = launches.rows[0];

                assert(launch.status === 1, 'meme launch did not go live after escrow');
                assert(
                    launch.token_reserve === '1000000.00000000 MEME',
                    'bonding curve token reserve mismatch',
                );
                assert(
                    (await balanceString('hashcreator', 'MEME')) === null,
                    'creator should not retain meme supply after escrow',
                );
            },

            'buys MEME with the bonding curve and pays protocol and creator fees': async () => {
                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyerone@active',
                    ['buyerone', 'hashedpad', '100.00000000 TUOS', 'buy:1'],
                );

                const launches = await common.getTable('hashedpad', 'hashedpad', 'launches');
                const launch = launches.rows[0];

                assert(
                    launch.payment_reserve === '98.50000000 TUOS',
                    'net bonding curve reserve should exclude 1.5% fees',
                );
                assert(
                    Number(launch.token_reserve.split(' ')[0]) < 1000000,
                    'bonding curve did not release MEME',
                );

                const buyerTokens = await balanceAmount('buyerone', 'MEME');
                assert(buyerTokens > 0, 'buyer one did not receive MEME');

                assert(
                    (await balanceString('platformfee', 'TUOS')) === '1.00000000 TUOS',
                    'protocol fee was not paid',
                );

                const creatorPayment = await balanceAmount('hashcreator', 'TUOS');
                assert(creatorPayment > 98000, 'creator trading fee was not paid');
            },

            'second buy crosses the graduation target while curve trading remains available': async () => {
                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyertwo@active',
                    ['buyertwo', 'hashedpad', '150.00000000 TUOS', 'buy:1'],
                );

                const launches = await common.getTable('hashedpad', 'hashedpad', 'launches');
                const launch = launches.rows[0];

                assert(Boolean(launch.graduated), 'meme launch did not reach graduation');
                assert(
                    Number(launch.payment_reserve.split(' ')[0]) >= 200,
                    'graduation reserve target was not reached',
                );
                assert(launch.trade_count === 2, 'unexpected trade count after two buys');
            },

            'sells MEME back into the bonding curve for TUOS': async () => {
                const before = await balanceAmount('buyerone', 'TUOS');

                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyerone@active',
                    ['buyerone', 'hashedpad', '10000.00000000 MEME', 'sell:1'],
                );

                const after = await balanceAmount('buyerone', 'TUOS');
                assert(after > before, 'seller did not receive TUOS from the bonding curve');

                const launches = await common.getTable('hashedpad', 'hashedpad', 'launches');
                const launch = launches.rows[0];

                assert(launch.trade_count === 3, 'sell trade was not counted');
                assert(Boolean(launch.graduated), 'graduation flag should be permanent');

                const trades = await common.getTable('hashedpad', '1', 'trades');
                assert(trades.rows.length === 3, 'recent trade history was not recorded');
                assert(trades.rows[2].is_buy === false, 'third trade should be a sell');
            },

            'blocks new minting after the meme token has launched': async () => {
                await common.transactAssert(
                    [
                        {
                            account: 'hashedlaunch',
                            name: 'issue',
                            authorization: [{ actor: 'hashcreator', permission: 'active' }],
                            data: {
                                to: 'hashcreator',
                                quantity: '1.00000000 MEME',
                                memo: 'attempt to inflate fixed supply',
                            },
                        },
                    ],
                    'minting is permanently locked for this token',
                );
            },

            'prevents duplicate meme launches for the same token': async () => {
                await common.transactAssert(
                    [
                        {
                            account: 'hashedpad',
                            name: 'creatememe',
                            authorization: [{ actor: 'hashcreator', permission: 'active' }],
                            data: {
                                creator: 'hashcreator',
                                sale_symbol: '8,MEME',
                                token_name: 'Ultra Meme Again',
                                image_uri: 'https://example.com/meme2.png',
                                description: 'duplicate launch',
                                website: '',
                                x_url: '',
                                telegram_url: '',
                            },
                        },
                    ],
                    'this token already has a meme launch',
                );
            },
        };
    }
};