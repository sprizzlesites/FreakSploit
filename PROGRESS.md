# FreakSploit — Build Progress Tracker

> **For "continue":** read this file top-to-bottom, find the first unchecked
> `[ ]` item under "Build queue", and implement it. Update this file + commit
> after each tool. This is the single source of truth across sessions.

Last updated: 2026-06-24 (session start, autonomous overnight build)

## How the build works
- Everything lives in `index.html` (single file, vanilla JS, no build step).
- Each tool is an entry in the `Impl` registry inside the main IIFE. Browser-
  native tools render the same UI on desktop **and** inside the iOS swipe pager.
- Daemon tools render a protocol-driven UI gated behind the WebSocket status.
- After each tool: validate JS with node, update this file, commit + push to
  `claude/penkit-suite-shell-ejjv48`.

## Conventions for new tools
- Add CSS to the "TOOL KIT" style block only (shared classes).
- Implement `Impl["tool-id"] = (container, tool) => {...}`.
- Use `UIKit` helpers (`field`, `area`, `select`, `btn`, `out`, `panel`).
- Persist via `DB` stores: settings / wordlists / history / reports / toolstate.

---

## Build queue

### Phase 0 — Foundation shell ✅ DONE
- [x] Platform detection & capability tiers
- [x] Desktop multi-pane layout
- [x] iOS swipe layout + bottom tab bar
- [x] Hash router + data-driven registry
- [x] Daemon WebSocket manager (reconnect, status)
- [x] IndexedDB layer + Settings
- [x] Service worker (blob) offline shell
- [x] Stub cards for all tools

### Phase 1 — Tool UI kit ✅ DONE
- [x] Shared form/output CSS (TOOL KIT block)
- [x] `UIKit` helpers (field/area/select/btn/out/panel/kv/copy)
- [x] `Impl` registry + dispatch from desktop view & iOS pager
- [x] Optional CORS-proxy setting plumbing (`Net.fetch`)

### Phase 2 — Browser-native tools (work on iOS + desktop)
- [x] JWT Analyzer (decode, claim audit, HS256/384/512 verify via SubtleCrypto)
- [x] Header Inspector (fetch + security header grading)
- [x] DNS Recon (DoH: A/AAAA/MX/TXT/NS/CNAME/SOA/CAA)
- [x] HTTP Fuzzer (FUZZ placeholder, wordlist, anomaly detection)
- [x] Subdomain Enumerator (DoH-driven brute force, concurrency)
- [x] Password / Wordlist Builder (rules + mutations, IndexedDB save/load)
- [x] Payload Library (curated XSS/SQLi/LFI/SSRF, filter, copy, custom)
- [x] Hash Cracker (MD5/SHA-1/256/384/512 dictionary + brute force)
- [x] SSL/TLS Inspector (crt.sh cert history + TLS reachability probe)
- [x] OSINT Dashboard (crt.sh subdomains + DNS aggregation)
- [x] Report Builder (findings → markdown/HTML, export, drafts in IndexedDB)

### Phase 3 — iOS section screens
- [x] Library section → live Payload Library
- [x] Reports section → live Report Builder
- [x] Settings section → CORS proxy, DoH provider, data clear, about

### Phase 4 — Daemon-connected tools (desktop, protocol UIs)
> All driven by JSON messages over `ws://localhost:7373`. Render full UI;
> actions no-op with a clear notice when offline (never on iOS).
- [x] Network Scanner (nmap config → /exec, render hosts/ports)
- [x] Packet Analyzer (pcap stream, packet list, dissection, BPF filter)
- [x] HTTP Interceptor (intercept queue, req/res editor, repeater)
- [x] Interface Manager (/interfaces enumerate, monitor-mode toggle)
- [x] Raw Packet Injector (layered packet craft → /inject)
- [x] Exploit Console (console cmd stream, sessions)
- [x] Remote Daemon Connector (custom ws URL, pair, persist)

### Phase 5 — Polish
- [x] Command palette (⌘K) fuzzy tool/action search
- [x] Keyboard shortcut help overlay (`?`)
- [x] Desktop Settings route
- [x] Headless Playwright smoke test (`test/smoke.mjs`) — all routes green
- [x] README refresh
- [x] History store viewer (recent runs per tool) + recording in 5 tools
- [x] Settings: theme accents (5 presets, persisted)
- [x] Screenshots in README (docs/*.png, captured via Playwright)
- [ ] Real sw.js option for full offline navigation (currently blob SW)
- [ ] More tools recording to History (only 5 wired so far)
- [ ] Command palette: actions (not just navigation), recent-first ordering

---

## Session log
- **S1**: Foundation shell shipped (Phase 0). Committed.
- **S1 (overnight)**: Phases 1–3 DONE. All 11 browser-native tools live
  (JWT, Header Inspector, DNS Recon, HTTP Fuzzer, Subdomain Enum, Wordlist
  Builder, Payload Library, Hash Cracker, SSL Inspector, OSINT, Report
  Builder). iOS Library/Reports/Settings wired. MD5 verified vs vectors.
- **S1 (overnight cont.)**: Phase 4 DONE. All 7 daemon protocol UIs built
  (Network Scanner, Packet Analyzer, HTTP Interceptor, Interface Manager,
  Raw Packet Injector, Exploit Console, Remote Daemon Connector) over a
  JSON RPC helper; gate mounts them when online. Boot uses saved ws URL.
- **S1 (overnight cont.)**: Phase 5 mostly done — command palette (⌘K),
  help overlay (?), desktop Settings route, README refresh, and a headless
  Playwright smoke test (`test/smoke.mjs`) that passes: both modes mount
  with no runtime errors, all 19 routes render, iOS shows zero "daemon".
  **CORE SUITE COMPLETE.**
- **S1 (overnight cont.)**: Added theme-accent picker, run-History viewer
  (+recording in 5 tools), and README screenshots (Playwright-captured,
  in docs/). Smoke test green at 20 routes. App is feature-complete and
  visually polished in both modes.
  **Next up (low priority polish): (1) optional standalone sw.js for full
  offline navigation, (2) wire History into remaining tools, (3) command
  palette actions beyond navigation. Otherwise: await user direction.**
