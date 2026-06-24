/* Functional tests for the Kali-grade application-layer tools.
 *   node test/kali.mjs   (or with PW_PATH=/abs/playwright/index.js) */
import http from 'node:http';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
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

/* Path Traversal / LFI */
{
  const { s, url } = await serve((req, res) => { const f = new URL(req.url, 'http://x').searchParams.get('file') || ''; if (/etc\/passwd/.test(f)) res.end('root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:'); else res.end('normal page'); });
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/lfi-tester', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/?file=FUZZ');
  await p.locator('#dMain').getByText('Test traversal', { exact: true }).click();
  await p.waitForTimeout(1500);
  const res = await p.locator('#dMain table.tbl tbody tr td:last-child').allInnerTexts();
  ok('LFI Tester detects /etc/passwd content', res.some(r => /file content leaked/.test(r)));
  await p.close(); s.close();
}

/* Password Strength */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/pw-strength', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('password');
  await p.waitForTimeout(200);
  const weak = await out(p);
  await p.locator('#dMain input').first().fill('Tr0ub4dour&3xtra-Long-PHRASE!');
  await p.waitForTimeout(200);
  const strong = await out(p);
  ok('Password Strength rates weak vs strong', /WEAK/.test(weak) && /common/.test(weak) && /STRONG/.test(strong));
  await p.close();
}

/* SSTI Builder */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/ssti-builder', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  const txt = await p.locator('#dMain').innerText();
  ok('SSTI Builder lists engine probes', /\{\{7\*7\}\}/.test(txt) && /Freemarker/.test(txt));
  await p.close();
}

/* JWT Secret Cracker — recover 'secret' */
{
  const b64u = x => Buffer.from(x).toString('base64url');
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), pl = b64u(JSON.stringify({ user: 'x' }));
  const sig = crypto.createHmac('sha256', 'secret').update(h + '.' + pl).digest('base64url');
  const token = h + '.' + pl + '.' + sig;
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/jwt-cracker', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').first().fill(token);
  await p.locator('#dMain').getByText('Crack', { exact: true }).click();
  await p.waitForTimeout(800);
  ok('JWT Cracker recovers HS256 secret', /SECRET FOUND:\s*secret/.test(await out(p)));
  await p.close();
}

/* Subnet Calculator */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/subnet-calc', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('192.168.1.0/24');
  await p.waitForTimeout(200);
  const txt = await out(p);
  ok('Subnet Calc computes /24', /192\.168\.1\.255/.test(txt) && /hosts\s*:\s*254/.test(txt));
  await p.close();
}

/* File Type ID — PNG magic */
{
  const png = join(tmpdir(), 'fs_magic_test.bin');
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/filetype-id', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input[type=file]').setInputFiles(png);
  await p.waitForTimeout(400);
  ok('File Type ID detects PNG from magic bytes', /PNG image/.test(await out(p)));
  await p.close();
}

/* CRLF Injection — marker reflected in body */
{
  const { s, url } = await serve((req, res) => res.end('echo: ' + req.url));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/crlf-tester', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/?next=FUZZ');
  await p.locator('#dMain').getByText('Test CRLF', { exact: true }).click();
  await p.waitForTimeout(1200);
  ok('CRLF Tester detects reflected marker', /response splitting likely|reflection/.test(await out(p)));
  await p.close(); s.close();
}

/* Email Permutator */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/email-permutator', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').nth(0).fill('jane');
  await p.locator('#dMain input').nth(1).fill('doe');
  await p.locator('#dMain input').nth(2).fill('example.com');
  await p.waitForTimeout(200);
  const txt = await out(p);
  ok('Email Permutator builds formats', /jane\.doe@example\.com/.test(txt) && /jdoe@example\.com/.test(txt));
  await p.close();
}

/* JSON Tools */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/json-tools', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain').getByText('Validate', { exact: true }).click();
  await p.waitForTimeout(150);
  const valid = /valid JSON/.test(await out(p));
  await p.locator('#dMain textarea').first().fill('{bad json');
  await p.locator('#dMain').getByText('Validate', { exact: true }).click();
  await p.waitForTimeout(150);
  ok('JSON Tools validates good + bad', valid && /invalid JSON/.test(await out(p)));
  await p.close();
}

/* Shodan / Censys Query Builder */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/shodan-query', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('example.com');
  await p.waitForTimeout(200);
  const txt = await out(p);
  ok('Shodan Query builds Shodan + Censys', /hostname:example\.com/.test(txt) && /CENSYS/.test(txt));
  await p.close();
}

/* File Hasher — SHA-256 of "abc" */
{
  const f = join(tmpdir(), 'fs_hash_abc.bin'); writeFileSync(f, Buffer.from('abc'));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/file-hasher', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input[type=file]').setInputFiles(f);
  await p.waitForTimeout(600);
  ok('File Hasher SHA-256("abc")', /ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/.test(await out(p)));
  await p.close();
}

/* Rate / Load Tester */
{
  const { s, url } = await serve((req, res) => res.end('ok'));
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/rate-tester', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(url + '/');
  await p.locator('#dMain input').nth(1).fill('8');
  await p.locator('#dMain').getByText('Run burst', { exact: true }).click();
  await p.waitForTimeout(1500);
  const txt = await out(p);
  ok('Rate Tester reports status + latency', /STATUS DISTRIBUTION/.test(txt) && /200/.test(txt) && /p95/.test(txt));
  await p.close(); s.close();
}

/* Diff Tool */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/diff-tool', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').nth(0).fill('alpha\nbeta\ngamma');
  await p.locator('#dMain textarea').nth(1).fill('alpha\nDELTA\ngamma');
  await p.locator('#dMain').getByText('Compare', { exact: true }).click();
  await p.waitForTimeout(200);
  const txt = await out(p);
  ok('Diff Tool shows +/- lines', /- beta/.test(txt) && /\+ DELTA/.test(txt));
  await p.close();
}

/* URL Analyzer — decodes embedded JWT */
{
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.sig';
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/url-analyzer', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill('https://app.test:8443/a/b?token=' + jwt + '&id=5#frag');
  await p.locator('#dMain').getByText('Analyze', { exact: true }).click();
  await p.waitForTimeout(200);
  const txt = await out(p);
  ok('URL Analyzer splits + decodes JWT param', /app\.test/.test(txt) && /8443/.test(txt) && /"role":"admin"/.test(txt));
  await p.close();
}

/* User-Agent Parser */
{
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/ua-parser', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').first().fill('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await p.locator('#dMain').getByText('Parse', { exact: true }).click();
  await p.waitForTimeout(150);
  const txt = await out(p);
  ok('UA Parser detects Chrome + Windows + Blink', /Chrome 120/.test(txt) && /Windows/.test(txt) && /Blink/.test(txt));
  await p.close();
}

/* SAML Decoder — base64 XML (POST binding) */
{
  const xml = '<samlp:Response xmlns:samlp="x"><saml:Issuer>https://idp.test/meta</saml:Issuer><saml:Assertion><saml:Subject><saml:NameID>jane@test</saml:NameID></saml:Subject><saml:Conditions NotBefore="2024-01-01T00:00:00Z" NotOnOrAfter="2030-01-01T00:00:00Z"/></saml:Assertion></samlp:Response>';
  const b64 = Buffer.from(xml).toString('base64');
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/saml-decoder', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain textarea').first().fill(b64);
  await p.locator('#dMain').getByText('Decode', { exact: true }).click();
  await p.waitForTimeout(300);
  const txt = await out(p);
  ok('SAML Decoder extracts issuer + NameID', /idp\.test\/meta/.test(txt) && /jane@test/.test(txt));
  await p.close();
}

await b.close();
console.log('\n' + (fails ? 'FAIL (' + fails + ' failures)' : 'PASS — all Kali-grade tools verified'));
process.exit(fails ? 1 : 0);
