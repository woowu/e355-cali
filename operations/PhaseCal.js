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
    #readPhase
    #realValues;
    #discardInput = false;
    #useMte;
    #wait;

    /**
     * In normal cases, the phase to read back the load quantities should be the
     * same as the phase to do the calibration. But for the 1p2e meter, we have
     * to read the indeed connected phase which may not be the phases which are
     * doing the calibration (L2 or L3). That's the reason we provided another
     * argument `readphase` to make 1p2e calibration possible.
     */
    constructor(ctrl, { phase, readPhase = null, useMte = false, wait = true }) {
        this.#ctrl = ctrl;
        this.#phase = phase;
        this.#readPhase = readPhase;
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
        else
            await this.#delay(1000);

        this.#getRealValues()
            .then(v => {
                this.#ctrl.writeMeter(`IMS:CALibration:L${this.#phase}`
                    + ` ${v.v},${v.i},${v.p},${v.q}\r`);
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
        return new Promise((resolve, reject) => {
            setTimeout(resolve, n);
        });
    }

    async #fetchInstantaneous() {
        this.#timer = this.#ctrl.createTimer(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error(`polling MTE failed`));
                return;
            }
            this.#fetchInstantaneous();
        }, WAIT_DELAY);

        const resp = await fetch(`${this.#ctrl.getApiRoot()}/instantaneous`);
        if (resp.ok) {
            clearTimeout(this.#timer);
            const instant = await resp.json()
            var readPhase = this.#readPhase != null ? this.#readPhase : this.#phase;
            return {
                error: null,
                data: {
                    v: Math.round(instant.v[readPhase - 1]),
                    i: Math.round(instant.i[readPhase - 1]),
                    p: Math.round(instant.p[readPhase - 1]),
                    q: Math.round(instant.q[readPhase - 1]),
                },
            };
        }
    }

    async #getRealValuesFromMte() {
        var errors = 0;
        const samples = [];
        const MINIMUM_NUM_OF_SAMPLES = 6;

        const areReadingsStablized = key => {
            const stdOverMean = vector => {
                var total = vector.reduce((acc, c) => acc + c, 0);
                const mean = total / vector.length;
                total = vector.reduce((acc, c) => acc + (c - mean)^2, 0);
                return Math.sqrt(total / vector.length) / mean;
            };

            if (samples.length < MINIMUM_NUM_OF_SAMPLES) return false;
            const values = samples.slice(-MINIMUM_NUM_OF_SAMPLES).map(
                e => e[key]);
            return stdOverMean(values) < 5e-6;
        };

        while (errors < 2) {
            const { error, data } = await this.#fetchInstantaneous();
            if (error) {
                console.log(error.message);
                ++errors;
                await this.#delay(3000);
            } else {
                errors = 0;
                console.log('got MTE reading:', data);
                samples.push(data);
                if (areReadingsStablized('p') && areReadingsStablized('q'))
                    break;
                await this.#delay(1000);
            }
        }

        return samples.slice(-1)[0];
    }
};
