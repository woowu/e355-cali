#!/usr/bin/node --harmony
'use strict';

const SerialPort = require('serialport').SerialPort;
const yargs = require('yargs/yargs');
const readline = require('readline');
const dump = require('buffer-hexdump');
const ConnMeter = require('./operations/ConnMeter');
const CalInit = require('./operations/CalInit');

const argv = yargs(process.argv.slice(2))
    .option({
        'd': {
            alias: 'device',
            describe: 'device name of serial port to meter, e.g., /dev/ttyUSB0, COM2',
            type: 'string',
            demandOption: true,
        },
        'b': {
            alias: 'baud',
            describe: 'baud rate of meter connection',
            default: 9600,
            type: 'number',
        },
        'p': {
            alias: 'phase',
            describe: 'meter phase type',
            choices: ['3p', '1p', '1p2e'],
            demandOption: true,
        },
    }).argv;

/**
 * The controller of the pipeline.
 */
class Ctrl {
    #dev;       /* serial device linked to meter */
    #currOpr;   /* current operation object in the pipeline */
    #input;     /* unprecessed meter input */

    constructor() {
        this.#input = '';
    }

    start(devname, baud, firstOpr) {
        this.#dev = new SerialPort({
            path: devname,
            baudRate: baud,
            autoOpen: false });
        this.#dev.open(err => {
            if (err) throw new Error(err);
        });
        this.#dev.on('data', data => {
            const lines = (this.#input + data.toString()).split('\r');
            for (var l of lines.slice(0, lines.length - 1)) {
                console.log('|', l);
                if (this.#currOpr) this.#currOpr.onInput(l);
            }
            this.#input = lines.slice(-1);
        });

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });

        rl.on('line', line => {
            if (this.#currOpr) this.#currOpr.onInput(l);
        });
        rl.once('close', () => {
        });

        this.#currOpr = firstOpr;
        firstOpr.start();
    }

    /**
     * IO routines.
     */

    writeMeter(line) {
        this.#dev.write(line);
    }

    writeUser(line) {
        console.log(line);
    }

    onOprEnd(err, value) {
        if (err) throw(err);
        if (value.name == 'conn-meter') {
            this.#currOpr = new CalInit(this);
            this.#currOpr.start();
        } else if (value.name == 'cal-init')
            process.exit(0);
    }
}

const ctrl = new Ctrl();
ctrl.start(argv.device, argv.baud, new ConnMeter(ctrl));
