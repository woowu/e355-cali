const fetch = require('cross-fetch');
'use strict';

const MAX_RETRIES = 2;
const POLL_DELAY = 2000;
const MIN_POLL_COUNT = 3;

module.exports = class AccuracyPolling {
    #ctrl;
    #failCount = 0;
    #timeout;
    #timer;
    #resultCount = 0;

    constructor(ctrl, option) {
        if (option === undefined) option = { timeout: 10000 };
        this.#ctrl = ctrl;
        this.#timeout = option.timeout;
    }

    start() {
        this.#poll();
    }

    onInput(line) {
    }

    async #poll() {
        this.#timer = setTimeout(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error('no response from mte'));
                return;
            }
            this.#poll();
        }, this.#timeout);

        const resp = await fetch(`${this.#ctrl.getApiRoot()}/test/result/1`);
        if (! resp.ok) throw new Error(`Mte service status: ${resp.status}`);
        const data = await resp.json();
        clearTimeout(this.#timer);
        console.log(data);

        if (data.seqno > 1) ++this.#resultCount;

        if (this.#resultCount == MIN_POLL_COUNT) {
            this.#ctrl.onOprEnd(null, { name: 'accuracy-polling' });
            return;
        }

        this.#timer = setTimeout(() => {
            this.#poll();
        }, POLL_DELAY);
    }
};
