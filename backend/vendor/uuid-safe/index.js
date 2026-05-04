'use strict';

const { randomBytes, randomUUID } = require('crypto');

let lastMSecs = 0;
let lastNSecs = 0;
let clockseq = randomBytes(2).readUInt16BE(0) & 0x3fff;
const nodeId = randomBytes(6);
nodeId[0] |= 0x01;

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertNoBufferOutput(buf) {
  if (buf !== undefined) {
    throw new TypeError('Buffer output is not supported by the safe uuid shim');
  }
}

function v4(options, buf) {
  assertNoBufferOutput(buf);

  if (!options || Object.keys(options).length === 0) {
    return randomUUID();
  }

  const bytes = options.random || (options.rng ? options.rng() : randomBytes(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

function v1(options = {}, buf) {
  assertNoBufferOutput(buf);

  let msecs = options.msecs !== undefined ? options.msecs : Date.now();
  let nsecs = options.nsecs !== undefined ? options.nsecs : lastNSecs + 1;
  const dt = msecs - lastMSecs + (nsecs - lastNSecs) / 10000;

  if (dt < 0 && options.clockseq === undefined) {
    clockseq = (clockseq + 1) & 0x3fff;
  }

  if ((dt < 0 || msecs > lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  if (nsecs >= 10000) {
    throw new Error('Cannot create more than 10M UUIDs/sec');
  }

  lastMSecs = msecs;
  lastNSecs = nsecs;

  msecs += 12219292800000;
  const timestamp = BigInt(msecs) * 10000n + BigInt(nsecs);
  const bytes = new Uint8Array(16);
  const sequence = options.clockseq !== undefined ? options.clockseq & 0x3fff : clockseq;
  const node = options.node || nodeId;

  const timeLow = Number(timestamp & 0xffffffffn);
  const timeMid = Number((timestamp >> 32n) & 0xffffn);
  const timeHi = Number((timestamp >> 48n) & 0x0fffn) | 0x1000;

  bytes[0] = (timeLow >>> 24) & 0xff;
  bytes[1] = (timeLow >>> 16) & 0xff;
  bytes[2] = (timeLow >>> 8) & 0xff;
  bytes[3] = timeLow & 0xff;
  bytes[4] = (timeMid >>> 8) & 0xff;
  bytes[5] = timeMid & 0xff;
  bytes[6] = (timeHi >>> 8) & 0xff;
  bytes[7] = timeHi & 0xff;
  bytes[8] = ((sequence >>> 8) & 0x3f) | 0x80;
  bytes[9] = sequence & 0xff;

  for (let index = 0; index < 6; index += 1) {
    bytes[10 + index] = node[index];
  }

  return bytesToUuid(bytes);
}

module.exports = {
  v1,
  v4
};
