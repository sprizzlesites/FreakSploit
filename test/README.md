# Tests

Headless verification with Playwright. No package.json — point the runner at
any Playwright install via `PW_PATH` (absolute path to its `index.js`), or run
plainly if `playwright` resolves locally.

```sh
# smoke: both modes mount, all routes render, iOS hides "daemon"
PW_PATH=/path/to/node_modules/playwright/index.js node test/smoke.mjs

# daemon: spins up a mock WebSocket daemon and drives the desktop tools,
# asserting they render streamed scan/iface/packet/console data
PW_PATH=/path/to/node_modules/playwright/index.js node test/daemon.mjs

# offense: serves mock vulnerable endpoints and asserts the active tools
# actually detect planted issues (leaked keys, SQL errors, SSTI eval)
PW_PATH=/path/to/node_modules/playwright/index.js node test/offense.mjs
```

Both exit non-zero on failure. The WebSocket connection-refused messages in
`smoke.mjs` are expected (no daemon there) and are filtered from the result.
