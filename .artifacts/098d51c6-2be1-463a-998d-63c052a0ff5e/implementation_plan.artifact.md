# Implementation Plan - Total Refactor to Full TypeScript

This plan outlines the steps to remove the Python backend and migrate the entire project to a unified TypeScript stack using Next.js App Router, Vercel AI SDK (Gemini), and `yahoo-finance2`.

## User Review Required

> [!IMPORTANT]
> This refactor will DELETE all Python code in the `/backend` folder. Ensure you have backups if you need to reference any specific logic later.
> You will need to provide a `GOOGLE_GENERATIVE_AI_API_KEY` in your `.env` file for the AI agents to work.

## Proposed Changes

### 1. Cleanup & Dependencies
#### [DELETE] `/backend`
#### [DELETE] `requirements.txt`
#### [DELETE] `main.py`
#### [DELETE] `replace_fetches.js`
#### [MODIFY] [package.json](file:///C:/xampp/htdocs/trading/package.json)
- Add `yahoo-finance2`, `ai`, `@ai-sdk/google`, `lucide-react`, `date-fns-tz`.

### 2. Live Data API
#### [NEW] [route.ts](file:///C:/xampp/htdocs/trading/app/api/live/%5Bticker%5D/route.ts)
- Proxy for Yahoo Finance using `yahoo-finance2` or raw fetch with headers.
- Handles market hours (09:00 - 15:00 WIB).
- Provides fallback for rate limiting.

### 3. AI Agents System (10 Agents)
#### [NEW] `app/api/agents/`
- `technical-agent/route.ts`: EMA, RSI, MACD.
- `bandar-agent/route.ts`: Accumulation/Distribution.
- `fundamental-agent/route.ts`: IDX Ratios.
- `risk-agent/route.ts`: Stop Loss & Risk analysis.
- `news-agent/route.ts`: Sentiment.
- `flow-agent/route.ts`: Money Flow.
- `pattern-agent/route.ts`: Chart Patterns.
- `valuation-agent/route.ts`: Fair Value.
- `momentum-agent/route.ts`: 1m/5m/15m analysis.
- `orchestrator/route.ts`: Parallel execution of all 9 agents + Final Consensus.

### 4. Frontend Integration
#### [MODIFY] [page.tsx](file:///C:/xampp/htdocs/trading/app/page.tsx)
- Standardize fetching to the new `/api/live` and `/api/agents/orchestrator`.
- Implement polling (1m interval) only when market is open.
- Add UI elements: Manual Refresh, Market Status Badge, Delay indicator.

## Verification Plan

### Automated Tests
- `npm run build` to ensure type safety and successful compilation.
- Test `/api/live/BBCA.JK` via browser/curl.
- Test `/api/agents/orchestrator` with a sample ticker.

### Manual Verification
- Verify the dashboard updates correctly with live data.
- Check that polling stops outside market hours.
- Verify the 10-agent consensus is displayed.
