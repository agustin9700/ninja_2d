'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const OPEN = 1;
const CLOSED = 3;
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode, value = Buffer.alloc(0)) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

class ServerWebSocket extends EventEmitter {
  constructor(socket, maximumPayload) {
    super();
    this.socket = socket;
    this.maximumPayload = maximumPayload;
    this.readyState = OPEN;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentLength = 0;
    this.fragmentOpcode = null;
    this.closed = false;
    socket.setNoDelay(true);
    socket.on('data', chunk => this.acceptData(chunk));
    socket.on('close', () => this.finishClose());
    socket.on('end', () => this.finishClose());
    socket.on('error', error => {
      if (this.listenerCount('error')) this.emit('error', error);
      this.finishClose();
    });
  }

  send(value) {
    if (this.readyState !== OPEN) return;
    this.socket.write(frame(0x1, value));
  }

  ping(value = Buffer.alloc(0)) {
    if (this.readyState !== OPEN) return;
    this.socket.write(frame(0x9, value));
  }

  terminate() {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.socket.destroy();
    this.finishClose();
  }

  finishClose() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = CLOSED;
    this.emit('close');
  }

  protocolError() {
    if (this.readyState === OPEN) {
      try { this.socket.write(frame(0x8, Buffer.from([0x03, 0xea]))); } catch (_) { /* ignored */ }
    }
    this.terminate();
  }

  acceptData(chunk) {
    if (this.readyState !== OPEN || !chunk?.length) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const final = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (first & 0x70 || !masked) {
        this.protocolError();
        return;
      }
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const longLength = this.buffer.readBigUInt64BE(2);
        if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.protocolError();
          return;
        }
        length = Number(longLength);
        offset = 10;
      }
      if (length > this.maximumPayload || offset + 4 + length > this.maximumPayload + 14) {
        this.protocolError();
        return;
      }
      if (this.buffer.length < offset + 4 + length) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      this.buffer = this.buffer.subarray(offset + 4 + length);
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];

      if (opcode >= 0x8) {
        if (!final || length > 125) {
          this.protocolError();
          return;
        }
        if (opcode === 0x8) {
          if (this.readyState === OPEN) this.socket.write(frame(0x8, payload));
          this.socket.end();
          this.finishClose();
          return;
        }
        if (opcode === 0x9) this.socket.write(frame(0xA, payload));
        else if (opcode === 0xA) this.emit('pong', payload);
        else {
          this.protocolError();
          return;
        }
        continue;
      }

      if (opcode === 0x0) {
        if (this.fragmentOpcode === null) {
          this.protocolError();
          return;
        }
        this.fragments.push(payload);
        this.fragmentLength += payload.length;
      } else if (opcode === 0x1 || opcode === 0x2) {
        if (this.fragmentOpcode !== null) {
          this.protocolError();
          return;
        }
        this.fragmentOpcode = opcode;
        this.fragments = [payload];
        this.fragmentLength = payload.length;
      } else {
        this.protocolError();
        return;
      }

      if (this.fragmentLength > this.maximumPayload) {
        this.protocolError();
        return;
      }
      if (final) {
        const message = this.fragments.length === 1
          ? this.fragments[0]
          : Buffer.concat(this.fragments, this.fragmentLength);
        const messageOpcode = this.fragmentOpcode;
        this.fragments = [];
        this.fragmentLength = 0;
        this.fragmentOpcode = null;
        if (messageOpcode === 0x1 || messageOpcode === 0x2) this.emit('message', message);
      }
    }
  }
}

class WebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maximumPayload = Number(options.maxPayload) || 128 * 1024;
    this.sockets = new Set();
  }

  handleUpgrade(request, socket, head, callback) {
    const key = request.headers['sec-websocket-key'];
    const version = request.headers['sec-websocket-version'];
    const upgrade = String(request.headers.upgrade || '').toLowerCase();
    const newLine = String.fromCharCode(13, 10);
    if (!key || version !== '13' || upgrade !== 'websocket') {
      socket.write(['HTTP/1.1 400 Bad Request', 'Connection: close', '', ''].join(newLine));
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WEBSOCKET_GUID).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + accept,
      '',
      ''
    ].join(newLine));
    const websocket = new ServerWebSocket(socket, this.maximumPayload);
    this.sockets.add(websocket);
    websocket.once('close', () => this.sockets.delete(websocket));
    if (head?.length) websocket.acceptData(head);
    callback(websocket);
  }

  close() {
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear();
  }
}

module.exports = {
  WebSocket: { OPEN, CLOSED },
  WebSocketServer
};
