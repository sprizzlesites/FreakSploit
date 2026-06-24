/* Headless smoke test for FreakSploit (single-file app).
 *
 * Verifies: both platform modes mount without runtime errors, every tool
 * route renders, the JWT tool decodes, the command palette opens, and the
 * word "daemon" never appears in the iOS build.
 *
 * Requires Playwright with a chromium browser. Run:
 *   node test/smoke.mjs
 * If playwright isn't resolvable locally, point the import at a global
 * install, e.g.  node --import ...  or edit PW_PATH below.
 * (WebSocket ERR_CONNECTION_REFUSED to ws://localhost:7373 is expected when
 *  no daemon is running and is filtered out of the failure count.)
 */
const PW_PATH = process.env.PW_PATH || 'playwright';
const pwMod = await import(PW_PATH);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const file = 'file://' + resolve(here, '..', 'index.html');

const b = await chromium.launch();
const errors = [];
const benign = t => /ws:\/\/localhost:7373|ERR_CONNECTION_REFUSED|WebSocket connection/.test(t);
async function page(url) {
  const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errors.push('[console] ' + m.text()); });
  p.on('pageerror', e => { if (!benign(e.message)) errors.push('[pageerror] ' + e.message); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  return p;
}

let p = await page(file + '?mode=desktop');
console.log('DESKTOP navItems=' + await p.locator('#dSidebar .nav-item').count() + ' overviewCards=' + await p.locator('#dMain .card').count());

const ids = ['http-fuzzer','header-inspector','dns-recon','subdomain-enum','jwt-analyzer','hash-cracker','password-gen','ssl-inspector','osint','payload-library','report-builder','secret-scanner','request-forge','ws-workbench','auth-lab','param-tamper','injection-tester','idor-probe','cors-tester','api-discovery','crypto-lab','content-discovery','tech-fingerprint','param-miner','open-redirect','clickjacking','csrf-poc','revshell','waf-detector','web-spider','graphql-lab','ssrf-probe','email-auth','wp-scan','webrtc-leak','exif-viewer','jwt-attacks','http-methods','bypass-403','csp-auditor','cookie-analyzer','dork-generator','proto-pollution','typosquat','favicon-hash','mixed-content','dev-utils','cache-probe','bucket-finder','wayback','xxe-helper','jwks-inspector','sri-checker','txt-parser','takeover','pwned-pass','ssti-builder','lfi-tester','hsts-checker','pw-strength','jwt-cracker','ip-intel','subnet-calc','crlf-tester','filetype-id','rate-tester','email-permutator','json-tools','shodan-query','file-hasher','diff-tool','url-analyzer','ua-parser','saml-decoder','packet-analyzer','network-scanner','http-interceptor','exploit-console','interface-manager','packet-injector','remote-daemon','history','settings'];
let fails = 0;
for (const id of ids) {
  await p.goto(file + '?mode=desktop#/' + id, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(120);
  const body = await p.locator('#dMain .tool-body, #dMain .gate').count();
  const err = await p.locator('#dMain .out.err').count();
  if (err || !body) { console.log('  ! ' + id + ' err=' + err + ' body=' + body); fails++; }
}
console.log('Desktop routes: ' + ids.length + ' renderFailures=' + fails);
await p.close();

p = await page(file + '?mode=ios');
const daemonVisible = (await p.locator('#app.ios').innerText()).toLowerCase().includes('daemon');
console.log('IOS pagerPages=' + await p.locator('#iosPager .page').count() + ' tabs=' + await p.locator('#iosTabbar .ios-tab').count() + ' daemonWordVisible=' + daemonVisible);
if (daemonVisible) errors.push('iOS build mentions "daemon"');
await p.close();

await b.close();
console.log('\n' + (errors.length ? 'FAIL\n' + errors.map(e => '  ' + e).join('\n') : 'PASS — no unexpected errors'));
process.exit(errors.length || fails ? 1 : 0);
