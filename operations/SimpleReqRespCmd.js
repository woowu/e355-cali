'use strict';

/**
 * Issue the command and wait for response.
 */

module.exports = class SimpleReqRespCmd {
    #ctrl;
    #cmd;
    #arg;
    #cmdName;
    #cmdTimeout;
    #failCount = 0;
    #timer;
    #maxRetries;
    #noResp;

    constructor(ctrl, {
        cmd, arg, name, timeout=3000, maxRetries = 2, noResp = false
    }) {
        this.#ctrl = ctrl;
        this.#cmd = cmd;
        this.#arg = arg;
        this.#cmdTimeout = timeout;
        this.#cmdName = name;
        this.#maxRetries = maxRetries;
        this.#noResp = noResp;
    }

    start() {
        this.#sendReq();
    }

    onInput(line) {
        clearTimeout(this.#timer);
        if (line.search('SUCCESS') >= 0) {
            this.#ctrl.onOprEnd(null, { name: this.#cmdName });
            return;
        }
        if (line.search('FAIL') >= 0 || ++this.#failCount == this.maxRetries) {
            this.#ctrl.onOprEnd(new Error(`${this.#cmd} failed`));
            return;
        }
        this.#sendReq();
    }

    #sendReq() {
        if (this.#noResp)
            this.#timer = setTimeout(() => {
                this.#ctrl.onOprEnd(null, { name: this.#cmdName });
            }, this.#cmdTimeout);
        else
            this.#timer = this.#ctrl.createTimer(() => {
                if (++this.#failCount == this.#maxRetries) {
                    this.#ctrl.onOprEnd(new Error('no response from meter'));
                    return;
                }
                this.#sendReq();
            }, this.#cmdTimeout);
        this.#ctrl.writeMeter(this.#arg ? `${this.#cmd} ${this.#arg}\r`
            : `${this.#cmd}\r`);
    }
};
