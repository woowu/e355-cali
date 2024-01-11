'use strict';

/**
 * Issue the command and wait for response.
 */

const MAX_RETRIES = 2;

module.exports = class SimpleReqRespCmd {
    #ctrl;
    #cmd;
    #arg;
    #cmdName;
    #cmdTimeout;
    #failCount = 0;
    #timer;

    constructor(ctrl, { cmd, arg, name, timeout=3000 }) {
        this.#ctrl = ctrl;
        this.#cmd = cmd;
        this.#arg = arg;
        this.#cmdTimeout = timeout;
        this.#cmdName = name;
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
        if (line.search('FAIL') >= 0 || ++this.#failCount == MAX_RETRIES) {
            this.#ctrl.onOprEnd(new Error(`${this.#cmd} failed`));
            return;
        }
        this.#sendReq();
    }

    #sendReq() {
        this.#timer = this.#ctrl.createTimer(() => {
            if (++this.#failCount == MAX_RETRIES) {
                this.#ctrl.onOprEnd(new Error('no response from meter'));
                return;
            }
            this.#sendReq();
        }, this.#cmdTimeout);
        this.#ctrl.writeMeter(this.#arg ? `${this.#cmd} ${this.#arg}\r`
            : `${this.#cmd}\r`);
    }
};
