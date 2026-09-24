module.exports = class test {
    requiresSystemContracts() {
        return true;
    }

    importContracts() {
        return [
            {
                account: 'hashedlaunch',
                path: '../contract/build',
                contract: 'hashedlaunch',
            },
        ];
    }

    requiredUnlimitedAccounts() {
        return ['hashcreator', 'receiveracct'];
    }

    tests({ assert, common }) {
        return {
            'launches HASH with an initial supply': async () => {
                const result = await common.pushAction(
                    'hashedlaunch',
                    'launch',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        '1000000.00000000 HASH',
                        '500000.00000000 HASH',
                        'Hashed Test Token',
                        'https://example.com/hash.json',
                    ],
                );

                assert(result, 'launch transaction failed');

                const stats = await common.getTable('hashedlaunch', 'HASH', 'stat');
                assert(stats.rows.length === 1, 'HASH stat row was not created');
                assert(stats.rows[0].supply === '500000.00000000 HASH', 'unexpected HASH supply');
                assert(stats.rows[0].max_supply === '1000000.00000000 HASH', 'unexpected max supply');
                assert(stats.rows[0].issuer === 'hashcreator', 'unexpected HASH issuer');

                const balances = await common.getTable('hashedlaunch', 'hashcreator', 'accounts');
                assert(
                    balances.rows.some((row) => row.balance === '500000.00000000 HASH'),
                    'issuer did not receive the initial HASH supply',
                );

                const metadata = await common.getTable('hashedlaunch', 'hashedlaunch', 'tokenmeta');
                assert(metadata.rows.length === 1, 'metadata row was not created');
                assert(metadata.rows[0].token_name === 'Hashed Test Token', 'unexpected token metadata');
            },

            'transfers HASH between Ultra accounts': async () => {
                const result = await common.pushAction(
                    'hashedlaunch',
                    'transfer',
                    'hashcreator@active',
                    [
                        'hashcreator',
                        'receiveracct',
                        '25.00000000 HASH',
                        'Hashed launcher transfer test',
                    ],
                );

                assert(result, 'transfer transaction failed');

                const receiverBalances = await common.getTable('hashedlaunch', 'receiveracct', 'accounts');
                assert(
                    receiverBalances.rows.some((row) => row.balance === '25.00000000 HASH'),
                    'receiver did not receive 25 HASH',
                );

                const creatorBalances = await common.getTable('hashedlaunch', 'hashcreator', 'accounts');
                assert(
                    creatorBalances.rows.some((row) => row.balance === '499975.00000000 HASH'),
                    'creator balance was not reduced correctly',
                );
            },

            'mints additional HASH only through the issuer': async () => {
                const result = await common.pushAction(
                    'hashedlaunch',
                    'issue',
                    'hashcreator@active',
                    ['hashcreator', '100.00000000 HASH', 'issuer mint test'],
                );

                assert(result, 'issue transaction failed');

                const stats = await common.getTable('hashedlaunch', 'HASH', 'stat');
                assert(stats.rows[0].supply === '500100.00000000 HASH', 'supply did not increase after issue');
            },

            'burns issuer-held HASH and reduces supply': async () => {
                const result = await common.pushAction(
                    'hashedlaunch',
                    'retire',
                    'hashcreator@active',
                    ['50.00000000 HASH', 'issuer burn test'],
                );

                assert(result, 'retire transaction failed');

                const stats = await common.getTable('hashedlaunch', 'HASH', 'stat');
                assert(stats.rows[0].supply === '500050.00000000 HASH', 'supply did not decrease after burn');
            },

            'rejects duplicate symbols': async () => {
                const rejected = await common.transactAssert(
                    [
                        {
                            account: 'hashedlaunch',
                            name: 'launch',
                            authorization: [{ actor: 'hashcreator', permission: 'active' }],
                            data: {
                                issuer: 'hashcreator',
                                maximum_supply: '1000.00000000 HASH',
                                initial_supply: '1000.00000000 HASH',
                                token_name: 'Duplicate HASH',
                                metadata_uri: '',
                            },
                        },
                    ],
                    'token symbol already exists on this launcher',
                );

                assert(rejected, 'duplicate HASH symbol was unexpectedly accepted');
            },
        };
    }
};
