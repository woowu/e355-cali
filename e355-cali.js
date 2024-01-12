#!/usr/bin/node --harmony
'use strict';

const SerialPort = require('serialport').SerialPort;
const yargs = require('yargs/yargs');
const readline = require('readline');
const dump = require('buffer-hexdump');
const ConnMeter = require('./operations/ConnMeter');
const SetupLoad = require('./operations/SetupLoad');
const PhaseCal = require('./operations/PhaseCal');
const SimpleReqRespCmd = require('./operations/SimpleReqRespCmd');

const POWER_CYCLE_DELAY = 3000;
const DEFAULT_MTE_PORT = 6200;
const LINES_NUM = 3;
const DEFAULT_FREQ = 50e3;
const LOAD_STABLE_WAIT = 3000;

const argv = yargs(process.argv.slice(2))
    .option({
        'd': {
            alias: 'device',
            describe: 'Name of serial device connected to meter, e.g., /dev/ttyUSB0, COM2',
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
            alias: 'phase-type',
            describe: 'Meter phase type',
            choices: ['3p', '1p', '1p2e'],
            demandOption: true,
        },
        'h': {
            alias: 'host',
            describe: 'Mte host from which to fetch the real load values.'
                + ' When no Mte host provided, real load values are required'
                + ' to be entered manually.',
            type: 'string',
        },
       'p': {
            alias: 'port',
            describe: 'Mte TCP port on which the Mte service is running', 
            type: 'number',
            default: DEFAULT_MTE_PORT,
        },
        'l': {
            alias: 'load',
            describe: 'Specify the load paramters for one line',
            type: 'string',
        },
        'z': {
            alias: 'freq',
            describe: 'Network frequency',
            type: 'number',
            default: DEFAULT_FREQ,
        },
        'y': {
            alias: 'yes',
            describe: 'skip the questionaire for preparing meter before calibrating each phase',
            type: 'boolean',
        },
        'e': {
            alias: 'timer-coef',
            describe: 'a number to multiply timeout times for'
                + ' slowing down internal clock when simulating meter'
                + ' output from Minicom.',
            default: 1,
            type: 'number',
        },
        'ping': {
            describe: 'use *IDN? to ping meter before operations',
            type: 'boolean',
            default: true,
        },
    }).argv;

/**
 * The controller of the pipeline.
 */
class Ctrl {
    phases = [];

    #dev;               /* serial device linked to meter */
    #rl;                /* console readline interface */
    #currOpr;           /* current operation object in the pipeline */
    #input;             /* unprecessed meter input */
    #phaseType;         /* 1p, 3p, 1p2e */
    #phaseCalIndex;     /* the position into the phases array, of which
                           we will be doing the calibration */
    #mteAddr;
    #loadDef;
    #timerCoef = 1;     /* for testing, a number used to multiply timeout
                           times */

    constructor(phaseType, mteAddr, loadDef) {
        this.#input = '';

        this.#phaseType = phaseType;
        if (phaseType == '3p')
            this.phases = [1, 2, 3];
        else if (phaseType == '1p')
            this.phases = [1];
        else if (phaseType == '1p2e')
            this.phases = [2, 3];
        else
            throw new Error(`unkonwn phase type: ${phaseType}`);

        this.#mteAddr = mteAddr;
        this.#loadDef = loadDef;
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

        this.#startOperation(firstOpr);
    }

    createTimer(cb, timeout) {
        return setTimeout(cb, timeout * this.#timerCoef);
    }

    getApiRoot() {
        if (this.#mteAddr)
            return `http://${this.#mteAddr.host}:${this.#mteAddr.port}/api`;
        else
            return '';
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
     * Router: determine the next operation after the previous one returns.
     */
    async onOprEnd(err, value) {
        if (err) throw(err);

        if (value.name == 'setup-load') {
            console.log(`wait ${LOAD_STABLE_WAIT/1000} sec`
                + ' for load stablizing');
            setTimeout(() => {
                this.#startOperation(new ConnMeter(ctrl, ! argv.ping));
            }, LOAD_STABLE_WAIT);
            return;
        }

        if (value.name == 'conn-meter') {
            this.#startOperation(new SimpleReqRespCmd(this, {
                cmd: 'IMS:CALibration:INIT',
                arg: this.phases.length.toString(),
                name: 'cal-init',
                timeout: 5000,
            }));
            return;
        }

        if (value.name == 'cal-init') {
            this.#phaseCalIndex = 0;
            this.#startOperation(new PhaseCal(this, {
                phase: this.phases[this.#phaseCalIndex],
                useMte: this.#mteAddr != null,
                wait: ! argv.yes,
            }));
            return;
        }

        if (value.name == 'phase-cal') {
            ++this.#phaseCalIndex;
            if (this.#phaseCalIndex == this.phases.length) {
                this.#startOperation(new SimpleReqRespCmd(this, {
                    cmd: 'IMS:CAL:WR',
                    name: 'cal-wr',
                }));
                return;
            }

            /* Before start the 2nd phase of 1p2e meter, the meter must
             * has been powered cycle, hence we need to run IMS:CAL:Continue
             * command to resume the calibration process inside the meter
             */
            if (this.#phaseType == '1p2e' && this.#phaseCalIndex == 1) {
                await this.prompt(
                    'Switch power supply to element 2 and press enter.');
                this.#startOperation(new SimpleReqRespCmd(this, {
                    cmd: 'IMS:CAL:Continue', 
                    name: 'cal-cont',
                    /* wait some more time since meter's just powered up */
                    maxRetries: 5,
                }));
            } else
                this.#startOperation(new PhaseCal(this, {
                    phase: this.phases[this.#phaseCalIndex],
                    useMte: this.#mteAddr != null,
                    wait: ! argv.yes,
                }));
            return;
        }

        if (value.name == 'cal-cont') {
            this.#startOperation(new PhaseCal(this, {
                phase: this.phases[this.#phaseCalIndex],
                useMte: this.#mteAddr != null,
                wait: false,
            }));
            return;
        }

        if (value.name == 'cal-wr') {
            console.log('Calibration completed. Please power cycle the meter.');
            process.exit(0);
        }
    }

    #startOperation(opr) {
        this.#currOpr = opr;
        opr.start();
    }
}

function parseLoadDef(spec)
{
    const phiVRef = [0, 240e3, 120e3];

    const def = {
        phi_v: Array(LINES_NUM).fill(null),
        phi_i: Array(LINES_NUM).fill(null),
        v: Array(LINES_NUM).fill(null),
        i: Array(LINES_NUM).fill(null),
    };
    const quantityNames = ['v', 'i', 'phi_v', 'phi_i'];

    const normalizeAngle = phi => {
        while (phi < 0) phi += 360e3;
        return phi % 360e3;
    };

    if (! Array.isArray(spec))
        spec = [spec];
    for (const s of spec) {
        const [line, lineSpec] = s.split(':');
        var l = parseInt(line);
        if (isNaN(l) || l < 1 || l > LINES_NUM)
            throw new Error('incorrect line name: ' + line);
        if (lineSpec == '' || lineSpec === undefined)
            throw new Error('spec missed for line ' + line);
        for (const item of lineSpec.split(',')) {
            const [name, value] = item.split('=');
            if (value == '' || value === undefined)
                throw new Error('bad specification: ' + item);
            if (name == 'phi') {
                def.phi_v[l - 1] = phiVRef[l - 1];
                def.phi_i[l - 1] = normalizeAngle(phiVRef[l - 1]
                    - parseInt(value));
            } else {
                if (! quantityNames.includes(name))
                    throw new Error('unknown quantity: ' + name);
                def[name][l - 1] = value;
            }
        }
    }
    return def;
}

var mteAddr = null;
if (argv.host) mteAddr = { host: argv.host, port: argv.port };

var loadDef;
if (argv.load) {
    if (! mteAddr) {
        console.error('setup load needs to define mte address');
        process.exit(1);
    }
    loadDef = parseLoadDef(argv.load);
    loadDef.f = argv.freq;
}

const ctrl = new Ctrl(argv.phaseType, mteAddr, loadDef);
ctrl.timerCoef = argv.timerCoef;

var firstOpr;
if (argv.load)
    firstOpr = new SetupLoad(ctrl, loadDef);
else
    firstOpr = new ConnMeter(ctrl, ! argv.ping);

ctrl.start(argv.device, argv.baud, firstOpr);
