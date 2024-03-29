const fetch = require('cross-fetch');
'use strict';

const MAX_RETRIES = 2;
const LINES_NUM = 3;

module.exports = class SetupLoad {
    #ctrl;
    #loadDef;
    #failCount = 0;
    #timeout;
    #timer;
    #name;

    constructor(ctrl, loadDef, { timeout=5000, name='setup-load' }) {
        this.#ctrl = ctrl;
        this.#loadDef = loadDef;
        this.#timeout = timeout;
        this.#name = name;
    }

    start() {
        this.#setupLoad();
    }

    onInput(line) {
    }

    async #setupLoad() {
        this.#timer = this.#ctrl.createTimer(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error('no response from mte'));
                return;
            }
            this.#setupLoad();
        }, this.#timeout);

        console.log('setup load:');
        for (var i = 0; i < LINES_NUM; ++i)
            console.log(`  L${i + 1}: v=${this.#loadDef.v[i]}`
                + ` i=${this.#loadDef.i[i]}`
                + ` phi_v=${this.#loadDef.phi_v[i]}`
                + ` phi_i=${this.#loadDef.phi_i[i]}`);

        const resp = await fetch(`${this.#ctrl.getApiRoot()}/loadef`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(this.#loadDef),
        });
        if (! resp.ok) throw new Error(`Mte service status: ${resp.status}`);
        const data = await resp.json();
        clearTimeout(this.#timer);
        if (data && data.result == 'success') {
            console.log('setup load succeeded');
            this.#ctrl.onOprEnd(null, { name: this.#name });
        } else
            setImmediate(() => this.#setupLoad());
    }
};
