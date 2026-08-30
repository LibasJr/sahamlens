# Security Penetration Test Report

**Generated:** 2026-08-26 11:00:45 UTC

# Executive Summary

# Executive Summary

A combined low-risk production and source-code security assessment of **SahamLens** was completed for `https://sahamlens.id`. The assessment found **no fully validated vulnerabilities** that demonstrated unauthorized data access, unauthorized modification, service disruption, or exploitable dependency exposure under the authorized production constraints.

**Overall risk posture:** Positive, with hardening opportunities.

**Key outcomes**

- No confirmed reportable vulnerabilities were identified.
- Public and administrative authorization boundaries sampled without authentication returned expected `401` or `403` responses, or presented login-only UI without exposing administrative data.
- Security headers are broadly deployed, including **HSTS**, **CSP**, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy`.
- Source-aware dependency review found **no known vulnerable packages** in the scanned dependency set.
- Several defense-in-depth items remain: legacy TLS protocol support at the CDN edge, `X-Powered-By` framework disclosure, CSP allowance for inline script/style, long shared-cache TTLs on public authentication pages, and continued review of sensitive local environment-file backups.

**Business impact**

The current exposed posture did not demonstrate a direct path to customer data exposure, account takeover, administrative access, or production data modification. Addressing the hardening items will reduce attack surface, improve compliance posture, and strengthen resilience if a future injection or session-handling issue is introduced.

# Methodology

# Methodology

The assessment followed a low-risk, non-destructive methodology aligned with the **OWASP Web Security Testing Guide**, **PTES**, and source-aware application security review practices.

**Engagement type:** Combined white-box and black-box assessment.

**Scope assessed**

- Production web application: `https://sahamlens.id`
- Local source-code context for the same application

**Operational constraints honored**

- No credential brute forcing or password guessing was performed.
- No denial-of-service, load, or destructive testing was performed.
- No production data was created, updated, or deleted.
- No state-changing production forms were submitted.
- Production checks were limited to passive or low-rate observations, safe `GET`, `HEAD`, and `OPTIONS` requests, browser review, and source-guided validation.

**Activities performed**

- Mapped public pages, administrative routes, authentication flows, and API endpoints.
- Reviewed public files including `robots.txt`, `sitemap.xml`, and PWA metadata.
- Fingerprinted the deployed technology stack and edge controls.
- Reviewed TLS negotiation, redirect behavior, cookies visible without authentication, CORS behavior, caching headers, and browser security headers.
- Performed source-aware architecture mapping across routes, authentication, authorization, sessions, scheduled jobs, data stores, rate limiting, and external trust boundaries.
- Ran static and supply-chain triage including Semgrep, AST-structural mapping, secret scanning, and filesystem dependency/configuration review.
- Evaluated confirmed observations for potential attack chaining; no validated findings existed to combine into a higher-impact attack path.

# Technical Analysis

# Technical Analysis

No vulnerability reports were filed because no issue met the evidence threshold for a concrete, reproducible security impact.

**Application architecture**

The application is a **Next.js App Router** application using TypeScript and React. The assessed source showed separate user-session and administrative authentication flows, server-side API route handlers, scheduled job endpoints, PostgreSQL access through parameterized queries in reviewed examples, Redis-backed cache/rate/budget controls with fallback behavior, and multiple integrations with market data, notification, analytics, AI, and payment-related services.

**Authentication and authorization observations**

- User sessions use an HttpOnly `session` cookie and signed JWT validation.
- Administrative access uses a separate HttpOnly administrative cookie and server-side checks.
- Sampled unauthenticated protected user APIs returned `401`.
- Sampled unauthenticated administrative APIs returned `403`.
- Sampled administrative pages rendered login-gated UI rather than administrative data.
- Source review identified additional areas for future authenticated testing, including portfolio, watchlist, alerts, and account-specific AI features, but no test accounts were available for read-only cross-account validation.

**Configuration observations**

- HTTPS redirection and HSTS were present.
- Security headers were broadly present and consistent across sampled pages.
- CORS checks on sampled public API behavior did not reflect arbitrary origins.
- No unauthenticated `Set-Cookie` headers were observed on sampled public pages and APIs.
- Public debug, source-map, environment, and repository metadata paths sampled from production returned `404`.

**Source-aware scan observations**

- Dependency scanning found no known vulnerable packages in the scanned dependency set.
- Secret scanning produced apparent false positives in client-side calibration code rather than verified secret material.
- Static findings were mostly low-signal hygiene items, test/fixture observations, or hypotheses requiring additional context.
- A low Dockerfile health-check misconfiguration was observed but did not constitute a validated application security vulnerability.

**Inconclusive or hardening-only items**

- TLS 1.0 and TLS 1.1 were accepted by the CDN edge. This is a compliance and hardening concern, but no downgrade exploit or data disclosure was demonstrated.
- Responses disclose `X-Powered-By: Next.js`, which helps fingerprint the framework but does not directly expose restricted information.
- CSP includes `'unsafe-inline'` for scripts and styles. This weakens containment if an XSS bug exists, but no injection point was validated.
- Public authentication and recovery pages returned long shared-cache directives; sampled pages did not expose personalized or reflected sensitive content.
- Source-guided hypotheses such as company-logo proxy SSRF resistance, cron authorization consistency, compute-budget CSRF risk, open-redirect behavior, and authenticated IDOR boundaries should receive deeper controlled testing with test accounts or a staging environment.

# Recommendations

# Recommendations

**Immediate**

1. Disable **TLS 1.0** and **TLS 1.1** at the CDN edge if legacy client support is not a business requirement.
2. Remove framework banner disclosure by disabling the Next.js powered-by header.
3. Review local environment backup files and ensure no secret-bearing `.env` variants are retained in source control, deployment bundles, or developer-shared archives.

**Short-term**

1. Tighten the CSP by replacing inline scripts and styles with nonces, hashes, or framework-supported safe alternatives, then remove `'unsafe-inline'` where feasible.
2. Use `no-store` or short-lived cache headers on authentication, registration, password reset, and account recovery pages as defense-in-depth.
3. Continue enforcing server-side authorization on every `/api/admin/*`, `/api/cron/*`, and identity-owned endpoint; keep UI gating strictly non-authoritative.
4. Add or maintain a public `security.txt` contact file to support coordinated vulnerability disclosure.

**Medium-term**

1. Perform authenticated, read-only authorization testing with dedicated test accounts for portfolio, watchlist, alerts, profile, and subscription-sensitive features.
2. Validate source-guided hypotheses in a staging environment, including company-logo proxy SSRF defenses, cron job authorization consistency, open-redirect handling, reflected XSS surfaces, and compute-budget CSRF resistance.
3. Add automated regression checks for security headers, cache policy on auth pages, unauthenticated admin API denial, and cron endpoint authorization.
4. Consider adding an explicit container health check to improve operational reliability.

**Retest and validation**

After changes are implemented, repeat a low-risk production retest for TLS/header/cache behavior and use a staging environment with test accounts for deeper authenticated authorization and business-logic validation.

