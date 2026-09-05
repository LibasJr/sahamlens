# SahamLens Desktop Security Boundary

## Trust zones

1. **Untrusted renderer content** — local HTML/JS can still be affected by XSS or malicious API data.
2. **Tauri command boundary** — every command is privileged and must validate its complete input.
3. **Operating system services** — credential vault, file dialogs, clipboard, notifications, window state.
4. **SahamLens API** — only `https://sahamlens.id/api/*` through an explicit policy.
5. **External websites** — untrusted; opened only through safe external navigation.

Compromise of renderer JavaScript must not automatically expose credentials, arbitrary network access, shell execution, or unrestricted filesystem access.

## Current blockers before closed beta

- `desktop-web/app/native-fetch-bridge.tsx` stores the bearer token in `localStorage`.
- `desktop/src-tauri/tauri.conf.json` sets CSP to `null`.
- `desktop/src-tauri/capabilities/default.json` targets `*` windows.
- `shell:default` grants broader shell capability than the current product requires.
- `native_api_request` accepts any `/api/` path and treats unknown methods as GET.
- Request body size and redirect behavior are not yet enforced by an explicit policy.

These are documented baseline findings, not accepted production behavior.

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

CSP must be non-null before beta. It must be derived from actual static asset and connection needs, then tested against charts, fonts, images, and the native bridge. Avoid broad `*`, unsafe remote scripts, and unneeded origins.

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
