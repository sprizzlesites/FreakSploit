/* Mock-daemon integration test. Stands up a tiny pure-node WebSocket server
 * on ws://localhost:7373, then drives the desktop daemon tools and asserts
 * they render the streamed responses. Requires Playwright (see PW_PATH).
 *   node test/daemon.mjs   (or: PW_PATH=/abs/playwright/index.js node ...) */
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const PW_PATH = process.env.PW_PATH || 'playwright';
const pwMod = await import(PW_PATH);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const here = dirname(fileURLToPath(import.meta.url));
const file = 'file://' + resolve(here, '..', 'index.html');

/* ---- minimal WebSocket server (text frames only) ---- */
function encodeFrame(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}
function parseFrames(buf, onMsg) {
  let off = 0;
  while (off + 2 <= buf.length) {
    const b2 = buf[off + 1], opcode = buf[off] & 0x0f, masked = b2 & 0x80; let len = b2 & 0x7f, p = off + 2;
    if (len === 126) { len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask; if (masked) { mask = buf.subarray(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    const data = buf.subarray(p, p + len);
    if (masked) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    if (opcode === 0x1) onMsg(data.toString());
    off = p + len;
  }
}
function handle(m, send) {
  if (m.type === 'hello') send({ type: 'welcome', server: 'mock-daemon' });
  else if (m.type === 'scan.start') {
    send({ type: 'scan.host', host: '192.168.1.1' });
    send({ type: 'scan.port', host: '192.168.1.1', port: 22, state: 'open', service: 'ssh' });
    send({ type: 'scan.port', host: '192.168.1.1', port: 80, state: 'open', service: 'http' });
    send({ type: 'scan.done', summary: '1 host, 2 open ports' });
  } else if (m.type === 'iface.list') {
    send({ type: 'iface.list', interfaces: [{ name: 'eth0', type: 'ethernet', mac: 'aa:bb:cc:dd:ee:ff', ipv4: '192.168.1.5', monitor: false }, { name: 'wlan0', type: 'wifi', monitor: false }] });
  } else if (m.type === 'capture.start') {
    for (let i = 0; i < 3; i++) send({ type: 'packet.frame', ts: '0.00' + i, src: '10.0.0.2', dst: '10.0.0.1', proto: 'TCP', len: 74, summary: 'SYN', layers: { ethernet: { src: 'aa:bb' }, ip: { ttl: 64 }, tcp: { flags: 'SYN' } } });
  } else if (m.type === 'console.cmd') {
    send({ type: 'console.out', text: '[*] executing ' + m.cmd, level: 'info' });
    send({ type: 'console.out', text: '[+] done', level: 'good' });
  } else if (m.type === 'inject') {
    send({ type: 'inject.ack', sent: m.count || 1 });
  }
}
const server = http.createServer();
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const send = obj => socket.write(encodeFrame(JSON.stringify(obj)));
  socket.on('data', buf => parseFrames(buf, msg => { let m; try { m = JSON.parse(msg); } catch { return; } handle(m, send); }));
  socket.on('error', () => {});
});
await new Promise(r => server.listen(7373, r));
console.log('mock daemon on ws://localhost:7373');

/* ---- drive the app ---- */
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(file + '?mode=desktop', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
const daemonLabel = await p.locator('#daemonLabel').innerText();
console.log('daemon status chip: ' + daemonLabel);

// Network Scanner
await p.goto(file + '?mode=desktop#/network-scanner', { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
await p.locator('#dMain').getByText('Run scan', { exact: true }).click();
await p.waitForTimeout(500);
const scanRows = await p.locator('#dMain table.tbl tbody tr').count();
console.log('Network Scanner result rows: ' + scanRows);

// Interface Manager
await p.goto(file + '?mode=desktop#/interface-manager', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
const ifaceRows = await p.locator('#dMain .list-row').count();
console.log('Interface Manager rows: ' + ifaceRows);

// Packet Analyzer
await p.goto(file + '?mode=desktop#/packet-analyzer', { waitUntil: 'networkidle' });
await p.waitForTimeout(300);
await p.locator('#dMain').getByText('Start capture', { exact: true }).click();
await p.waitForTimeout(500);
const pktRows = await p.locator('#dMain table.tbl tbody tr').count();
console.log('Packet Analyzer frames: ' + pktRows);

// Exploit Console
await p.goto(file + '?mode=desktop#/exploit-console', { waitUntil: 'networkidle' });
await p.waitForTimeout(300);
await p.locator('#dMain input').first().fill('search ms17-010');
await p.locator('#dMain').getByText('Run', { exact: true }).click();
await p.waitForTimeout(400);
const consoleOut = await p.locator('#dMain .out').first().innerText();
console.log('Exploit Console shows output: ' + consoleOut.includes('done'));

await b.close();
server.close();
const ok = scanRows >= 2 && ifaceRows >= 2 && pktRows >= 3 && !errs.length;
console.log('\n' + (ok ? 'PASS — daemon protocol UIs render streamed data' : 'FAIL') + (errs.length ? '\nerrors: ' + errs.join('; ') : ''));
process.exit(ok ? 0 : 1);
