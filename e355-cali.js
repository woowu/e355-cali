#!/usr/bin/node --harmony
const SerialPort = require('serialport').SerialPort;
const yargs = require('yargs/yargs');
const readline = require('readline');
const dump = require('buffer-hexdump');
const connMeter = require('./operations/conn-meter');

'use strict';

function ctrlHandleMeterData(ctrl, data)
{
    const lines = (ctrl.input + data.toString()).split('\r');
    for (var l of lines.slice(0, lines.length - 1))
        if (ctrl.currOpr) ctrl.currOpr.onInput(ctrl.currOpr, l);
    return Object.assign({}, ctrl, { input: lines.slice(-1) });
}

function writeMeter(line)
{
    ctrl.dev.write(line);
}

function writeUser(line)
{
    console.log(line);
}

/**
 * Routers
 */

function afterConnMeter(status)
{
    console.log('meter connected');
}

/*---------------------------------------------------------------------------*/

const argv = yargs(process.argv.slice(2))
    .option({
        'd': {
            alias: 'device',
            describe: 'receive from this serial device',
            type: 'string',
            demandOption: true,
        },
        'b': {
            alias: 'baud',
            describe: 'baud rate',
            default: 9600,
            type: 'number',
        },
    }).argv;

var ctrl = {
    dev: null,
    input: '',
    currOpr: null,
};

/**
 * Open tty, which talks to user
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

rl.on('line', line => {
    if (ctrl.currOpr) ctrl.currOpr.onInput(l);
});

rl.once('close', () => {
});

/**
 * Open serial port, which talks to meter
 */

ctrl.dev = new SerialPort({
    path: argv.device,
    baudRate: argv.baud,
    autoOpen: false,
});
ctrl.dev.open(err => {
    if (err) throw new Error(err);
});
ctrl.dev.on('data', data => {
    ctrl = ctrlHandleMeterData(ctrl, data);
});

/**
 * Start the first operation.
 */

ctrl.currOpr = connMeter(writeMeter, writeUser, afterConnMeter);
ctrl.currOpr.start(ctrl.currOpr);
