'use strict';

module.exports = class ConnMeter {
    #ctrl;

    constructor(ctrl) {
        this.#ctrl = ctrl;
    }

    start() {
        this.#ctrl.writeMeter('*IDN?\r');
    }

    onInput(line) {
        const components = line.split(',');
        if (components.length < 3) return;
        if (components[0] != 'LANDIS+GYR') return;
        this.#ctrl.writeUser(`Meter connected.`
            + ` Product: ${components[1]} Ver: ${components[2]} Build: ${components[3]}`);
        this.#ctrl.onOprEnd('connMeter', { code: 'succeeded' });
    }
};
