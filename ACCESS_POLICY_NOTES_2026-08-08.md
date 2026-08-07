# SahamLens Access Policy Patch

Target:
- Discover = public/guest:
  - Beranda
  - LensMarket
  - Transparansi
  - LensRadar
  - LensScanner
- Analyze = login required:
  - LensTechnical
  - LensFundamental
  - Compare
  - Backtest
- LensAI = login required both navigation route and `/api/chat`
- Monitor public items already marked guest remain public (Calendar, Berita)
- Admin remains protected

LensAI persona:
- Uses name LensAI / LensAI dari SahamLens
- Does not claim "senior pasar modal"

AI provider audit (NOT changed by this patch):
- Current `lib/aiProviders.ts` is deterministic priority cascade, NOT random.
- `buildCombos()` sorts by MODEL_PRIORITY.
- Tests explicitly assert fixed deterministic order.
