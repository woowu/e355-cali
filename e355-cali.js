#!/usr/bin/node --harmony
'use strict';

const SerialPort = require('serialport').SerialPort;
const yargs = require('yargs/yargs');
const readline = require('readline');
const dump = require('buffer-hexdump');
const ConnMeter = require('./operations/ConnMeter');
const PhaseCal = require('./operations/PhaseCal');
const SimpleReqRespCmd = require('./operations/SimpleReqRespCmd');

const POWER_CYCLE_DELAY = 3000;
const DEFAULT_MTE_PORT = 6200;

const argv = yargs(process.argv.slice(2))
    .option({
        'd': {
            alias: 'device',
            describe: 'Device name of serial port to meter, e.g., /dev/ttyUSB0, COM2',
            type: 'string',
            demandOption: true,
        },
        'b': {
            alias: 'baud',
            describe: 'Baud rate of meter connection',
            default: 9600,
            type: 'number',
        },
        't': {
            alias: 'timer-coef',
            describe: 'a number to multiply timeout times for'
                + ' slowing down internal clock when simulating meter'
                + ' output from Minicom.',
            default: 1,
            type: 'number',
        },
        'p': {
            alias: 'phase-type',
            describe: 'Meter phase type',
            choices: ['3p', '1p', '1p2e'],
            demandOption: true,
        },
        'm': {
            alias: 'mte',
            describe: `Mte IP address and port in the form <ip>[:port]. When port is not present, it defaults to ${DEFAULT_MTE_PORT}`, 
            type: 'string',
        },
    }).argv;

/**
 * The controller of the pipeline.
 */
class Ctrl {
    #dev;               /* serial device linked to meter */
    #rl;                /* console readline interface */
    #currOpr;           /* current operation object in the pipeline */
    #input;             /* unprecessed meter input */
    #phases = [];
    #phaseType;         /* 1p, 3p, 1p2e */
    #phaseCalIndex;     /* the position into the phases array, of which
                           we will be doing the calibration */
    #calWaitContinue = false;
    #mteAddr;
    #timerCoef = 1;     /* for testing, a number used to multiply timeout
                           times */

    constructor(phaseType, mteAddr) {
        this.#input = '';

        this.#phaseType = phaseType;
        if (phaseType == '3p')
            this.#phases = [1, 2, 3];
        else if (phaseType == '1p')
            this.#phases = [1];
        else if (phaseType == '1p2e')
            this.#phases = [2, 3];
        else
            throw new Error(`unkonwn phase type: ${phaseType}`);

        this.#mteAddr = mteAddr;
    }

    set timerCoef(k) {
        this.#timerCoef = k;
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
                console.log('<--\t', l.trimEnd());
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

    createTimer(cb, timeout) {
        setTimeout(cb, timeout * this.#timerCoef);
    }

    /**
     * IO routines.
     */

    writeMeter(line) {
        console.log('-->\t', line.trimEnd());
        this.#dev.write(line);
    }

    writeUser(line) {
        console.log(line);
    }

    prompt(message) {
        console.log(message);
        process.stdout.write('> ');
        return new Promise((resolve, reject) => {
            this.#rl.once('line', line => {
                resolve(line);
            });
        });
    }

    /**
     * router
     */
    onOprEnd(err, value) {
        if (err) throw(err);

        if (value.name == 'conn-meter' && ! this.#calWaitContinue) {
            this.#currOpr = new SimpleReqRespCmd(this, {
                cmd: 'IMS:CALibration:INIT',
                arg: this.#phases.length.toString(),
                name: 'cal-init',
                timeout: 5000,
            });
            this.#currOpr.start();
            return;
        }

        if (value.name == 'cal-init') {
            this.#phaseCalIndex = 0;
            this.#currOpr = new PhaseCal(this,
                this.#phases[this.#phaseCalIndex],
                this.#mteAddr);
            this.#currOpr.start();
            return;
        }

        if (value.name == 'phase-cal'
            && (this.#phaseType != '1p2e' || this.#phaseCalIndex)) {
            if (++this.#phaseCalIndex < this.#phases.length) {
                this.#currOpr = new PhaseCal(this,
                    this.#phases[this.#phaseCalIndex],
                    this.#mteAddr);
                this.#currOpr.start();
            } else {
                this.#currOpr = new SimpleReqRespCmd(this, {
                    cmd: 'IMS:CAL:WR',
                    name: 'cal-wr',
                });
                this.#currOpr.start();
            }
            return;
        }

        if (value.name == 'phase-cal' && this.#phaseType == '1p2e') {
            this.#currOpr = null;
            this.prompt('Feed power into the E2 path and'
                + ' then press Enter.')
                .then(() => {
                    setTimeout(() => {
                        this.#calWaitContinue = true;
                        this.#currOpr = new ConnMeter(this);
                        this.#currOpr.start();
                    }, POWER_CYCLE_DELAY);
                });
            return;
        }

        if (value.name == 'conn-meter' && this.#calWaitContinue) {
            this.#currOpr = new SimpleReqRespCmd(this, {
                cmd: 'IMS:CAL:Continue', 
                name: 'cal-cont'
            });
            this.#currOpr.start();
            return;
        }

        if (value.name == 'cal-cont') {
            this.#currOpr = new PhaseCal(this, this.#phases[++this.#phaseCalIndex]);
            this.#currOpr.start();
            return;
        }

        if (value.name == 'cal-wr') {
            console.log('Calibration completed. Please power cycle the meter.');
            process.exit(0);
        }
    }
}

var mteAddr = null;
if (argv.mte) {
    const tokens = argv.mte.split(',');
    mteAddr = {
        host: tokens[0],
        port: tokens.length > 1 ? parseInt(tokens[1]) : DEFAULT_MTE_PORT,
    };
}

const ctrl = new Ctrl(argv.phaseType, mteAddr);
ctrl.timerCoef = argv.timerCoef;
ctrl.start(argv.device, argv.baud, new ConnMeter(ctrl));
