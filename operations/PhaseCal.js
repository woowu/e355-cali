'use strict';

/**
 * Issue command IMS:CAL:L<n>
 */

const MAX_RETRIES = 3;
const WAIT_DELAY = 3000;

module.exports = class PhaseCal {
    #ctrl;
    #failCount = 0;
    #timer;
    #phase
    #realValues;
    #discardInput = false;
    #mteAddr;

    constructor(ctrl, phase, mteAddr) {
        this.#ctrl = ctrl;
        this.#phase = phase;
        this.#mteAddr = mteAddr;
    }

    start() {
        this.#getRealValues()
            .then(v => {
                this.#realValues = v;
                this.#reqCalibration();
            });
    }

    onInput(line) {
        if (this.#discardInput) return;
        clearTimeout(this.#timer);
        if (line.search('SUCCESS') >= 0) {
            this.#ctrl.onOprEnd(null, { name: 'phase-cal' });
            return;
        }
        if (++this.#failCount == MAX_RETRIES) {
            this.#ctrl.onOprEnd(new Error(`calibration phase ${this.#phase} error`));
            return;
        }
        this.#reqCalibration()
    }

    #reqCalibration() {
        this.#ctrl.writeUser(`calibration phase ${this.#phase}`);
        this.#timer = this.#ctrl.createTimer(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error(`calibration phase ${this.#phase}`));
                return;
            }
            this.#reqCalibration();
        }, WAIT_DELAY);
        this.#ctrl.writeMeter(`IMS:CALibration:L${this.#phase}`
            + ` ${this.#realValues.v},${this.#realValues.i},`
            + `${this.#realValues.p},${this.#realValues.q}\r`);
    }

    async #getRealValues() {
        this.#discardInput = true;

        var val;
        if (this.#mteAddr)
            val = await this.#getRealValuesFromMte();
        else
            val = await this.#getRealValuesFromUser();
        this.#discardInput = false;
        return val;
    }

    async #getRealValuesFromUser() {
        const msg = `Enter V,I,P,Q or V,I,a of L${this.#phase}.`
            + ' V=mV, I=mA, P=mW, Q=mVar, a=℃ .'
            + ' Ex: 240000,5000,848528,848528 or 240000,5000,45.'
        var input;
        do {
            input = await this.#ctrl.prompt(msg);
        } while (input.split(',').length < 3)

        var v, i, p, q;
        [v, i, p, q] = input.split(',');
        v = parseInt(v);
        i = parseInt(i);
        if (q !== undefined) {
            p = parseInt(p);
            q = parseInt(q);
        } else {
            const a = parseFloat(p);
            p = parseInt(v * i * Math.cos(a * (Math.PI / 180)));
            q = parseInt(v * i * Math.sin(a * (Math.PI / 180)));
        }
        return { v, i, p, q };
    }

    async #getRealValuesFromMte() {
        const apiRoot =
            `http://${this.#mteAddr.host}:${this.#mteAddr.port}/api`
        const resp = await fetch(`${apiRoot}/instantaneous`);
        if (! resp.ok)
            throw new Error(`Mte service status: ${resp.status}`);
        return resp.json();
    }
};
