'use strict';

/**
 * Issue command IMS:CAL:INT
 */

const MAX_RETRIES = 2;
const WAIT_DELAY = 3000;

module.exports = class CalInit {
    #ctrl;
    #failCount = 0;
    #timer;

    constructor(ctrl) {
        this.#ctrl = ctrl;
    }

    start() {
        this.#reqInit()
    }

    onInput(line) {
        clearTimeout(this.#timer);
        if (line.search('SUCCESS') >= 0)
            this.#ctrl.onOprEnd(null, { name: 'cal-init' });
        if (++this.#failCount == MAX_RETRIES)
            this.#ctrl.onOprEnd(new Error('calibration init error'));
        this.#reqInit()
    }

    #reqInit() {
        this.#ctrl.writeUser('initilize calibration');
        this.#timer = setTimeout(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error('calibration init error'));
                return;
            }
            this.#reqInit();
        }, WAIT_DELAY);
        this.#ctrl.writeMeter('IMS:CAL:INIT\r');
    }
};
