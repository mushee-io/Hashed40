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

        const balance = async (account, symbol) => {
            const rows = await common.getTable('hashedlaunch', account, 'accounts');
            const row = rows.rows.find((entry) => entry.balance.endsWith(` ${symbol}`));
            return row ? row.balance : null;
        };

        const amount = (asset) => {
            if (!asset) return 0;
            return Number(asset.split(' ')[0]);
        };

        return {
            'bootstraps Hashed token launcher and meme launchpad': async () => {
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

                    if (account === 'hashedpad') padPublicKey = publicKey;

                    const created = await cleos(
                        `create account eosio ${account} ${publicKey} ${publicKey}`,
                        { swallow: false, fetch: false },
                    );
                    assert(created, `could not create local account ${account}`);
                }

                const buildDir = path.resolve(__dirname, '../contract/build');

                const launcherDeployed = await cleos(
                    `set contract hashedlaunch "${buildDir}" hashedlaunch.wasm hashedlaunch.abi -p hashedlaunch@active`,
                    { swallow: false, fetch: false },
                );
                assert(launcherDeployed, 'hashedlaunch deployment failed');

                const padDeployed = await cleos(
                    `set contract hashedpad "${buildDir}" hashedpad.wasm hashedpad.abi -p hashedpad@active`,
                    { swallow: false, fetch: false },
                );
                assert(padDeployed, 'hashedpad deployment failed');

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

                const permissionUpdated = await cleos(
                    `set account permission hashedpad active '${activeAuthority}' owner -p hashedpad@owner`,
                    { swallow: false, fetch: false },
                );
                assert(permissionUpdated, 'could not add hashedpad@eosio.code permission');

                await push(
                    'hashedpad',
                    'setconfig',
                    'hashedpad@active',
                    ['hashedlaunch', 'hashedlaunch', '8,TUOS', 'platformfee', 250],
                    'meme launchpad config failed',
                );
            },

            'creates meme token and local test UOS': async () => {
                await push(
                    'hashedlaunch',
                    'launch',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '1000000.00000000 HASH',
                        '500000.00000000 HASH',
                        'Hashed Meme',
                        'ipfs://hashed-meme',
                    ],
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
                    ['hashcreator', 'buyerone', '2000.00000000 TUOS', 'test funds'],
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'buyertwo', '3000.00000000 TUOS', 'test funds'],
                );

                assert(amount(await balance('buyerone', 'TUOS')) === 2000, 'buyer one TUOS missing');
                assert(amount(await balance('buyertwo', 'TUOS')) === 3000, 'buyer two TUOS missing');
            },

            'creates and activates a meme bonding-curve market': async () => {
                await push(
                    'hashedpad',
                    'createmarket',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '8,HASH',
                        '100000.00000000 HASH',
                        '0.01000000 TUOS',
                        '0.05000000 TUOS',
                        '500.00000000 TUOS',
                        'Hashed Meme',
                        'ipfs://hashed-image',
                        'A meme launched natively on Ultra.',
                        'https://hashed.example',
                        'https://x.com/hashed',
                        'https://t.me/hashed',
                    ],
                    'market creation failed',
                );

                let markets = await common.getTable('hashedpad', 'hashedpad', 'markets');
                assert(markets.rows.length === 1, 'market was not created');
                assert(markets.rows[0].status === 0, 'market should begin in draft');
                assert(markets.rows[0].token_symbol === '8,HASH', 'market token symbol mismatch');

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'hashedpad', '100000.00000000 HASH', 'seed:1'],
                    'market seed failed',
                );

                await push('hashedpad', 'activate', 'hashcreator@active', [1]);

                markets = await common.getTable('hashedpad', 'hashedpad', 'markets');
                assert(markets.rows[0].status === 1, 'market did not go live');
                assert(markets.rows[0].deposited === '100000.00000000 HASH', 'seed balance mismatch');
            },

            'buys meme token with bonding-curve pricing': async () => {
                const before = amount(await balance('buyerone', 'HASH'));

                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyerone@active',
                    ['buyerone', 'hashedpad', '100.00000000 TUOS', 'buy:1'],
                    'bonding-curve buy failed',
                );

                const after = amount(await balance('buyerone', 'HASH'));
                assert(after > before, 'buyer did not receive HASH');

                const markets = await common.getTable('hashedpad', 'hashedpad', 'markets');
                const market = markets.rows[0];

                assert(market.status === 1, 'market graduated too early');
                assert(amount(market.sold) > 0, 'curve sold amount did not increase');
                assert(amount(market.reserve) > 0, 'curve reserve did not increase');
                assert(amount(await balance('platformfee', 'TUOS')) > 0, 'protocol buy fee was not paid');
            },

            'sells meme token back into the curve': async () => {
                const uosBefore = amount(await balance('buyerone', 'TUOS'));

                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyerone@active',
                    ['buyerone', 'hashedpad', '1000.00000000 HASH', 'sell:1'],
                    'bonding-curve sell failed',
                );

                const uosAfter = amount(await balance('buyerone', 'TUOS'));
                assert(uosAfter > uosBefore, 'seller did not receive TUOS');

                const markets = await common.getTable('hashedpad', 'hashedpad', 'markets');
                assert(markets.rows[0].status === 1, 'market should still be live after ordinary sell');
            },

            'graduates market when curve reserve reaches target': async () => {
                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyertwo@active',
                    ['buyertwo', 'hashedpad', '700.00000000 TUOS', 'buy:1'],
                    'graduation buy failed',
                );

                const markets = await common.getTable('hashedpad', 'hashedpad', 'markets');
                const market = markets.rows[0];

                assert(market.status === 2, 'market did not graduate');
                assert(market.graduated_at > 0, 'graduation timestamp was not written');
                assert(amount(market.reserve) >= 500, 'graduation reserve target was not reached');
                assert(amount(await balance('buyertwo', 'HASH')) > 0, 'buyer two did not receive HASH');
            },

            'blocks curve trading after graduation and lets creator settle': async () => {
                await common.transactAssert(
                    [
                        {
                            account: 'hashedlaunch',
                            name: 'transfer',
                            authorization: [{ actor: 'buyerone', permission: 'active' }],
                            data: {
                                from: 'buyerone',
                                to: 'hashedpad',
                                quantity: '10.00000000 TUOS',
                                memo: 'buy:1',
                            },
                        },
                    ],
                    'market is not live',
                );

                const creatorUosBefore = amount(await balance('hashcreator', 'TUOS'));

                await push('hashedpad', 'settle', 'hashcreator@active', [1], 'market settlement failed');

                const markets = await common.getTable('hashedpad', 'hashedpad', 'markets');
                assert(markets.rows[0].status === 3, 'market was not closed after settlement');
                assert(markets.rows[0].reserve === '0.00000000 TUOS', 'reserve was not settled');

                const creatorUosAfter = amount(await balance('hashcreator', 'TUOS'));
                assert(creatorUosAfter > creatorUosBefore, 'creator did not receive graduated market reserve');
            },
        };
    }
};
