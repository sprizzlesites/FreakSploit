# FreakSploit

A single-file, zero-install, browser-based developer & pentesting suite. The
page itself is always the UI — drop `index.html` on GitHub Pages (or any static
CDN) and it runs. No build step, no bundler, no npm, no server-side compute.

## Status — Foundation shell

This is the foundational shell. The interactive tool UIs land on top of it next;
every tool currently renders a wired stub card.

What's built:

1. **Platform detection & capability tiers** — `navigator.userAgent`,
   `maxTouchPoints`, screen dimensions and `connection` decide the tier.
   iPadOS-as-desktop spoofing is handled. Force a tier for testing with
   `?mode=ios` or `?mode=desktop`.
2. **Two layout systems**
   - **Desktop tier** (Mac/Windows/Linux/Android) — multi-pane IDE layout:
     sidebar nav, dense main view, integrated terminal/daemon-log panel,
     keyboard navigation (`j`/`k`/arrows, `g` → overview).
   - **iOS tier** (iPhone/iPad) — single-column, card-based, thumb-friendly
     (44px+ targets), horizontal scroll-snap swipe pager + bottom tab bar.
     **Zero mention of the daemon anywhere** — iOS never sees daemon UI or
     "unavailable" states.
3. **Tool routing** — hash-based router; data-driven tool registry.
4. **Daemon WebSocket manager** — `ws://localhost:7373`, JSON messaging,
   exponential-backoff reconnect, live status indicator (topbar + terminal),
   manual retry. Desktop-only; never instantiated on iOS.
5. **Stub tool cards** for every tool in both modes.

### Capability tiers

- **Browser-native tools** (both tiers): HTTP Fuzzer, Header Inspector, DNS
  Recon, Subdomain Enumerator, JWT Analyzer, Hash Cracker, Password/Wordlist
  Builder, SSL/TLS Inspector, OSINT Dashboard, Payload Library, Report Builder.
- **Daemon-connected tools** (desktop only, degrade to a "connect daemon"
  gate when offline): Packet Analyzer, Network Scanner, HTTP Interceptor,
  Exploit Console, Interface Manager, Raw Packet Injector, Remote Daemon
  Connector.

Color language: **green** = available, **amber** = daemon required but missing,
iOS-unavailable tools are never rendered.

## Architecture notes

- **Single HTML file** — all CSS/JS inline. No frameworks; vanilla JS only.
- **Conditional desktop modules** — desktop-only tool factories are only
  invoked in the desktop tier, so the iOS path never loads daemon logic.
- **IndexedDB** for all persistence (settings, wordlists, history, reports,
  tool state).
- **Service worker** (registered from a Blob URL to stay single-file) caches
  the app shell for offline use; tools degrade gracefully.
- The **Rust daemon** is a separate project and is intentionally not scaffolded
  here. The app assumes it exposes `ws://localhost:7373` with JSON messaging.

## Run locally

Just open `index.html`, or serve the directory:

```sh
python3 -m http.server 8080   # then visit http://localhost:8080
```

A static server is recommended so the service worker can register.
