#!/usr/bin/node --harmony
'use strict';

const yargs = require('yargs/yargs');
const fetch = require('cross-fetch');

const DEFAULT_MTE_PORT = 6200;

const argv = yargs(process.argv.slice(2))
    .option({
        'h': {
            alias: 'host',
            describe: 'Mte service host/ip. '
                + ' When no Mte service host provided, real load values are'
                + ' required to be entered manually.',
            type: 'string',
        },
       'p': {
            alias: 'port',
            describe: 'Mte service TCP por', 
            type: 'number',
            default: DEFAULT_MTE_PORT,
        },
    })
    .command('set <key> <value>', 'config Mte service.',
        argv => {
            argv.option({
                'mte-host': {
                    describe: 'Mte device host/ip',
                    type: 'string',
                },
                'mte-port': {
                    describe: 'Mte device TCP port', 
                    type: 'number',
                    default: DEFAULT_MTE_PORT,
                },
            })
        },
        argv => {
            mteSet(argv.host, argv.port, argv.key, argv.value);
        }
    )
    .argv;

async function mteSet(host, port, key, value)
{
    const apiRoot = `http://${host}:${port}/api`;
    const setup = {};
    setup[key] = value;
    const resp = await fetch(`${apiRoot}/mteconfig`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(setup),
    });

    if (! resp.ok) {
        console.log(`Mte service error: ${resp.status}`);
        process.exit(1);
    }
    const result = await resp.json();
    if (result.result != 'success') {
        console.log(`Mte error: ${result.result}`);
        process.exit(1);
    }
}
