#!/usr/bin/node --harmony
'use strict';

const SerialPort = require('serialport').SerialPort;
const yargs = require('yargs/yargs');
const readline = require('readline');
const dump = require('buffer-hexdump');
const ConnMeter = require('./operations/ConnMeter');
const CalInit = require('./operations/CalInit');
const PhaseCal = require('./operations/PhaseCal');

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
            alias: 'phase-type',
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
    #rl;        /* console readline interface */
    #currOpr;   /* current operation object in the pipeline */
    #input;     /* unprecessed meter input */
    #phases = [];
    #phaseCalIndex; /* the position into the phases array, of which
                       we will be doing the calibration */

    constructor(phaseType) {
        this.#input = '';

        if (phaseType == '3p')
            this.#phases = [1, 2, 3];
        else if (phaseType == '1p')
            this.#phases = [1];
        else if (phaseType == '1p2e')
            this.#phases = [2, 3];
        else
            throw new Error(`unkonwn phase type: ${phaseType}`);
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
                console.log('<-', l.trimEnd());
                if (this.#currOpr) this.#currOpr.onInput(l);
            }
            this.#input = lines.slice(-1);
        });

        this.#rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });

        this.#rl.once('close', () => {
            process.exit(0);
        });

        this.#currOpr = firstOpr;
        firstOpr.start();
    }

    /**
     * IO routines.
     */

    writeMeter(line) {
        console.log('->', line.trimEnd());
        this.#dev.write(line);
    }

    writeUser(line) {
        console.log(line);
    }

    prompt(message, cb) {
        console.log(message);
        process.stdout.write('> ');
        this.#rl.once('line', line => {
            cb(line);
        });
    }

    /**
     * router
     */
    onOprEnd(err, value) {
        if (err) throw(err);

        if (value.name == 'conn-meter') {
            this.#currOpr = new CalInit(this, this.#phases.length);
            this.#currOpr.start();
        } else if (value.name == 'cal-init') {
            this.#phaseCalIndex = 0;
            this.#currOpr = new PhaseCal(this, this.#phases[this.#phaseCalIndex]);
            this.#currOpr.start();
        } else if (value.name == 'phase-cal') {
            if (++this.#phaseCalIndex < this.#phases.length) {
                this.#currOpr = new PhaseCal(this, this.#phases[this.#phaseCalIndex]);
                this.#currOpr.start();
            } else
                process.exit(0);
        } else
            process.exit(0);
    }
}

const ctrl = new Ctrl(argv.phaseType);
ctrl.start(argv.device, argv.baud, new ConnMeter(ctrl));
