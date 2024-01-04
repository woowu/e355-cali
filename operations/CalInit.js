'use strict';

/**
 * Issue command IMS:CAL:INT
 */

const MAX_RETRIES = 3;
const WAIT_DELAY = 3000;

module.exports = class CalInit {
    #ctrl;
    #failCount = 0;
    #timer;
    #phaseNum;

    constructor(ctrl, phaseNum) {
        this.#ctrl = ctrl;
        this.#phaseNum = phaseNum;
    }

    start() {
        this.#reqInit()
    }

    onInput(line) {
        clearTimeout(this.#timer);
        if (line.search('SUCCESS') >= 0) {
            this.#ctrl.onOprEnd(null, { name: 'cal-init' });
            return;
        }
        if (++this.#failCount == MAX_RETRIES) {
            this.#ctrl.onOprEnd(new Error('calibration init error'));
            return;
        }
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
        this.#ctrl.writeMeter(`IMS:CALibration:INIT ${this.#phaseNum}\r`);
    }
};
