/* Functional tests for the Kali-grade application-layer tools.
 *   node test/kali.mjs   (or with PW_PATH=/abs/playwright/index.js) */
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const PW_PATH = process.env.PW_PATH || 'playwright';
const pwMod = await import(PW_PATH);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const here = dirname(fileURLToPath(import.meta.url));
const file = 'file://' + resolve(here, '..', 'index.html');

let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' :: ' + extra : '')); if (!cond) fails++; };
const serve = (fn) => new Promise(r => {
  const s = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    fn(req, res);
  });
  s.listen(0, () => r({ s, url: 'http://localhost:' + s.address().port }));
});
const b = await chromium.launch();
const out = (p) => p.locator('#dMain .out').first().innerText();

/* Crypto Lab — base64 + SHA-256 */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/crypto-lab', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').first().fill('hello');
  await p.locator('#dMain .btn').filter({ hasText: /^base64$/ }).click();
  await p.waitForTimeout(150);
  ok('Crypto Lab base64', (await out(p)).trim() === 'aGVsbG8=');
  await p.locator('#dMain .btn').filter({ hasText: /^SHA-256$/ }).click();
  await p.waitForTimeout(200);
  ok('Crypto Lab SHA-256', (await out(p)).trim() === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  await p.close();
}

/* Content Discovery */
{
  const { s, url } = await serve((req, res) => {
    if (req.url === '/admin' || req.url === '/api.php') res.end('ok page');
    else { res.statusCode = 404; res.end('not found'); }
  });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/content-discovery', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Start', { exact: true }).click();
  await p.waitForTimeout(2500);
  const paths = await p.locator('#dMain table.tbl tbody tr td:first-child').allInnerTexts();
  ok('Content Discovery finds /admin', paths.includes('/admin'), JSON.stringify(paths.slice(0, 5)));
  await p.close(); s.close();
}

/* Tech Fingerprint */
{
  const { s, url } = await serve((req, res) => { res.setHeader('Server', 'nginx'); res.setHeader('X-Powered-By', 'PHP/8.1'); res.end('<html><head><link href="/wp-content/themes/x/style.css"></head><body>hi</body></html>'); });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/tech-fingerprint', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Fingerprint', { exact: true }).click();
  await p.waitForTimeout(1000);
  ok('Tech Fingerprint detects WordPress', /WordPress/.test(await out(p)));
  await p.close(); s.close();
}

/* Param Miner — reflects only ?debug= */
{
  const { s, url } = await serve((req, res) => { const v = new URL(req.url, 'http://x').searchParams.get('debug'); res.end(v ? 'page ' + v : 'page baseline'); });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/param-miner', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/');
  await p.locator('#dMain').getByText('Mine', { exact: true }).click();
  await p.waitForTimeout(3000);
  const params = await p.locator('#dMain table.tbl tbody tr td:first-child').allInnerTexts();
  ok('Param Miner finds hidden debug param', params.includes('debug'), JSON.stringify(params));
  await p.close(); s.close();
}

/* Open Redirect — body-based JS sink reflects payload */
{
  const { s, url } = await serve((req, res) => { const v = new URL(req.url, 'http://x').searchParams.get('redirect') || ''; res.end('<html><script>location.replace("' + v + '")<\/script></html>'); });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/open-redirect', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/go?redirect=FUZZ');
  await p.locator('#dMain').getByText('Scan', { exact: true }).click();
  await p.waitForTimeout(1500);
  ok('Open Redirect detects JS sink', /OPEN REDIRECT/.test(await out(p)));
  await p.close(); s.close();
}

/* Clickjacking — no XFO -> flagged */
{
  const { s, url } = await serve((req, res) => res.end('<html><body>framable</body></html>'));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/clickjacking', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Test', { exact: true }).click();
  await p.waitForTimeout(1200);
  ok('Clickjacking flags missing anti-framing', /no effective anti-framing/.test(await out(p)));
  await p.close(); s.close();
}

/* CSRF PoC — pure generator */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/csrf-poc', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('https://victim.test/transfer');
  await p.locator('#dMain textarea').nth(1).fill('amount=1000&to=attacker');
  await p.locator('#dMain').getByText('Generate PoC', { exact: true }).click();
  await p.waitForTimeout(200);
  const poc = await out(p);
  ok('CSRF PoC builds auto-submit form', /<form/.test(poc) && /victim\.test\/transfer/.test(poc) && /amount/.test(poc));
  await p.close();
}

/* Reverse Shell — pure generator */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/revshell', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('10.0.0.1');
  await p.locator('#dMain input').nth(1).fill('4444');
  await p.waitForTimeout(200);
  const txt = await p.locator('#dMain').innerText();
  ok('Reverse Shell generates bash payload', /\/dev\/tcp\/10\.0\.0\.1\/4444/.test(txt));
  await p.close();
}

/* Web Spider */
{
  const { s, url } = await serve((req, res) => res.end(`<html><body>
    <a href="/about">about</a><a href="/contact">contact</a>
    <form action="/login" method="post"><input name="user"><input name="pass"></form>
    <script src="/static/app.js"></script>
    <script>fetch('/api/v1/users'); const e="admin@target.test";</script>
  </body></html>`));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/web-spider', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Spider', { exact: true }).click();
  await p.waitForTimeout(1200);
  const txt = await out(p);
  ok('Web Spider extracts link/endpoint/email/form', /\/about/.test(txt) && /\/api\/v1\/users/.test(txt) && /admin@target\.test/.test(txt) && /\/login/.test(txt));
  await p.close(); s.close();
}

/* GraphQL Lab */
{
  const { s, url } = await serve((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { __schema: { queryType: { name: 'Query' }, mutationType: { name: 'Mutation' }, types: [
        { name: 'Query', kind: 'OBJECT', fields: [{ name: 'users' }, { name: 'posts' }] },
        { name: 'Mutation', kind: 'OBJECT', fields: [{ name: 'login' }] },
        { name: 'User', kind: 'OBJECT', fields: [{ name: 'id' }] },
      ] } } }));
    });
  });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/graphql-lab', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/graphql');
  await p.locator('#dMain').getByText('Introspect', { exact: true }).click();
  await p.waitForTimeout(1000);
  const txt = await out(p);
  ok('GraphQL Lab introspection lists queries', /introspection ENABLED/.test(txt) && /users/.test(txt) && /login/.test(txt));
  await p.close(); s.close();
}

await b.close();
console.log('\n' + (fails ? 'FAIL (' + fails + ' failures)' : 'PASS — all Kali-grade tools verified'));
process.exit(fails ? 1 : 0);
