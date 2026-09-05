# SahamLens Desktop — Feature Parity Matrix

**Status:** Baseline M0  
**Source of truth:** public/non-admin routes under `app/**/page.tsx`  
**Rule:** parity means the same user job is available, not that the web page is copied.

## Status vocabulary

- `existing-route`: a desktop static-export route exists, but UX may still mirror web.
- `rewrite-required`: desktop needs a dedicated panel, tab, workspace, or shell treatment.
- `support-surface`: available from desktop as a dialog or safe external page.
- `verified`: acceptance test and desktop QA have passed.
- `excluded`: intentionally unavailable to retail users, with a recorded reason.

A capability may only become `verified` after its automated acceptance test and manual desktop check pass.

## Retail capability matrix

| Web capability       | Web route             | Desktop entry point     | Desktop form                       | Baseline         | MVP acceptance                                                    |
| -------------------- | --------------------- | ----------------------- | ---------------------------------- | ---------------- | ----------------------------------------------------------------- |
| Landing              | `/`                   | Desktop launch          | Workspace home                     | rewrite-required | Opens last safe workspace, not the marketing page                 |
| Home                 | `/home`               | Launch/command palette  | Workspace home                     | rewrite-required | Shows recent tickers, workspaces, watchlist, market/data status   |
| Dashboard            | `/dashboard`          | Ticker tab              | Overview panel                     | existing-route   | Active ticker remains consistent across panels                    |
| Technical            | `/technical/[symbol]` | Ticker tab/Add panel    | Chart panel                        | rewrite-required | Chart and indicators work without a dynamic static route          |
| Fundamental          | `/fundamental`        | Add panel/command       | Fundamental panel                  | existing-route   | Uses active ticker and preserves provenance/freshness             |
| Ownership Flow       | `/ownership-flow`     | Add panel/command       | Ownership panel                    | existing-route   | Uses active ticker; official/proxy status remains visible         |
| Compare              | `/compare`            | Command/Add panel       | Compare panel                      | existing-route   | Compares selected tickers without leaving workspace               |
| Screener             | `/screener`           | Navigator/command       | Screener workspace                 | existing-route   | Result opens ticker in current/new internal tab                   |
| LensRadar            | `/breakout-radar`     | Navigator/command       | Radar workspace                    | existing-route   | Candidate opens with restriction and freshness context            |
| Market Pulse         | `/market-pulse`       | Navigator/context bar   | Market panel                       | existing-route   | Market status/as-of is visible and delayed data is labelled       |
| Market category      | `/market/[category]`  | Market panel filter     | Market subview                     | existing-route   | Category changes inside workspace without broken static routing   |
| Pattern              | `/pattern`            | Add panel/command       | Pattern panel                      | existing-route   | Pattern evidence and limitations use active ticker                |
| Valuation/DCF        | `/dcf`                | Add panel/command       | Valuation panel                    | existing-route   | Inputs/results persist per ticker tab; estimates labelled         |
| Backtest             | `/backtest`           | Add panel/command       | Backtest panel                     | existing-route   | Shows sample, period, bias, and limitations                       |
| Risk overview        | `/risk`               | Inspector/Add panel     | Risk panel                         | existing-route   | Risk appears beside opportunity context                           |
| Risk calculator      | `/risk-calculator`    | Risk panel action       | Tool panel                         | existing-route   | Inputs remain local to tab and no trade instruction is produced   |
| Watchlist            | `/watchlist`          | Navigator               | Watchlist panel                    | existing-route   | Item opens in current/new ticker tab                              |
| Portfolio            | `/portfolio`          | Navigator/Add panel     | Portfolio workspace                | existing-route   | Sensitive holdings are not written to diagnostics                 |
| Recommendations      | `/recommendations`    | Navigator/command       | Educational decision-support panel | existing-route   | Evidence, risk, freshness, and limitations precede any conclusion |
| LensAI               | shared LensAI surface | `Ctrl/Cmd+J`            | Inspector/drawer                   | rewrite-required | Receives allowed ticker/panel context, never bearer token         |
| Multi-agent research | `/multi-agent`        | LensAI/command          | Research workspace                 | existing-route   | Clearly separates facts, inference, assumptions, and missing data |
| News                 | `/news`               | Add panel/command       | News/events panel                  | existing-route   | Source, published time, and external domain remain visible        |
| Calendar             | `/calendar`           | Add panel/command       | Calendar panel                     | existing-route   | Event dates and source are visible in active context              |
| Earnings             | `/earnings`           | Calendar/Fundamental    | Earnings subview                   | existing-route   | Reporting period and as-of are explicit                           |
| Dividend             | `/dividend`           | Fundamental/Calendar    | Dividend subview                   | existing-route   | Ex-date/payment context and source remain visible                 |
| Macro                | `/macro`              | Navigator/Add panel     | Macro panel                        | existing-route   | Source/as-of and assumption status are visible                    |
| Moat                 | `/moat`               | Fundamental panel       | Moat subview                       | existing-route   | Qualitative evidence is distinguished from official facts         |
| Transparency         | `/transparency`       | Help/Evidence inspector | Support panel                      | existing-route   | Public methodology/status stays accessible                        |
| Service status       | `/status`             | Activity dock/Help      | Status panel                       | existing-route   | Shows app version, connection, and sanitized request ID           |
| About                | `/about`              | Help                    | Support dialog                     | support-surface  | Accessible without disrupting workspace                           |
| Disclaimer           | `/disclaimer`         | Help/contextual links   | Support dialog                     | support-surface  | Available near material decision-support                          |
| Privacy              | `/privacy`            | Settings/Help           | Support dialog or safe external    | support-surface  | Policy opens from desktop and states desktop telemetry behavior   |
| Terms                | `/terms`              | Settings/Help           | Support dialog or safe external    | support-surface  | Terms remain accessible                                           |
| Login                | `/login`              | Account                 | Native-aware auth dialog           | existing-route   | Session enters OS credential vault; no token in renderer storage  |
| Signup               | `/signup`             | Account                 | Auth dialog/support route          | existing-route   | Account creation returns safely to workspace                      |
| Forgot password      | `/forgot-password`    | Auth dialog             | Support route                      | existing-route   | Recovery flow can complete safely                                 |
| Reset password       | `/reset-password`     | Recovery link           | Support route                      | existing-route   | Token handling does not leak into logs/diagnostics                |
| Login required       | `/login-required`     | Protected capability    | Inline state/dialog                | existing-route   | Explains account requirement without a paid-tier message          |

## Intentionally excluded from retail parity

| Capability              | Reason                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| `/admin/**` routes      | Operator-only controls and diagnostics are not retail product capabilities |
| `/docs/admin/**` routes | Internal/operator documentation                                            |
| `/_workbench`           | Development-only UI workbench                                              |
| Direct broker execution | Outside educational scope and explicitly excluded by the PRD               |

## Cross-capability contracts

Every research capability must preserve:

1. active ticker context;
2. source and as-of when supplied;
3. freshness and coverage semantics;
4. missing versus valid zero;
5. official, proxy, estimated, and derived distinctions;
6. restriction, suspension, UMA, and investability state when supplied;
7. request ID on diagnosable failures;
8. keyboard reachability;
9. safe behavior at 1024 × 700;
10. educational, risk-first language without Buy/Sell calls to action.

## Matrix governance

- Owner: Product/engineering until module owners are assigned.
- Update this matrix in the same PR that adds, removes, or materially changes a public web capability.
- A future source audit must strip comments, normalize path separators, and assert a non-zero/minimum route count.
- Static-export presence alone does not count as verified desktop parity.
