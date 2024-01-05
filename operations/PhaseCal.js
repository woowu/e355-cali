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
    #waitUser = false;

    constructor(ctrl, phase) {
        this.#ctrl = ctrl;
        this.#phase = phase;
    }

    start() {
        this.#getRealValues(v => {
            this.#realValues = v;
            this.#reqCalibration()
        });
    }

    onInput(line) {
        if (this.#waitUser) return;
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
        this.#timer = setTimeout(() => {
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

    #getRealValues(cb) {
        const msg = `Enter V,I,P,Q or V,I,a of L${this.#phase}.`
            + ' V=mV, I=mA, P=mW, Q=mVar, a=℃ . Seperate values with comma.'
            + ' Ex: 240000,5000,848528,848528 or 240000,5000,45.'
        this.#waitUser = true;
        this.#ctrl.prompt(msg, input => {
            this.#waitUser = false;
            if (input.split(',').length < 3) {
                this.#getRealValues(cb);
                return;
            }
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
            cb({ v, i, p, q });
        });
    }
};
