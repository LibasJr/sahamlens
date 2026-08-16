SahamLens Bank Fundamental Auto Collector - CI Fix
Date: 2026-08-16

Files:
- scripts/collect-bank-metric-evidence-auto.mjs
- app/api/cron/bank-fundamental-collect/route.ts

Fixes:
1. Adds explicit JSDoc typing for MetricExtractionOptions so periodEnd accepts string|null under checkJs/strict TypeScript.
2. Converts CollectorResult to a plain Record via object spread before passing it to recordDataSourceHealth(detail).

No financial logic, extraction thresholds, scoring, or database behavior changed.
