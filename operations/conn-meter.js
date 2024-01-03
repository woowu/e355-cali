function start(opr)
{
    opr.writeMeter('*IDN?\r');
}

function onInput(opr, line)
{
    const components = line.split(',');
    if (components.length < 3) return;
    if (components[0] != 'LANDIS+GYR') return;
    opr.writeUser(`Meter connected.`
        + ` Product: ${components[1]} Ver: ${components[2]} Build: ${components[3]}`);
}

module.exports = function createOperation(onWriteMeter, onWriteUser, onEnd)
{
    return {
        start,
        onInput,

        end: onEnd,
        writeMeter: onWriteMeter,
        writeUser: onWriteUser,
    };
}
