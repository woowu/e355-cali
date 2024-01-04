'use strict';

const MAX_RETRIES = 10;

module.exports = class ConnMeter {
    #ctrl;
    #failCount;
    #timer;

    constructor(ctrl) {
        this.#ctrl = ctrl;
        this.#failCount = 0;
    }

    start() {
        this.#idn();
    }

    onInput(line) {
        const components = line.split(',');
        if (components.length < 3) return;
        if (components[0] != 'LANDIS+GYR') return;

        clearTimeout(this.#timer);
        this.#failCount = 0;
        this.#ctrl.writeUser(`Meter connected.`
            + ` Product: ${components[1]} Ver: ${components[2]} Build: ${components[3]}`);
        this.#ctrl.onOprEnd(null);
    }

    #idn() {
        this.#timer = setTimeout(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error('cannot connect to meter'));
                return;
            }
            this.#idn();
        }, 1000);
        this.#ctrl.writeMeter('*IDN?\r');
    }
};
