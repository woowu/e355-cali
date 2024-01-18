const fetch = require('cross-fetch');
'use strict';

const POLL_DELAY = 5000;
const MIN_POLL_COUNT = 6;

module.exports = class AccuracyPolling {
    #ctrl;
    #resultCount = 0;

    constructor(ctrl) {
        this.#ctrl = ctrl;
    }

    start() {
        this.#poll();
    }

    onInput(line) {
    }

    async #poll() {
        const resp = await fetch(`${this.#ctrl.getApiRoot()}/test/result/1`);
        if (! resp.ok) throw new Error(`Mte service status: ${resp.status}`);
        const data = await resp.json();
        console.log(data);

        if (data.seqno > 1) ++this.#resultCount;

        if (this.#resultCount == MIN_POLL_COUNT) {
            this.#ctrl.onOprEnd(null, { name: 'accuracy-polling' });
            return;
        }

        setTimeout(() => this.#poll(), POLL_DELAY);
    }
};
