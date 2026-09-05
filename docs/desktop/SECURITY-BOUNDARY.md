# SahamLens Desktop Security Boundary

## Trust zones

1. **Untrusted renderer content** — local HTML/JS can still be affected by XSS or malicious API data.
2. **Tauri command boundary** — every command is privileged and must validate its complete input.
3. **Operating system services** — credential vault, file dialogs, clipboard, notifications, window state.
4. **SahamLens API** — only `https://sahamlens.id/api/*` through an explicit policy.
5. **External websites** — untrusted; opened only through safe external navigation.

Compromise of renderer JavaScript must not automatically expose credentials, arbitrary network access, shell execution, or unrestricted filesystem access.

## Baseline findings status

Resolved on `main`:

- bearer token moved from `localStorage` into the OS credential vault through Rust (#356);
- `native_api_request` no longer accepts a renderer-supplied token, and login/logout run as dedicated native commands (#356);
- route, method, header, body-size, timeout, and redirect policy enforced in `desktop/src-tauri/src/api_policy.rs`, failing closed on unknown input (#354);
- CSP is non-null in `desktop/src-tauri/tauri.conf.json` (#358);
- capabilities bind to the `main` window only (#358);
- `shell:default` and `notification:default` removed together with their unused plugins (#358).

Still open before closed beta:

- safe external navigation and deep-link validation;
- file dialog, export sanitization, and clipboard rules;
- privacy-safe diagnostics envelope;
- signed installers and update metadata verification;
- full threat-model test pass with recorded artifact identifiers.

Each resolved item is covered by a regression audit in `__tests__/desktop-credential-boundary.test.ts`, `__tests__/desktop-native-lockdown.test.ts`, and the Rust policy tests.

## Credential rules

- Persist authentication only in an OS-backed credential vault through Rust.
- Renderer code never stores or receives the bearer token.
- Rust injects the token after validating the request policy.
- Logout, revocation, and authenticated 401 handling delete the stored credential.
- Never log password, token, cookie, authorization header, auth response body, or credential-vault error details containing secrets.
- Legacy localStorage credentials are deleted. If safe migration cannot be proven, require login again.

## Native API request policy

A request is accepted only when all conditions hold:

- scheme is HTTPS;
- host is exactly `sahamlens.id`;
- port is default/approved;
- no userinfo;
- normalized path matches an explicit desktop route policy;
- method is explicitly allowed for that route class;
- request headers are selected from a small allowlist;
- renderer-supplied authorization, cookie, host, origin, referer, and content-length are rejected/ignored;
- body is allowed for the method and within a defined byte limit;
- timeout is bounded;
- redirects are disabled or revalidated as same-origin HTTPS before following.

Unknown input fails closed. Unknown methods must never fall back to GET.

Response exposure is restricted to fields the renderer needs: status, body subject to a response limit, success flag, content type, retry-after, and request ID.

## Tauri capability policy

- Bind capabilities only to known window labels, beginning with `main`.
- No `shell:default` or arbitrary command execution.
- Add plugin permissions only with a concrete feature and negative tests.
- File access uses user-selected paths from native dialogs; no broad filesystem scope.
- Clipboard writes require explicit user action.
- Notifications are opt-in and P1.
- Deep links parse a closed action schema and validated ticker; URLs never become shell commands.

## Content Security Policy

CSP is non-null on `main` and derived from actual static asset and connection needs: `default-src 'self'`, self-only scripts, inline styles for the design system, `data:` images, `ipc:`/`http://ipc.localhost` connections for the native bridge, and `object-src`/`frame-src` set to `'none'`. It is verified by `__tests__/desktop-native-lockdown.test.ts` and must stay free of broad `*` and remote script origins.

CSP is defense in depth. Native commands still validate all inputs as if renderer code were hostile.

## Navigation policy

- Allow internal static-safe routes.
- Rewrite approved dynamic research routes into desktop workspace context.
- Allow external `https:` only through the designated OS opener and show/retain the destination domain.
- Reject `javascript:`, `data:`, `file:`, custom unknown schemes, malformed URLs, and internal admin/development paths.
- Modifier clicks and `_blank` behavior must not bypass policy.

## Local storage policy

Allowed examples:

- theme/language;
- versioned panel layout;
- ticker identifiers for restored tabs;
- non-sensitive window preferences.

Forbidden examples:

- token/password/session secret;
- raw API responses;
- LensAI prompt/response history by default;
- portfolio/watchlist details in generic layout storage;
- provider keys or database credentials.

## Logging and diagnostics

Allowed diagnostic envelope:

- application version;
- OS family;
- route class, not sensitive query/body;
- status code;
- latency bucket;
- timestamp;
- sanitized request ID.

Redact authorization, cookies, token-shaped fields, email, prompts, API body, portfolio, watchlist, and export contents. Crash reporting and product analytics follow explicit privacy policy and consent requirements.

## Threat model minimum

Tests before beta cover:

- XSS-to-native command escalation;
- SSRF URL variants, encoded traversal, userinfo, subdomains, ports, and redirects;
- header/body abuse;
- token leakage through storage, invoke arguments, logs, DOM, and diagnostics;
- unsafe external navigation;
- arbitrary file write/read;
- malicious deep links;
- tampered installer/update metadata;
- malicious or oversized API responses.

Critical/high findings block release.

## Release evidence

A security claim requires real test output and artifact/workflow identifiers. An unsigned internal build can be used for development but is not a completed beta release.
