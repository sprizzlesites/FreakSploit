/* Functional tests for the Offense tools. Spins up local mock servers and
 * asserts the tools actually detect planted issues (not just render).
 *   node test/offense.mjs   (or with PW_PATH=/abs/playwright/index.js) */
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const PW_PATH = process.env.PW_PATH || 'playwright';
const pwMod = await import(PW_PATH);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const here = dirname(fileURLToPath(import.meta.url));
const file = 'file://' + resolve(here, '..', 'index.html');

let fails = 0;
const b = await chromium.launch();

/* --- Secret Scanner ---
 * Planted secrets are assembled from fragments so this source file contains
 * no contiguous secret pattern (avoids secret-scanning false positives on
 * obviously-fake fixtures). The served content is the full token. */
{
  const KEY = {
    stripe: 'sk_' + 'live_' + 'abcdEFGH1234567890wxyzABCD',
    aws: 'AK' + 'IA' + 'IOSFODNN7EXAMPLE',
    google: 'AI' + 'za' + 'SyA1234567890abcdefghijklmnopqrstuv',
    github: 'gh' + 'p_' + '0123456789012345678901234567890123456',
  };
  const HTML = `<!doctype html><html><head>
  <script>var stripe="${KEY.stripe}";</script>
  <script src="/app.js"></script></head><body>${KEY.aws}</body></html>`;
  const JS = `const cfg={apiKey:"${KEY.google}"};\nconst gh="${KEY.github}";`;
  const srv = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); res.end(JS); }
    else res.end(HTML);
  });
  await new Promise(r => srv.listen(0, r));
  const base = 'http://localhost:' + srv.address().port + '/';
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/secret-scanner', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(base);
  await p.locator('#dMain').getByText('Scan', { exact: true }).click();
  await p.waitForTimeout(1500);
  const types = await p.locator('#dMain table.tbl tbody tr td:nth-child(2)').allInnerTexts();
  const want = ['AWS Access Key ID', 'Google API Key', 'Stripe Live Secret', 'GitHub Token'];
  const got = want.filter(w => types.includes(w)).length;
  console.log('Secret Scanner: ' + got + '/' + want.length + ' planted keys found');
  if (got < 3) fails++;
  await p.close(); srv.close();
}

/* --- Injection Tester --- */
{
  const srv = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const q = new URL(req.url, 'http://x').searchParams.get('q') || '';
    let body = 'results for: ' + q;
    if (q.includes("'") || q.includes('"')) body = "You have an error in your SQL syntax near '" + q + "'";
    else if (q === '{{7*7}}' || q === "{{7*'7'}}") body = 'results for: 49';
    res.end(body);
  });
  await new Promise(r => srv.listen(0, r));
  const base = 'http://localhost:' + srv.address().port + '/?q=FUZZ';
  const p = await b.newPage();
  await p.goto(file + '?mode=desktop#/injection-tester', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.locator('#dMain input').first().fill(base);
  await p.locator('#dMain').getByText('Test injection', { exact: true }).click();
  await p.waitForTimeout(2000);
  const sig = (await p.locator('#dMain table.tbl tbody tr td:nth-child(5)').allInnerTexts()).filter(s => s && s !== '—');
  const sql = sig.some(s => /SQL error/.test(s)), ssti = sig.some(s => /template evaluated/.test(s));
  console.log('Injection Tester: SQL-error=' + sql + ' SSTI=' + ssti);
  if (!sql || !ssti) fails++;
  await p.close(); srv.close();
}

await b.close();
console.log('\n' + (fails ? 'FAIL (' + fails + ')' : 'PASS — Offense tools detect planted issues'));
process.exit(fails ? 1 : 0);
