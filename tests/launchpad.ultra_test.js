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

        const balanceOf = async (account, symbol) => {
            const rows = await common.getTable('hashedlaunch', account, 'accounts');
            const row = rows.rows.find((entry) => entry.balance.endsWith(` ${symbol}`));
            return row ? row.balance : null;
        };

        return {
            'bootstraps Hashed launcher and launchpad contracts': async () => {
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

                const launcherDeployed = await cleos(
                    `set contract hashedlaunch "${buildDir}" hashedlaunch.wasm hashedlaunch.abi -p hashedlaunch@active`,
                    { swallow: false, fetch: false },
                );
                assert(launcherDeployed, 'hashedlaunch contract deployment failed');

                const padDeployed = await cleos(
                    `set contract hashedpad "${buildDir}" hashedpad.wasm hashedpad.abi -p hashedpad@active`,
                    { swallow: false, fetch: false },
                );
                assert(padDeployed, 'hashedpad contract deployment failed');

                // Claims/refunds/proceeds are inline token transfers from hashedpad.
                // Give the contract's code permission authority to satisfy require_auth(from)
                // in standard Antelope-style token contracts.
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
                    ['platformfee', 250],
                    'launchpad fee config failed',
                );
            },

            'creates sale and payment test tokens': async () => {
                await push(
                    'hashedlaunch',
                    'launch',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '1000000.00000000 HASH',
                        '500000.00000000 HASH',
                        'Hashed Sale Token',
                        'https://example.com/hash.json',
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
                        'https://example.com/tuos.json',
                    ],
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'buyerone', '3000.00000000 TUOS', 'test launchpad funds'],
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'buyertwo', '2000.00000000 TUOS', 'test launchpad funds'],
                );

                assert(
                    (await balanceOf('buyerone', 'TUOS')) === '3000.00000000 TUOS',
                    'buyer one payment balance mismatch',
                );
                assert(
                    (await balanceOf('buyertwo', 'TUOS')) === '2000.00000000 TUOS',
                    'buyer two payment balance mismatch',
                );
            },

            'creates, funds, and activates launch campaign 1': async () => {
                await push(
                    'hashedpad',
                    'createcamp',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        'hashedlaunch',
                        '100000.00000000 HASH',
                        'hashedlaunch',
                        '8,TUOS',
                        '10.00000000 HASH',
                        0,
                        4102444800,
                        '1000.00000000 TUOS',
                        '2500.00000000 TUOS',
                        '10.00000000 TUOS',
                        '1500.00000000 TUOS',
                        false,
                    ],
                );

                const campaigns = await common.getTable('hashedpad', 'hashedpad', 'campaigns');
                assert(campaigns.rows.length === 1, 'campaign 1 was not created');
                assert(campaigns.rows[0].id === 1, 'unexpected campaign id');
                assert(campaigns.rows[0].status === 0, 'campaign should begin in draft status');
                assert(campaigns.rows[0].fee_bps === 250, 'campaign did not snapshot platform fee');

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'hashedpad', '100000.00000000 HASH', 'deposit:1'],
                    'campaign token escrow deposit failed',
                );

                await push('hashedpad', 'activate', 'hashcreator@active', [1]);

                const updated = await common.getTable('hashedpad', 'hashedpad', 'campaigns');
                assert(updated.rows[0].status === 1, 'campaign 1 did not activate');
                assert(
                    updated.rows[0].deposited === '100000.00000000 HASH',
                    'campaign token escrow balance mismatch',
                );
            },

            'accepts contributions and calculates token allocations': async () => {
                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyerone@active',
                    ['buyerone', 'hashedpad', '1500.00000000 TUOS', 'buy:1'],
                    'buyer one contribution failed',
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyertwo@active',
                    ['buyertwo', 'hashedpad', '1000.00000000 TUOS', 'buy:1'],
                    'buyer two contribution failed',
                );

                const campaigns = await common.getTable('hashedpad', 'hashedpad', 'campaigns');
                const campaign = campaigns.rows.find((row) => row.id === 1);

                assert(campaign.raised === '2500.00000000 TUOS', 'raised amount mismatch');
                assert(campaign.sold === '25000.00000000 HASH', 'sold token amount mismatch');

                const buyerOne = await common.getTable('hashedpad', '1', 'contribs');
                const contribution = buyerOne.rows.find((row) => row.account === 'buyerone');
                assert(contribution.paid === '1500.00000000 TUOS', 'buyer one paid amount mismatch');
                assert(contribution.claimable === '15000.00000000 HASH', 'buyer one allocation mismatch');
            },

            'finalizes a successful launch and lets buyers claim': async () => {
                await push('hashedpad', 'finalize', 'buyerone@active', [1]);

                let campaigns = await common.getTable('hashedpad', 'hashedpad', 'campaigns');
                let campaign = campaigns.rows.find((row) => row.id === 1);
                assert(campaign.status === 2, 'campaign 1 should be successful');

                await push('hashedpad', 'claim', 'buyerone@active', [1, 'buyerone']);
                await push('hashedpad', 'claim', 'buyertwo@active', [1, 'buyertwo']);

                assert(
                    (await balanceOf('buyerone', 'HASH')) === '15000.00000000 HASH',
                    'buyer one claim balance mismatch',
                );
                assert(
                    (await balanceOf('buyertwo', 'HASH')) === '10000.00000000 HASH',
                    'buyer two claim balance mismatch',
                );
            },

            'splits successful proceeds and returns unsold sale tokens': async () => {
                await push('hashedpad', 'withdraw', 'hashcreator@active', [1]);

                assert(
                    (await balanceOf('platformfee', 'TUOS')) === '62.50000000 TUOS',
                    '2.5% launchpad fee was not paid correctly',
                );

                assert(
                    (await balanceOf('hashcreator', 'TUOS')) === '97437.50000000 TUOS',
                    'creator proceeds balance mismatch',
                );

                await push('hashedpad', 'reclaim', 'hashcreator@active', [1]);

                assert(
                    (await balanceOf('hashcreator', 'HASH')) === '475000.00000000 HASH',
                    'creator did not recover unsold HASH',
                );
            },

            'refunds contributors when a campaign misses its soft cap': async () => {
                const endAt = Math.floor(Date.now() / 1000) + 3;

                await push(
                    'hashedpad',
                    'createcamp',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        'hashedlaunch',
                        '10000.00000000 HASH',
                        'hashedlaunch',
                        '8,TUOS',
                        '10.00000000 HASH',
                        0,
                        endAt,
                        '1000.00000000 TUOS',
                        '1000.00000000 TUOS',
                        '10.00000000 TUOS',
                        '1000.00000000 TUOS',
                        false,
                    ],
                );

                await push(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    ['hashcreator', 'hashedpad', '10000.00000000 HASH', 'deposit:2'],
                );

                await push('hashedpad', 'activate', 'hashcreator@active', [2]);

                await push(
                    'hashedlaunch',
                    'transfer',
                    'buyerone@active',
                    ['buyerone', 'hashedpad', '100.00000000 TUOS', 'buy:2'],
                );

                await new Promise((resolve) => setTimeout(resolve, 4500));

                await push('hashedpad', 'finalize', 'buyerone@active', [2]);

                const campaigns = await common.getTable('hashedpad', 'hashedpad', 'campaigns');
                const campaign = campaigns.rows.find((row) => row.id === 2);
                assert(campaign.status === 3, 'campaign 2 should fail below soft cap');

                await push('hashedpad', 'refund', 'buyerone@active', [2, 'buyerone']);

                assert(
                    (await balanceOf('buyerone', 'TUOS')) === '1500.00000000 TUOS',
                    'buyer one did not receive the failed-launch refund',
                );

                await push('hashedpad', 'reclaim', 'hashcreator@active', [2]);

                assert(
                    (await balanceOf('hashcreator', 'HASH')) === '475000.00000000 HASH',
                    'failed campaign escrow was not fully returned',
                );
            },
        };
    }
};
