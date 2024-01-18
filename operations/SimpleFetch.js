const fetch = require('cross-fetch');
'use strict';

module.exports = class SimpleFetch {
    #ctrl;
    #name;
    #url;
    #fetchOption;
    #failCount = 0;
    #timeout;
    #timer;
    #maxRetries;

    constructor(ctrl, name, url, fetchOption=null, option) {
        if (option === undefined) option = {};
        const { timeout = 3000, maxRetries = 2} = option;

        this.#ctrl = ctrl;
        this.#name = name;
        this.#url = url;
        this.#fetchOption = fetchOption;

        this.#timeout = option.timeout;
        this.#maxRetries = option.maxRetries;
    }

    start() {
        this.#startOperation();
    }

    onInput(line) {
    }

    async #startOperation() {
        //this.#timer = setTimeout(() => {
        //    if (++this.#failCount == this.#maxRetries) {
        //        this.#ctrl.onOprEnd(new Error(
        //            `${this.#name}: no response from server`));
        //        return;
        //    }
        //    this.#startOperation();
        //}, this.#timeout);

        const resp = await fetch(this.#url, this.#fetchOption);
        if (! resp.ok) throw new Error(`Mte service status: ${resp.status}`);
        const data = await resp.json();
        clearTimeout(this.#timer);
        if (data && data.result == 'success') {
            console.log(`${this.#name} succeeded`);
            this.#ctrl.onOprEnd(null, { name: this.#name });
        } else
            setImmediate(() => this.#startOperation());
    }
};
