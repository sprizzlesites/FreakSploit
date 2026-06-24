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

/* WordPress Scanner */
{
  const { s, url } = await serve((req, res) => {
    if (req.url === '/wp-json/wp/v2/users') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify([{ id: 1, name: 'Site Admin', slug: 'admin' }, { id: 2, name: 'Editor Jane', slug: 'jane' }])); }
    res.end('<html><head><meta name="generator" content="WordPress 6.4.2"></head><body><link href="/wp-content/plugins/contact-form-7/x.css"><link href="/wp-content/themes/twentytwentyfour/style.css"></body></html>');
  });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/wp-scan', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Scan', { exact: true }).click();
  await p.waitForTimeout(1500);
  const txt = await out(p);
  ok('WP Scanner: detect + user enum + version + plugin', /WordPress detected/.test(txt) && /admin/.test(txt) && /6\.4\.2/.test(txt) && /contact-form-7/.test(txt));
  await p.close(); s.close();
}

/* JWT Attack Lab — alg:none generation */
{
  const sample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6InVzZXIifQ.x';
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/jwt-attacks', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').first().fill(sample);
  await p.locator('#dMain').getByText('Generate attack tokens', { exact: true }).click();
  await p.waitForTimeout(400);
  const titles = await p.locator('#dMain .lr-title').allInnerTexts();
  ok('JWT Attacks generates alg:none + kid + role', titles.some(t => /alg:none/.test(t)) && titles.some(t => /kid/.test(t)) && titles.some(t => /admin/.test(t)));
  await p.close();
}

/* HTTP Methods Tester — PUT enabled */
{
  const { s, url } = await serve((req, res) => { if (req.method === 'PUT') { res.statusCode = 200; res.end('ok'); } else { res.statusCode = 200; res.end('ok'); } });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/http-methods', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/resource');
  await p.locator('#dMain').getByText('Test methods', { exact: true }).click();
  await p.waitForTimeout(1500);
  ok('HTTP Methods flags enabled PUT', /PUT\s+200.*enabled/s.test(await out(p)) || /method enabled/.test(await out(p)));
  await p.close(); s.close();
}

/* 403 Bypass — /admin 403 but /admin/ 200 */
{
  const { s, url } = await serve((req, res) => { if (req.url === '/admin/') { res.statusCode = 200; res.end('secret panel'); } else if (req.url === '/admin') { res.statusCode = 403; res.end('forbidden'); } else { res.statusCode = 404; res.end('x'); } });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/bypass-403', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/admin');
  await p.locator('#dMain').getByText('Try bypasses', { exact: true }).click();
  await p.waitForTimeout(2000);
  const results = await p.locator('#dMain table.tbl tbody tr td:last-child').allInnerTexts();
  ok('403 Bypass finds /admin/ trick', results.some(r => /BYPASS/.test(r)), JSON.stringify(results.filter(Boolean).slice(0, 3)));
  await p.close(); s.close();
}

/* CSP Auditor — flags unsafe-inline */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/csp-auditor', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').first().fill("default-src 'self'; script-src 'self' 'unsafe-inline'");
  await p.locator('#dMain').getByText('Audit pasted CSP', { exact: true }).click();
  await p.waitForTimeout(300);
  ok('CSP Auditor flags unsafe-inline', /unsafe-inline/.test(await out(p)));
  await p.close();
}

/* Prototype Pollution Scanner */
{
  const { s, url } = await serve((req, res) => res.end('<html><body><script>const o=lodash.merge({}, JSON.parse(location.hash.slice(1))); obj["__proto__"]=1;<\/script></body></html>'));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/proto-pollution', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Scan', { exact: true }).click();
  await p.waitForTimeout(1200);
  const txt = await out(p);
  ok('Proto Pollution finds merge + __proto__', /lodash merge/.test(txt) && /__proto__/.test(txt));
  await p.close(); s.close();
}

/* Cache Poisoning Probe — reflects X-Forwarded-Host */
{
  const { s, url } = await serve((req, res) => res.end('<html>host=' + (req.headers['x-forwarded-host'] || '') + '</html>'));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/cache-probe', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/');
  await p.locator('#dMain').getByText('Probe', { exact: true }).click();
  await p.waitForTimeout(1500);
  ok('Cache Probe detects reflected X-Forwarded-Host', /X-Forwarded-Host REFLECTED/.test(await out(p)));
  await p.close(); s.close();
}

/* Favicon Hash — pipeline produces a stable mmh3 */
{
  const { s, url } = await serve((req, res) => { res.setHeader('content-type', 'image/x-icon'); res.end(Buffer.from('FREAKSPLOITFAVICON12345')); });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/favicon-hash', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Compute hash', { exact: true }).click();
  await p.waitForTimeout(1000);
  ok('Favicon Hash computes mmh3 + Shodan pivot', /mmh3 hash\s*:\s*-?\d+/.test(await out(p)) && /http\.favicon\.hash:/.test(await out(p)));
  await p.close(); s.close();
}

/* Dev Utilities — epoch convert */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/dev-utils', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('0');
  await p.locator('#dMain').getByText('Convert', { exact: true }).first().click();
  await p.waitForTimeout(200);
  ok('Dev Utilities epoch→date', /1970-01-01/.test(await out(p)));
  await p.close();
}

/* Typosquat Generator */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/typosquat', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('example.com');
  await p.locator('#dMain').getByText('Generate', { exact: true }).click();
  await p.waitForTimeout(300);
  const txt = await p.locator('#dMain').innerText();
  ok('Typosquat generates TLD-swap + homoglyph', /example\.net/.test(txt) && /exampl3\.com/.test(txt));
  await p.close();
}

/* JWKS Inspector */
{
  const { s, url } = await serve((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'test-key-1', alg: 'RS256', use: 'sig', n: 'sXch1234567890abcdefABCDEF', e: 'AQAB' }] })); });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/jwks-inspector', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/jwks.json');
  await p.locator('#dMain').getByText('Inspect', { exact: true }).click();
  await p.waitForTimeout(800);
  const txt = await out(p);
  ok('JWKS Inspector lists kid + thumbprint', /test-key-1/.test(txt) && /thumbprint/.test(txt));
  await p.close(); s.close();
}

/* SRI Checker */
{
  const { s, url } = await serve((req, res) => res.end('<html><head><script src="https://cdn.example.com/lib.js"><\/script><script src="/local.js"><\/script></head></html>'));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/sri-checker', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Check', { exact: true }).click();
  await p.waitForTimeout(800);
  const txt = await out(p);
  ok('SRI Checker flags missing integrity on third-party', /no integrity/.test(txt) && /cdn\.example\.com/.test(txt));
  await p.close(); s.close();
}

/* robots / security.txt parser */
{
  const { s, url } = await serve((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *\nDisallow: /admin\nDisallow: /secret-api\nSitemap: ' + url + '/sitemap.xml');
    if (req.url === '/.well-known/security.txt') return res.end('Contact: mailto:security@target.test\nExpires: 2026-01-01T00:00:00Z');
    if (req.url === '/sitemap.xml') return res.end('<urlset><url><loc>https://t/x</loc></url></urlset>');
    res.statusCode = 404; res.end('x');
  });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/txt-parser', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url);
  await p.locator('#dMain').getByText('Fetch & parse', { exact: true }).click();
  await p.waitForTimeout(1200);
  const txt = await out(p);
  ok('robots/security.txt surfaces disallow + contact', /\/admin/.test(txt) && /\/secret-api/.test(txt) && /security@target\.test/.test(txt));
  await p.close(); s.close();
}

/* XXE Helper — payload generation */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/xxe-helper', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const txt = await p.locator('#dMain').innerText();
  ok('XXE Helper generates file-read payload', /file:\/\/\/etc\/passwd/.test(txt) && /SYSTEM/.test(txt));
  await p.close();
}

await b.close();
console.log('\n' + (fails ? 'FAIL (' + fails + ' failures)' : 'PASS — all Kali-grade tools verified'));
process.exit(fails ? 1 : 0);
