'use strict';

/**
 * Issue command *IDN?
 *
 * In development stage, my opto connection between laptop and meter is weak
 * and not always reliable because the meter box is open. That's why here I
 * designed the retry and confirming stage so that I can adjust the opto
 * connection while the tool is retying before I get a positive feedback.
 */

const MAX_RETRIES = 100;
const CONFIRM_MAX_COUNT = 2;
const WAIT_RESP_SEND_DELAY = 3000;
const CONFIRMING_SEND_DELAY = 1500;
const IDN_FIELDS_MIN_NR = 3;

module.exports = class ConnMeter {
    #ctrl;
    #failCount = 0;
    #confirmingCount;
    #timer;
    #state = 'wait-resp';   /* 1. wait-resp, 2. confirming */
    #meterIdnRaw;
    #emptyOpr;

    constructor(ctrl, emptyOpr=false) {
        this.#ctrl = ctrl;
        this.#emptyOpr = emptyOpr;
    }

    start() {
        if (this.#emptyOpr) {
            setImmediate(() => {
                this.#ctrl.onOprEnd(null, { name: 'conn-meter' });
            });
            return;
        }
        this.#reqIdn();
    }

    onInput(line) {
        clearTimeout(this.#timer);

        const components = line.split(',');
        if (components.length < IDN_FIELDS_MIN_NR
            || components[0] != 'LANDIS+GYR') {
            if (this.#state == 'confirming')
                this.#reset();
            else {
                this.#reqIdn();
                ++this.#failCount
            }
            return;
        }

        if (this.#state == 'wait-resp') {
            this.#meterIdnRaw = line;
            this.#state = 'confirming';
            this.#confirmingCount = 0;
            this.#reqIdn();
            return;
        }

        /* confirming */

        if (this.#meterIdnRaw != line) {
            this.#reset();
            return;
        }
        if (++this.#confirmingCount == CONFIRM_MAX_COUNT) {
            this.#ctrl.writeUser(`Meter connected.`
                + ` Product: ${components[1]}`
                + ` Ver: ${components[2]}`
                + ` Build: ${components[3]}`);
            this.#ctrl.onOprEnd(null, { name: 'conn-meter' });
            return;
        }
        this.#reqIdn();
    }

    #reqIdn() {
        this.#timer = this.#ctrl.createTimer(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error('cannot connect to meter'));
                return;
            }
            this.#reqIdn();
        }, this.#state == 'wait-resp' ? WAIT_RESP_SEND_DELAY: CONFIRMING_SEND_DELAY);
        this.#ctrl.writeMeter('*IDN?\r');
    }

    #reset() {
        this.#state = 'wait-resp';
        this.#failCount = 0;
        this.#reqIdn();
    }
};
