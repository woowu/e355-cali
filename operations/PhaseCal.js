const fetch = require('cross-fetch');
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
    #useMte;
    #wait;

    constructor(ctrl, { phase, useMte = false, wait = true }) {
        this.#ctrl = ctrl;
        this.#phase = phase;
        this.#useMte = useMte;
        this.#wait = wait;
    }

    start() {
        this.#reqCalibration();
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

    async #reqCalibration() {
        if (this.#wait)
            await this.#ctrl.prompt(
                `calibrate L${this.#phase}. Press enter to continue`);

        this.#timer = this.#ctrl.createTimer(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error(`calibration phase ${this.#phase}`));
                return;
            }
            this.#reqCalibration();
        }, WAIT_DELAY);

        this.#getRealValues()
            .then(v => {
                this.#realValues = v;
                this.#ctrl.writeMeter(`IMS:CALibration:L${this.#phase}`
                    + ` ${this.#realValues.v},${this.#realValues.i},`
                    + `${this.#realValues.p},${this.#realValues.q}\r`);
            });
    }

    async #getRealValues() {
        this.#discardInput = true;

        var val;
        if (this.#useMte)
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

    async #delay(n) {
        new Promise((resolve, reject) => {
            setTimeout(resolve, n);
        });
    }

    async #fetchInstantaneous() {
        const resp = await fetch(`${this.#ctrl.getApiRoot()}/instantaneous`);
        if (resp.ok) {
            const instant = await resp.json()
            return {
                error: null,
                data: [
                    instant.v[this.#phase - 1],
                    instant.i[this.#phase - 1],
                    instant.p[this.#phase - 1],
                    instant.q[this.#phase - 1],
                ],
            };
        } else
            return { error: new Error(`Mte service status: ${resp.status}`) };
    }

    async #getRealValuesFromMte() {
        var errors = 0;
        const samples = [];
        while (errors < 2) {
            const { error, data } = await this.#fetchInstantaneous();
            if (error) {
                console.log(error.message);
                ++errors;
                await this.#delay(3000);
            } else {
                errors = 0;
                console.log('got MTE reading, (v,i,p,q) ='
                    + ` (${data[0]}, ${data[1]}, ${data[2]}, ${data[3]})`);
                samples.push(data);
                if (samples.length == 3) break; // TODO
                await this.#delay(1000);
            }
        }

        const data = samples.slice(-1)[0]; //math.mean(samples, 0);
        return {
            v: Math.round(data[0]),
            i: Math.round(data[1]),
            p: Math.round(data[2]),
            q: Math.round(data[3]),
        };
    }
};
